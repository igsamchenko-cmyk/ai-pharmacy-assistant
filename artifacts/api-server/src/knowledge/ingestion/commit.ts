import { normalize } from "../../lib/text";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import {
  analyzeImport,
  liveKnowledgeView,
  type KnowledgeView,
  type ImportPreview,
} from "../import/analyze";
import { findCopyrightedSources } from "../import/guard";
import { deriveReviewStatus } from "../import/review";
import { nameTypeToKind, type ImportRow } from "../import/format";
import type { ImportRowError } from "../import/parse";
import { registryRowHash, type RegistryRawRow } from "./registry";

export interface ReviewableImportRow {
  row: ImportRow;
  reviewStatus: ReturnType<typeof deriveReviewStatus>;
  conflictFlags: string[];
  validationWarnings: string[];
}

export interface ReviewableImportPlan {
  preview: ImportPreview;
  reviewable: ReviewableImportRow[];
  blocked: string[];
}

export interface KnowledgeImportCommitStore {
  writeBatch(
    rows: readonly ReviewableImportRow[],
    batchId: string,
    options?: MappingCommitOptions,
  ): Promise<MappingCommitStats>;
  writeRegistryProducts?(
    rows: readonly RegistryRawRow[],
    batchId: string,
  ): Promise<RegistryProductCommitStats>;
  close?(): Promise<void>;
}

export interface MappingCommitProgress {
  stage: "mapping_chunk";
  chunk: number;
  chunks: number;
  attempted: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  elapsedMs: number;
  lastCompletedChunkAt: string;
}

export interface MappingCommitOptions {
  approvedOnly?: boolean;
  chunkSize?: number;
  statementTimeoutMs?: number;
  lockTimeoutMs?: number;
  stageTimeoutMs?: number;
  onProgress?: (progress: MappingCommitProgress) => void;
}

export interface MappingCommitStats {
  plannedRows: number;
  uniqueNormalizedMappings: number;
  attempted: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  chunks: number;
  chunkSize: number;
  elapsedMs: number;
  finalMappingCount: number;
  finalApprovedMappingCount: number;
  importBatchStatus: "completed";
}

export interface RegistryProductCommitStats {
  plannedProducts: number;
  plannedManufacturers: number;
  plannedRegistrations: number;
  attemptedProducts: number;
  attemptedManufacturers: number;
  insertedProducts: number;
  insertedManufacturers: number;
  updatedProducts: number;
  updatedManufacturers: number;
  staleMarkedProducts?: number;
  staleMarkedManufacturers?: number;
  unchangedProducts: number;
  unchangedManufacturers: number;
  skippedProducts: number;
  skippedManufacturers: number;
  failedProducts: number;
  failedManufacturers: number;
  chunks: number;
  chunkSize: number;
  finalProductCount: number;
  finalManufacturerCount: number;
  finalRegistrationCount: number;
  elapsedMs: number;
  importBatchStatus: "completed";
  committedProducts: number;
  committedManufacturers: number;
}

function encodeList(values: readonly string[]): string {
  return values.length > 0 ? JSON.stringify([...values]) : "";
}

function confidenceScore(confidence: ImportRow["confidence"]): number {
  switch (confidence) {
    case "verified":
      return 100;
    case "high":
      return 85;
    case "medium":
      return 60;
    case "low":
      return 30;
  }
}

function registryIdFor(row: RegistryRawRow): string {
  return (
    row.registryId ||
    row.registrationNumber ||
    registryRowHash(row).slice(0, 32)
  );
}

function sourceSnapshotHashFromBatchId(batchId: string): string | null {
  return (
    batchId.match(/^registry-sync-([a-f0-9]{64})-/i)?.[1]?.toLowerCase() ?? null
  );
}

function registryProductValue(row: RegistryRawRow, batchId: string) {
  const sourceSnapshotHash = sourceSnapshotHashFromBatchId(batchId);
  return {
    registryId: registryIdFor(row),
    tradeName: row.tradeName,
    normalizedTradeName: normalize(row.tradeName),
    inn: row.inn,
    activeIngredient: row.activeIngredient,
    atcCode: row.atcCode || null,
    form: row.form,
    strength: row.strength,
    applicantName: row.applicantName,
    applicantCountry: row.applicantCountry,
    registrationNumber: row.registrationNumber,
    registrationStartDate: row.registrationStartDate,
    registrationEndDate: row.registrationEndDate,
    earlyTermination: row.earlyTermination,
    instructionUrl: row.instructionUrl || null,
    sourceKey: row.sourceId,
    reviewStatus: "pending",
    currentStatus: "current",
    sourceSnapshotHash,
    lastSeenAt: new Date(),
    importBatchId: batchId,
    rawHash: registryRowHash(row),
  };
}

