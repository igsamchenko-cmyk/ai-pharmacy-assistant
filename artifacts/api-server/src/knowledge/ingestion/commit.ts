import { normalize } from "../../lib/text";
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
  writeBatch(rows: readonly ReviewableImportRow[], batchId: string): Promise<void>;
  writeRegistryProducts?(
    rows: readonly RegistryRawRow[],
    batchId: string,
  ): Promise<{ committedProducts: number; committedManufacturers: number }>;
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
    if (row.nameType === "brand") validationWarnings.push("brand_review_required");
    if (row.nameType === "typo") validationWarnings.push("typo_requires_review");
    if (row.confidence === "low") validationWarnings.push("low_confidence_review");
    if (unknownSource) validationWarnings.push("unknown_source_rejected");
    if (reviewStatus === "pending") validationWarnings.push("human_review_pending");
    if (row.notes?.includes("generated")) validationWarnings.push("generated_candidate");
    if (row.notes?.includes("search miss")) validationWarnings.push("search_miss_candidate");

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
      let committedProducts = 0;
      let committedManufacturers = 0;
      await db.transaction(async (tx) => {
        for (const row of rows) {
          const registryId =
            row.registryId ||
            row.registrationNumber ||
            registryRowHash(row).slice(0, 32);
          const insertedProducts = await tx
            .insert(knowledgeRegistryProductsTable)
            .values({
              registryId,
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
            })
            .onConflictDoNothing({
              target: knowledgeRegistryProductsTable.registryId,
            })
            .returning({ registryId: knowledgeRegistryProductsTable.registryId });
          committedProducts += insertedProducts.length;

          for (const manufacturer of row.manufacturers) {
            if (!manufacturer.name) continue;
            const insertedManufacturers = await tx
              .insert(knowledgeRegistryManufacturersTable)
              .values({
                productRegistryId: registryId,
                name: manufacturer.name,
                normalizedName: normalize(manufacturer.name),
                country: manufacturer.country,
                sourceKey: row.sourceId,
                importBatchId: batchId,
              })
              .onConflictDoNothing({
                target: [
                  knowledgeRegistryManufacturersTable.productRegistryId,
                  knowledgeRegistryManufacturersTable.normalizedName,
                  knowledgeRegistryManufacturersTable.country,
                ],
              })
              .returning({ id: knowledgeRegistryManufacturersTable.id });
            committedManufacturers += insertedManufacturers.length;
          }
        }
      });
      return { committedProducts, committedManufacturers };
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
    throw new Error("Import blocked: copyrighted/proprietary source rows detected.");
  }
  const batchId =
    options.batchId ?? `bulk-ingest-${new Date().toISOString()}`;
  const store = options.store ?? (await createDbCommitStore());
  await store.writeBatch(plan.reviewable, batchId);
  return { committedRows: plan.reviewable.length, batchId };
}

export async function commitRegistryProducts(
  rows: readonly RegistryRawRow[],
  options: {
    store?: KnowledgeImportCommitStore;
    batchId?: string;
  } = {},
): Promise<{
  committedProducts: number;
  committedManufacturers: number;
  batchId: string;
  skipped: boolean;
}> {
  const batchId =
    options.batchId ?? `registry-products-${new Date().toISOString()}`;
  const store = options.store ?? (await createDbCommitStore());
  if (!store.writeRegistryProducts) {
    return {
      committedProducts: 0,
      committedManufacturers: 0,
      batchId,
      skipped: true,
    };
  }
  const result = await store.writeRegistryProducts(rows, batchId);
  return { ...result, batchId, skipped: false };
}
