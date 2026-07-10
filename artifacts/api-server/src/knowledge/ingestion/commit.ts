import { normalize } from "../../lib/text";
import { inArray, sql } from "drizzle-orm";
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
  ): Promise<void>;
  writeRegistryProducts?(
    rows: readonly RegistryRawRow[],
    batchId: string,
  ): Promise<RegistryProductCommitStats>;
  close?(): Promise<void>;
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

function registryProductValue(row: RegistryRawRow, batchId: string) {
  return {
    registryId: registryIdFor(row),
    tradeName: row.tradeName,
    normalizedTradeName: normalize(row.tradeName),
    inn: row.inn,
    activeIngredient: row.activeIngredient,
    atcCode: row.atcCode || null,
    form: row.form,
    applicantName: row.applicantName,
    applicantCountry: row.applicantCountry,
    registrationNumber: row.registrationNumber,
    registrationStartDate: row.registrationStartDate,
    registrationEndDate: row.registrationEndDate,
    earlyTermination: row.earlyTermination,
    instructionUrl: row.instructionUrl || null,
    sourceKey: row.sourceId,
    reviewStatus: "pending",
    importBatchId: batchId,
    rawHash: registryRowHash(row),
  };
}

function registryManufacturerValues(row: RegistryRawRow, batchId: string) {
  const productRegistryId = registryIdFor(row);
  return row.manufacturers
    .filter((manufacturer) => Boolean(manufacturer.name))
    .map((manufacturer) => ({
      productRegistryId,
      name: manufacturer.name,
      normalizedName: normalize(manufacturer.name),
      country: manufacturer.country,
      sourceKey: row.sourceId,
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
    async writeBatch(rows, batchId) {
      await db.transaction(async (tx) => {
        const seenInn = new Set<string>();
        for (const item of rows) {
          const row = item.row;
          const innKey = normalize(row.canonicalInn);
          if (!seenInn.has(innKey)) {
            seenInn.add(innKey);
            await tx
              .insert(knowledgeIngredientsTable)
              .values({
                innKey,
                inn: row.canonicalInn,
                atcCode: row.atcCode ?? null,
                sourceKey: row.sourceId,
                evidenceLevel: "reference",
              })
              .onConflictDoNothing({
                target: knowledgeIngredientsTable.innKey,
              });
          }
          await tx
            .insert(knowledgeIngredientNamesTable)
            .values({
              normalized: normalize(row.name),
              name: row.name,
              kind: nameTypeToKind(row.nameType),
              ingredientInnKey: innKey,
              sourceKey: row.sourceId,
              evidenceLevel: "reference",
              locale: row.locale,
              confidence: row.confidence,
              confidenceScore: confidenceScore(row.confidence),
              reviewStatus: item.reviewStatus,
              conflictFlags: encodeList(item.conflictFlags),
              validationWarnings: encodeList(item.validationWarnings),
              importBatchId: batchId,
            })
            .onConflictDoNothing({
              target: knowledgeIngredientNamesTable.normalized,
            });
        }
      });
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

      for (const chunk of chunks) {
        await db.transaction(async (tx) => {
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
                  applicantName: sql`excluded.applicant_name`,
                  applicantCountry: sql`excluded.applicant_country`,
                  registrationNumber: sql`excluded.registration_number`,
                  registrationStartDate: sql`excluded.registration_start_date`,
                  registrationEndDate: sql`excluded.registration_end_date`,
                  earlyTermination: sql`excluded.early_termination`,
                  instructionUrl: sql`excluded.instruction_url`,
                  sourceKey: sql`excluded.source_key`,
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

          const manufacturerValues = uniqueRegistryManufacturerValues(
            chunk.flatMap((row) => registryManufacturerValues(row, batchId)),
          );
          if (manufacturerValues.length > 0) {
            const inserted = await tx
              .insert(knowledgeRegistryManufacturersTable)
              .values(manufacturerValues)
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
        });
      }

      const [productCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(knowledgeRegistryProductsTable);
      const [manufacturerCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(knowledgeRegistryManufacturersTable);
      const [registrationCount] = await db
        .select({
          count: sql<number>`count(distinct nullif(${knowledgeRegistryProductsTable.registrationNumber}, ''))::int`,
        })
        .from(knowledgeRegistryProductsTable);
      const unchangedManufacturers = Math.max(
        plannedManufacturers - insertedManufacturers,
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
        updatedManufacturers: 0,
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
        committedManufacturers: insertedManufacturers,
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
  } = {},
): Promise<{ committedRows: number; batchId: string }> {
  if (plan.blocked.length > 0 && !options.force) {
    throw new Error(`Import blocked: ${plan.blocked.join(", ")}`);
  }
  if (plan.preview.copyrightViolations > 0) {
    throw new Error(
      "Import blocked: copyrighted/proprietary source rows detected.",
    );
  }
  const batchId = options.batchId ?? `bulk-ingest-${new Date().toISOString()}`;
  const ownsStore = options.store === undefined;
  const store = options.store ?? (await createDbCommitStore());
  try {
    await store.writeBatch(plan.reviewable, batchId);
    return { committedRows: plan.reviewable.length, batchId };
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