function registryManufacturerValues(row: RegistryRawRow, batchId: string) {
  const productRegistryId = registryIdFor(row);
  const sourceSnapshotHash = sourceSnapshotHashFromBatchId(batchId);
  return row.manufacturers
    .filter((manufacturer) => Boolean(manufacturer.name))
    .map((manufacturer) => ({
      productRegistryId,
      name: manufacturer.name,
      normalizedName: normalize(manufacturer.name),
      country: manufacturer.country,
      sourceKey: row.sourceId,
      currentStatus: "current",
      sourceSnapshotHash,
      lastSeenAt: new Date(),
      importBatchId: batchId,
    }));
}

type RegistryProductValue = ReturnType<typeof registryProductValue>;
type RegistryManufacturerValue = ReturnType<
  typeof registryManufacturerValues
>[number];

function uniqueRegistryProductValues(
  values: readonly RegistryProductValue[],
): RegistryProductValue[] {
  const unique = new Map<string, RegistryProductValue>();
  for (const value of values) {
    if (!unique.has(value.registryId)) unique.set(value.registryId, value);
  }
  return [...unique.values()];
}

function uniqueRegistryManufacturerValues(
  values: readonly RegistryManufacturerValue[],
): RegistryManufacturerValue[] {
  const unique = new Map<string, RegistryManufacturerValue>();
  for (const value of values) {
    unique.set(
      `${value.productRegistryId}\u0000${value.normalizedName}\u0000${value.country}`,
      value,
    );
  }
  return [...unique.values()];
}

function chunkRows<T>(rows: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function registryProductChunkSize(): number {
  const parsed = Number.parseInt(
    process.env.REGISTRY_PRODUCT_IMPORT_CHUNK_SIZE ?? "",
    10,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
}

function registryProductStatementTimeoutMs(): number {
  const parsed = Number.parseInt(
    process.env.REGISTRY_PRODUCT_IMPORT_STATEMENT_TIMEOUT_MS ?? "",
    10,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
}

function positiveEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function mappingChunkSize(): number {
  return positiveEnv("REGISTRY_MAPPING_IMPORT_CHUNK_SIZE", 250);
}

function mappingStatementTimeoutMs(): number {
  return positiveEnv("REGISTRY_MAPPING_IMPORT_STATEMENT_TIMEOUT_MS", 60_000);
}

function mappingLockTimeoutMs(): number {
  return positiveEnv("REGISTRY_MAPPING_IMPORT_LOCK_TIMEOUT_MS", 10_000);
}

function mappingStageTimeoutMs(): number {
  return positiveEnv("REGISTRY_MAPPING_IMPORT_STAGE_TIMEOUT_MS", 600_000);
}

interface PreparedMappingValue {
  normalized: string;
  name: string;
  kind: ReturnType<typeof nameTypeToKind>;
  ingredientInnKey: string;
  ingredientInn: string;
  atcCode: string | null;
  sourceKey: string;
  locale: string;
  confidence: ImportRow["confidence"];
  confidenceScore: number;
  reviewStatus: ReviewableImportRow["reviewStatus"];
  conflictFlags: string;
  validationWarnings: string;
  importBatchId: string;
}

function prepareMappingValues(
  rows: readonly ReviewableImportRow[],
  batchId: string,
  approvedOnly: boolean,
): { values: PreparedMappingValue[]; duplicates: number } {
  const unique = new Map<string, PreparedMappingValue>();
  let duplicates = 0;

  for (const item of rows) {
    if (approvedOnly && item.reviewStatus !== "approved") {
      throw new Error(
        "Approved-only mapping commit received a non-approved review status.",
      );
    }
    if (
      approvedOnly &&
      item.conflictFlags.some((flag) =>
        ["name_multiple_ingredients", "brand_conflicting_inn"].includes(flag),
      )
    ) {
      throw new Error("Approved-only mapping commit contains hard conflicts.");
    }

    const normalized = normalize(item.row.name);
    const ingredientInnKey = normalize(item.row.canonicalInn);
    if (!normalized || !ingredientInnKey) {
      throw new Error("Mapping commit contains an invalid natural key.");
    }
    const value: PreparedMappingValue = {
      normalized,
      name: item.row.name,
      kind: nameTypeToKind(item.row.nameType),
      ingredientInnKey,
      ingredientInn: item.row.canonicalInn,
      atcCode: item.row.atcCode ?? null,
      sourceKey: item.row.sourceId,
      locale: item.row.locale,
      confidence: item.row.confidence,
      confidenceScore: confidenceScore(item.row.confidence),
      reviewStatus: item.reviewStatus,
      conflictFlags: encodeList(item.conflictFlags),
      validationWarnings: encodeList(item.validationWarnings),
      importBatchId: batchId,
    };
    const prior = unique.get(normalized);
    if (prior) {
      if (prior.ingredientInnKey !== ingredientInnKey) {
        throw new Error("Mapping commit contains conflicting natural keys.");
      }
      duplicates++;
      continue;
    }
    unique.set(normalized, value);
  }

  return { values: [...unique.values()], duplicates };
}

export function buildReviewableImportPlan(
  rows: readonly ImportRow[],
  errors: readonly ImportRowError[] = [],
  view: KnowledgeView = liveKnowledgeView(),
): ReviewableImportPlan {
  const preview = analyzeImport(rows, view, errors);
  const copyrightRows = new Set(
    findCopyrightedSources(rows).map((violation) => violation.row - 1),
  );
  const nameToInn = new Map(view.existingNameToInn);
  const reviewable: ReviewableImportRow[] = [];

  rows.forEach((row, idx) => {
    if (copyrightRows.has(idx)) return;
    const nameKey = normalize(row.name);
    const innKey = normalize(row.canonicalInn);
    const prior = nameToInn.get(nameKey);
    const hasConflict = prior !== undefined && prior !== innKey;
    const unknownSource = !view.isKnownSource(row.sourceId);
    if (prior === undefined) nameToInn.set(nameKey, innKey);

    const reviewStatus = deriveReviewStatus(row, {
      unknownSource,
      hasConflict,
    });
    const conflictFlags: string[] = [];
    const validationWarnings: string[] = [];

    if (hasConflict) conflictFlags.push("name_multiple_ingredients");
    if (row.nameType === "brand")
      validationWarnings.push("brand_review_required");
    if (row.nameType === "typo")
      validationWarnings.push("typo_requires_review");
    if (row.confidence === "low")
      validationWarnings.push("low_confidence_review");
    if (unknownSource) validationWarnings.push("unknown_source_rejected");
    if (reviewStatus === "pending")
      validationWarnings.push("human_review_pending");
    if (row.notes?.includes("generated"))
      validationWarnings.push("generated_candidate");
    if (row.notes?.includes("search miss"))
      validationWarnings.push("search_miss_candidate");

    reviewable.push({ row, reviewStatus, conflictFlags, validationWarnings });
  });

  const blocked: string[] = [];
  if (preview.parseErrors > 0) blocked.push("parse_errors");
  if (preview.copyrightViolations > 0) blocked.push("copyright_violations");
  if (preview.missingSources > 0) blocked.push("missing_sources");
  if (preview.invalidAtc > 0) blocked.push("invalid_atc");
  if (
    preview.conflicts.some(
      (conflict) =>
        conflict.type === "name_multiple_ingredients" ||
        conflict.type === "brand_conflicting_inn",
    )
  ) {
    blocked.push("hard_conflicts");
  }

  return { preview, reviewable, blocked };
}

export async function createDbCommitStore(): Promise<KnowledgeImportCommitStore> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for --commit.");
  }
  const {
    db,
    pool,
    knowledgeIngredientsTable,
    knowledgeIngredientNamesTable,
    knowledgeRegistryManufacturersTable,
    knowledgeRegistryProductsTable,
  } = await import("@workspace/db");

  return {
    async writeBatch(rows, batchId, options = {}) {
      const startedAt = Date.now();
      const chunkSize = options.chunkSize ?? mappingChunkSize();
      const statementTimeoutMs =
        options.statementTimeoutMs ?? mappingStatementTimeoutMs();
      const lockTimeoutMs = options.lockTimeoutMs ?? mappingLockTimeoutMs();
      const stageTimeoutMs = options.stageTimeoutMs ?? mappingStageTimeoutMs();
      const prepared = prepareMappingValues(
        rows,
        batchId,
        options.approvedOnly ?? false,
      );
      const chunks = chunkRows(prepared.values, chunkSize);
      let attempted = 0;
      let inserted = 0;
      let unchanged = 0;

      for (const [chunkIndex, chunk] of chunks.entries()) {
        if (Date.now() - startedAt >= stageTimeoutMs) {
          throw new Error("Approved mapping commit stage timed out.");
        }

        await db.transaction(async (tx) => {
          await tx.execute(
            sql`select set_config('statement_timeout', ${`${statementTimeoutMs}ms`}, true)`,
          );
          await tx.execute(
            sql`select set_config('lock_timeout', ${`${lockTimeoutMs}ms`}, true)`,
          );

          const normalizedNames = chunk.map((value) => value.normalized);
          const existingRows = await tx
            .select({
              normalized: knowledgeIngredientNamesTable.normalized,
              ingredientInnKey: knowledgeIngredientNamesTable.ingredientInnKey,
              reviewStatus: knowledgeIngredientNamesTable.reviewStatus,
            })
            .from(knowledgeIngredientNamesTable)
            .where(
              inArray(
                knowledgeIngredientNamesTable.normalized,
                normalizedNames,
              ),
            );
          const existingByName = new Map(
            existingRows.map((row) => [row.normalized, row]),
          );

          const assertCompatible = (
            value: PreparedMappingValue,
            existing: {
              ingredientInnKey: string;
              reviewStatus: string;
            },
          ): void => {
            if (existing.ingredientInnKey !== value.ingredientInnKey) {
              throw new Error(
                "Mapping commit conflicts with an existing ingredient mapping.",
              );
            }
            if (options.approvedOnly && existing.reviewStatus !== "approved") {
              throw new Error(
                "Approved-only mapping commit conflicts with a non-approved existing mapping.",
              );
            }
          };
          for (const value of chunk) {
            const existing = existingByName.get(value.normalized);
            if (existing) assertCompatible(value, existing);
          }

          const newValues = chunk.filter(
            (value) => !existingByName.has(value.normalized),
          );
          const ingredients = [
            ...new Map(
              newValues.map((value) => [
                value.ingredientInnKey,
                {
                  innKey: value.ingredientInnKey,
                  inn: value.ingredientInn,
                  atcCode: value.atcCode,
                  sourceKey: value.sourceKey,
                  evidenceLevel: "reference",
                },
              ]),
            ).values(),
          ];
          if (ingredients.length > 0) {
            await tx
              .insert(knowledgeIngredientsTable)
              .values(ingredients)
              .onConflictDoNothing({
                target: knowledgeIngredientsTable.innKey,
              });
          }

          if (newValues.length > 0) {
            const insertedRows = await tx
              .insert(knowledgeIngredientNamesTable)
              .values(
                newValues.map(
                  ({
                    ingredientInn: _ingredientInn,
                    atcCode: _atcCode,
                    ...value
                  }) => ({
                    ...value,
                    evidenceLevel: "reference",
                  }),
                ),
              )
              .onConflictDoNothing({
                target: knowledgeIngredientNamesTable.normalized,
              })
              .returning({
                normalized: knowledgeIngredientNamesTable.normalized,
              });
            inserted += insertedRows.length;
            const insertedNames = new Set(
              insertedRows.map((row) => row.normalized),
            );
            const concurrentValues = newValues.filter(
              (value) => !insertedNames.has(value.normalized),
            );
            if (concurrentValues.length > 0) {
              const concurrentRows = await tx
                .select({
                  normalized: knowledgeIngredientNamesTable.normalized,
                  ingredientInnKey:
                    knowledgeIngredientNamesTable.ingredientInnKey,
                  reviewStatus: knowledgeIngredientNamesTable.reviewStatus,
                })
                .from(knowledgeIngredientNamesTable)
                .where(
                  inArray(
                    knowledgeIngredientNamesTable.normalized,
                    concurrentValues.map((value) => value.normalized),
                  ),
                );
              const concurrentByName = new Map(
                concurrentRows.map((row) => [row.normalized, row]),
              );
              for (const value of concurrentValues) {
                const concurrent = concurrentByName.get(value.normalized);
                if (!concurrent) {
                  throw new Error(
                    "Mapping commit could not verify a concurrent natural key.",
                  );
                }
                assertCompatible(value, concurrent);
              }
              unchanged += concurrentValues.length;
            }
          }
          unchanged += existingRows.length;
          attempted += chunk.length;
        });

        try {
          options.onProgress?.({
            stage: "mapping_chunk",
            chunk: chunkIndex + 1,
            chunks: chunks.length,
            attempted,
            inserted,
            updated: 0,
            unchanged,
            skipped: prepared.duplicates,
            failed: 0,
            elapsedMs: Date.now() - startedAt,
            lastCompletedChunkAt: new Date().toISOString(),
          });
        } catch {
          // Progress observers cannot affect a persisted chunk.
        }
      }

      const [mappingCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(knowledgeIngredientNamesTable);
      const [approvedCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(knowledgeIngredientNamesTable)
        .where(sql`${knowledgeIngredientNamesTable.reviewStatus} = 'approved'`);

      return {
        plannedRows: rows.length,
        uniqueNormalizedMappings: prepared.values.length,
        attempted,
        inserted,
        updated: 0,
        unchanged,
        skipped: prepared.duplicates,
        failed: 0,
        chunks: chunks.length,
        chunkSize,
        elapsedMs: Date.now() - startedAt,
        finalMappingCount: Number(mappingCount?.count ?? 0),
        finalApprovedMappingCount: Number(approvedCount?.count ?? 0),
        importBatchStatus: "completed",
      };
    },
    async writeRegistryProducts(rows, batchId) {
      const startedAt = Date.now();
      const chunkSize = registryProductChunkSize();
      const chunks = chunkRows(rows, chunkSize);
      const plannedManufacturers = rows.reduce(
        (count, row) =>
          count +
          row.manufacturers.filter((manufacturer) => manufacturer.name).length,
        0,
      );
      const plannedRegistrations = new Set(
        rows.map((row) => row.registrationNumber).filter(Boolean),
      ).size;
      let insertedProducts = 0;
      let updatedProducts = 0;
      let unchangedProducts = 0;
      let skippedProducts = 0;
      let insertedManufacturers = 0;
      let updatedManufacturers = 0;

      let staleMarkedProducts = 0;
      let staleMarkedManufacturers = 0;
      await db.transaction(async (tx) => {
        for (const chunk of chunks) {
          await tx.execute(
            sql`select set_config('statement_timeout', ${`${registryProductStatementTimeoutMs()}ms`}, true)`,
          );
          const rawProductValues = chunk.map((row) =>
            registryProductValue(row, batchId),
          );
          const productValues = uniqueRegistryProductValues(rawProductValues);
          skippedProducts += rawProductValues.length - productValues.length;
          const registryIds = productValues.map((value) => value.registryId);
          const existingRows =
            registryIds.length > 0
              ? await tx
                  .select({
                    registryId: knowledgeRegistryProductsTable.registryId,
                    rawHash: knowledgeRegistryProductsTable.rawHash,
                  })
                  .from(knowledgeRegistryProductsTable)
                  .where(
                    inArray(
                      knowledgeRegistryProductsTable.registryId,
                      registryIds,
                    ),
                  )
              : [];
          const existingById = new Map(
            existingRows.map((row) => [row.registryId, row.rawHash]),
          );
          const newProductValues = productValues.filter(
            (value) => !existingById.has(value.registryId),
          );
          const changedProductValues = productValues.filter(
            (value) =>
              existingById.has(value.registryId) &&
              existingById.get(value.registryId) !== value.rawHash,
          );
          unchangedProducts +=
            productValues.length -
            newProductValues.length -
            changedProductValues.length;
          const changedRegistryIds = changedProductValues.map(
            (value) => value.registryId,
          );

          if (changedRegistryIds.length > 0) {
            const staleManufacturers = await tx
              .update(knowledgeRegistryManufacturersTable)
              .set({ currentStatus: "stale" })
              .where(
                and(
                  inArray(
                    knowledgeRegistryManufacturersTable.productRegistryId,
                    changedRegistryIds,
                  ),
                  ne(
                    knowledgeRegistryManufacturersTable.currentStatus,
                    "stale",
                  ),
                ),
              )
              .returning({ id: knowledgeRegistryManufacturersTable.id });
            staleMarkedManufacturers += staleManufacturers.length;
          }

          if (newProductValues.length > 0) {
            const inserted = await tx
              .insert(knowledgeRegistryProductsTable)
              .values(newProductValues)
              .onConflictDoNothing({
                target: knowledgeRegistryProductsTable.registryId,
              })
              .returning({
                registryId: knowledgeRegistryProductsTable.registryId,
              });
            insertedProducts += inserted.length;
            skippedProducts += newProductValues.length - inserted.length;
          }

          if (changedProductValues.length > 0) {
            const updated = await tx
              .insert(knowledgeRegistryProductsTable)
              .values(changedProductValues)
              .onConflictDoUpdate({
                target: knowledgeRegistryProductsTable.registryId,
                set: {
                  tradeName: sql`excluded.trade_name`,
                  normalizedTradeName: sql`excluded.normalized_trade_name`,
                  inn: sql`excluded.inn`,
                  activeIngredient: sql`excluded.active_ingredient`,
                  atcCode: sql`excluded.atc_code`,
                  form: sql`excluded.form`,
                  strength: sql`excluded.strength`,
                  applicantName: sql`excluded.applicant_name`,
                  applicantCountry: sql`excluded.applicant_country`,
                  registrationNumber: sql`excluded.registration_number`,
                  registrationStartDate: sql`excluded.registration_start_date`,
                  registrationEndDate: sql`excluded.registration_end_date`,
                  earlyTermination: sql`excluded.early_termination`,
                  instructionUrl: sql`excluded.instruction_url`,
                  sourceKey: sql`excluded.source_key`,
                  reviewStatus: sql`excluded.review_status`,
                  currentStatus: sql`excluded.current_status`,
                  sourceSnapshotHash: sql`excluded.source_snapshot_hash`,
                  lastSeenAt: sql`excluded.last_seen_at`,
                  importBatchId: sql`excluded.import_batch_id`,
                  rawHash: sql`excluded.raw_hash`,
                  updatedAt: sql`now()`,
                },
              })
              .returning({
                registryId: knowledgeRegistryProductsTable.registryId,
              });
            updatedProducts += updated.length;
          }

          if (productValues.length > 0) {
            const sourceSnapshotHash = sourceSnapshotHashFromBatchId(batchId);
            await tx
              .update(knowledgeRegistryProductsTable)
              .set({
                reviewStatus: "pending",
                currentStatus: "current",
                lastSeenAt: new Date(),
                importBatchId: batchId,
                ...(sourceSnapshotHash ? { sourceSnapshotHash } : {}),
              })
              .where(
                inArray(
                  knowledgeRegistryProductsTable.registryId,
                  productValues.map((value) => value.registryId),
                ),
              );
          }

          const manufacturerValues = uniqueRegistryManufacturerValues(
            chunk.flatMap((row) => registryManufacturerValues(row, batchId)),
          );
          const changedRegistryIdSet = new Set(changedRegistryIds);
          const stableManufacturerValues = manufacturerValues.filter(
            (value) => !changedRegistryIdSet.has(value.productRegistryId),
          );
          const changedManufacturerValues = manufacturerValues.filter((value) =>
            changedRegistryIdSet.has(value.productRegistryId),
          );
          if (stableManufacturerValues.length > 0) {
            const inserted = await tx
              .insert(knowledgeRegistryManufacturersTable)
              .values(stableManufacturerValues)
              .onConflictDoNothing({
                target: [
                  knowledgeRegistryManufacturersTable.productRegistryId,
                  knowledgeRegistryManufacturersTable.normalizedName,
                  knowledgeRegistryManufacturersTable.country,
                ],
              })
              .returning({ id: knowledgeRegistryManufacturersTable.id });
            insertedManufacturers += inserted.length;
          }
          if (changedManufacturerValues.length > 0) {
            const updated = await tx
              .insert(knowledgeRegistryManufacturersTable)
              .values(changedManufacturerValues)
              .onConflictDoUpdate({
                target: [
                  knowledgeRegistryManufacturersTable.productRegistryId,
                  knowledgeRegistryManufacturersTable.normalizedName,
                  knowledgeRegistryManufacturersTable.country,
                ],
                set: {
                  name: sql`excluded.name`,
                  sourceKey: sql`excluded.source_key`,
                  currentStatus: sql`excluded.current_status`,
                  sourceSnapshotHash: sql`excluded.source_snapshot_hash`,
                  lastSeenAt: sql`excluded.last_seen_at`,
                  importBatchId: sql`excluded.import_batch_id`,
                },
              })
              .returning({ id: knowledgeRegistryManufacturersTable.id });
            updatedManufacturers += updated.length;
          }
        }
        const sourceSnapshotHash = sourceSnapshotHashFromBatchId(batchId);
        if (sourceSnapshotHash) {
          const sourceIds = new Set(rows.map((row) => row.sourceId));
          const sourceId = rows[0]?.sourceId;
          if (!sourceId || sourceIds.size !== 1) {
            throw new Error(
              "Atomic registry sync requires exactly one source.",
            );
          }

          const staleProducts = await tx
            .update(knowledgeRegistryProductsTable)
            .set({
              currentStatus: "stale",
              reviewStatus: "stale",
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(knowledgeRegistryProductsTable.sourceKey, sourceId),
                ne(knowledgeRegistryProductsTable.reviewStatus, "stale"),
                sql`${knowledgeRegistryProductsTable.importBatchId} IS DISTINCT FROM ${batchId}`,
              ),
            )
            .returning({
              registryId: knowledgeRegistryProductsTable.registryId,
            });
          staleMarkedProducts += staleProducts.length;

          const expectedValues = uniqueRegistryProductValues(
            rows.map((row) => registryProductValue(row, batchId)),
          );
          const expectedById = new Map(
            expectedValues.map((value) => [value.registryId, value] as const),
          );
          const currentRows = await tx
            .select({
              registryId: knowledgeRegistryProductsTable.registryId,
              rawHash: knowledgeRegistryProductsTable.rawHash,
              sourceSnapshotHash:
                knowledgeRegistryProductsTable.sourceSnapshotHash,
              importBatchId: knowledgeRegistryProductsTable.importBatchId,
            })
            .from(knowledgeRegistryProductsTable)
            .where(
              and(
                eq(knowledgeRegistryProductsTable.sourceKey, sourceId),
                ne(knowledgeRegistryProductsTable.reviewStatus, "stale"),
              ),
            );
          const expectedManufacturerValues = uniqueRegistryManufacturerValues(
            rows.flatMap((row) => registryManufacturerValues(row, batchId)),
          );
          const expectedManufacturerKeys = new Set(
            expectedManufacturerValues.map((value) =>
              JSON.stringify([
                value.productRegistryId,
                value.name,
                value.normalizedName,
                value.country,
              ]),
            ),
          );
          const currentManufacturerRows = await tx
            .select({
              productRegistryId:
                knowledgeRegistryManufacturersTable.productRegistryId,
              name: knowledgeRegistryManufacturersTable.name,
              normalizedName:
                knowledgeRegistryManufacturersTable.normalizedName,
              country: knowledgeRegistryManufacturersTable.country,
            })
            .from(knowledgeRegistryManufacturersTable)
            .innerJoin(
              knowledgeRegistryProductsTable,
              eq(
                knowledgeRegistryManufacturersTable.productRegistryId,
                knowledgeRegistryProductsTable.registryId,
              ),
            )
            .where(
              and(
                eq(knowledgeRegistryProductsTable.sourceKey, sourceId),
                ne(knowledgeRegistryProductsTable.reviewStatus, "stale"),
                ne(knowledgeRegistryManufacturersTable.currentStatus, "stale"),
              ),
            );
          const exactManufacturerSnapshot =
            currentManufacturerRows.length === expectedManufacturerKeys.size &&
            currentManufacturerRows.every((row) =>
              expectedManufacturerKeys.has(
                JSON.stringify([
                  row.productRegistryId,
                  row.name,
                  row.normalizedName,
                  row.country,
                ]),
              ),
            );

          const exactSnapshot =
            currentRows.length === expectedById.size &&
            currentRows.every((row) => {
              const expected = expectedById.get(row.registryId);
              return (
                expected?.rawHash === row.rawHash &&
                row.sourceSnapshotHash === sourceSnapshotHash &&
                row.importBatchId === batchId
              );
            });
          if (!exactSnapshot || !exactManufacturerSnapshot) {
            throw new Error(
              "Registry snapshot parity gate failed before transaction commit.",
            );
          }
        }
      });

      const [productCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(knowledgeRegistryProductsTable)
        .where(ne(knowledgeRegistryProductsTable.reviewStatus, "stale"));
      const [manufacturerCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(knowledgeRegistryManufacturersTable)
        .where(ne(knowledgeRegistryManufacturersTable.currentStatus, "stale"));
      const [registrationCount] = await db
        .select({
          count: sql<number>`count(distinct nullif(${knowledgeRegistryProductsTable.registrationNumber}, ''))::int`,
        })
        .from(knowledgeRegistryProductsTable)
        .where(ne(knowledgeRegistryProductsTable.reviewStatus, "stale"));
      const unchangedManufacturers = Math.max(
        plannedManufacturers - insertedManufacturers - updatedManufacturers,
        0,
      );

      return {
        plannedProducts: rows.length,
        plannedManufacturers,
        plannedRegistrations,
        attemptedProducts: rows.length,
        attemptedManufacturers: plannedManufacturers,
        insertedProducts,
        insertedManufacturers,
        updatedProducts,
        updatedManufacturers,
        staleMarkedProducts,
        staleMarkedManufacturers,
        unchangedProducts,
        unchangedManufacturers,
        skippedProducts,
        skippedManufacturers: 0,
        failedProducts: 0,
        failedManufacturers: 0,
        chunks: chunks.length,
        chunkSize,
        finalProductCount: Number(productCount?.count ?? 0),
        finalManufacturerCount: Number(manufacturerCount?.count ?? 0),
        finalRegistrationCount: Number(registrationCount?.count ?? 0),
        elapsedMs: Date.now() - startedAt,
        importBatchStatus: "completed",
        committedProducts: insertedProducts + updatedProducts,
        committedManufacturers: insertedManufacturers + updatedManufacturers,
      };
    },
    async close() {
      await pool.end();
    },
  };
}

export async function commitReviewableImportPlan(
  plan: ReviewableImportPlan,
  options: {
    store?: KnowledgeImportCommitStore;
    batchId?: string;
    force?: boolean;
    approvedOnly?: boolean;
    chunkSize?: number;
    statementTimeoutMs?: number;
    lockTimeoutMs?: number;
    stageTimeoutMs?: number;
    onProgress?: (progress: MappingCommitProgress) => void;
  } = {},
): Promise<{ committedRows: number; batchId: string } & MappingCommitStats> {
  if (plan.blocked.length > 0 && !options.force) {
    throw new Error(`Import blocked: ${plan.blocked.join(", ")}`);
  }
  if (plan.preview.copyrightViolations > 0) {
    throw new Error(
      "Import blocked: copyrighted/proprietary source rows detected.",
    );
  }
  if (
    options.approvedOnly &&
    plan.reviewable.some((item) => item.reviewStatus !== "approved")
  ) {
    throw new Error(
      "Approved-only mapping commit received a non-approved review status.",
    );
  }
  if (options.approvedOnly && plan.blocked.includes("hard_conflicts")) {
    throw new Error("Approved-only mapping commit contains hard conflicts.");
  }
  const batchId = options.batchId ?? `bulk-ingest-${new Date().toISOString()}`;
  const ownsStore = options.store === undefined;
  const store = options.store ?? (await createDbCommitStore());
  try {
    const result = await store.writeBatch(plan.reviewable, batchId, {
      approvedOnly: options.approvedOnly,
      chunkSize: options.chunkSize,
      statementTimeoutMs: options.statementTimeoutMs,
      lockTimeoutMs: options.lockTimeoutMs,
      stageTimeoutMs: options.stageTimeoutMs,
      onProgress: options.onProgress,
    });
    const persisted = result.inserted + result.updated + result.unchanged;
    if (plan.reviewable.length > 0 && persisted === 0) {
      throw new Error(
        "Approved mappings commit completed with zero persisted rows.",
      );
    }
    return {
      ...result,
      committedRows: result.inserted + result.updated,
      batchId,
    };
  } finally {
    if (ownsStore) await store.close?.();
  }
}

export async function commitRegistryProducts(
  rows: readonly RegistryRawRow[],
  options: {
    store?: KnowledgeImportCommitStore;
    batchId?: string;
  } = {},
): Promise<
  {
    committedProducts: number;
    committedManufacturers: number;
    batchId: string;
    skipped: boolean;
  } & RegistryProductCommitStats
> {
  const batchId =
    options.batchId ?? `registry-products-${new Date().toISOString()}`;
  const ownsStore = options.store === undefined;
  const store = options.store ?? (await createDbCommitStore());
  try {
    if (!store.writeRegistryProducts) {
      return {
        plannedProducts: rows.length,
        plannedManufacturers: rows.reduce(
          (count, row) =>
            count +
            row.manufacturers.filter((manufacturer) => manufacturer.name)
              .length,
          0,
        ),
        plannedRegistrations: new Set(
          rows.map((row) => row.registrationNumber).filter(Boolean),
        ).size,
        attemptedProducts: 0,
        attemptedManufacturers: 0,
        insertedProducts: 0,
        insertedManufacturers: 0,
        updatedProducts: 0,
        updatedManufacturers: 0,
        unchangedProducts: 0,
        unchangedManufacturers: 0,
        skippedProducts: rows.length,
        skippedManufacturers: 0,
        failedProducts: 0,
        failedManufacturers: 0,
        chunks: 0,
        chunkSize: registryProductChunkSize(),
        finalProductCount: 0,
        finalManufacturerCount: 0,
        finalRegistrationCount: 0,
        elapsedMs: 0,
        importBatchStatus: "completed",
        committedProducts: 0,
        committedManufacturers: 0,
        batchId,
        skipped: true,
      };
    }
    const result = await store.writeRegistryProducts(rows, batchId);
    const persisted =
      result.insertedProducts +
      result.updatedProducts +
      result.unchangedProducts;
    if (rows.length > 0 && persisted === 0) {
      throw new Error(
        "Products-only commit completed with zero persisted rows.",
      );
    }
    return { ...result, batchId, skipped: false };
  } finally {
    if (ownsStore) await store.close?.();
  }
}
