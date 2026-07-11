import { eq } from "drizzle-orm";
import { normalize } from "../lib/text";
import { logger } from "../lib/logger";
import type { RuntimeConfidence, RuntimeReviewStatus } from "./dbRuntime";
import type { EvidenceLevel, SourceReliability, SourceType } from "./provenance";

export const REVIEW_WORKFLOW_UNAVAILABLE_WARNING =
  "DB review workflow is unavailable. Static runtime remains active.";

export const REVIEW_WORKFLOW_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "needs_review",
] as const satisfies readonly RuntimeReviewStatus[];

export type ReviewQueueStatus = RuntimeReviewStatus | "all";
export type ReviewAction = "approved" | "rejected" | "marked_needs_review";
export type ReviewEntityType =
  | "ingredient_name"
  | "ingredient"
  | "atc"
  | "interaction_rule"
  | "source"
  | "other";

export interface ReviewStatusCounts {
  pending: number;
  approved: number;
  rejected: number;
  needs_review: number;
}

export interface ReviewQueueParams {
  status?: ReviewQueueStatus;
  conflictOnly?: boolean;
  sourceId?: string;
  locale?: string;
  limit?: number;
  offset?: number;
}

export interface ReviewActionInput {
  note?: string;
  reviewedBy?: string;
  reason?: string;
}

export interface ReviewProvenance {
  sourceKey: string;
  evidenceLevel: EvidenceLevel | string;
  sourceLabel?: string;
  sourceType?: SourceType;
  sourceReliability?: SourceReliability;
  sourceUrl?: string | null;
  importBatchId?: string | null;
}

export interface ReviewQueueItem {
  id: string;
  entityType: ReviewEntityType;
  displayName: string;
  normalizedName: string;
  mappedIngredientId: string | null;
  mappedIngredientName: string | null;
  sourceId: string;
  sourceName: string | null;
  confidence: RuntimeConfidence;
  confidenceScore: number;
  locale: string;
  mappingType: string;
  reviewStatus: RuntimeReviewStatus;
  conflictFlags: string[];
  validationWarnings: string[];
  createdAt: string | null;
  updatedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  importBatchId: string | null;
  provenance: ReviewProvenance;
}

export interface ReviewAuditEntry {
  id: string;
  entityType: ReviewEntityType;
  entityId: string;
  action: ReviewAction;
  fromStatus: RuntimeReviewStatus | null;
  toStatus: RuntimeReviewStatus | null;
  note: string | null;
  reason: string | null;
  reviewedBy: string | null;
  importBatchId: string | null;
  sourceKey: string | null;
  createdAt: string | null;
}

export interface ReviewQueueResponseShape {
  items: ReviewQueueItem[];
  total: number;
  limit: number;
  offset: number;
  counts: ReviewStatusCounts;
  conflictCount: number;
  warnings: string[];
}

export interface ReviewStatsResponseShape {
  counts: ReviewStatusCounts;
  conflictCount: number;
  lowConfidenceCount: number;
  approvedRuntimeCount: number;
  latestReviewActivity: string | null;
  warnings: string[];
}

export interface ReviewActionResponseShape {
  item: ReviewQueueItem;
  audit: ReviewAuditEntry;
  warnings: string[];
}

export interface ReviewStoreRow {
  id: string;
  normalized: string;
  name: string;
  kind: string;
  ingredientInnKey: string;
  sourceKey: string;
  evidenceLevel: string;
  locale: string;
  confidence: string;
  confidenceScore: number;
  reviewStatus: string;
  conflictFlags: string | null;
  validationWarnings: string | null;
  reviewedAt: Date | string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  importBatchId: string | null;
  importedAt: Date | string | null;
  updatedAt: Date | string | null;
  ingredientId: string | null;
  inn: string | null;
  sourceLabel: string | null;
  sourceType: string | null;
  sourceReliability: string | null;
  sourceUrl: string | null;
}

export interface ReviewAuditStoreRow {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  reason: string | null;
  reviewedBy: string | null;
  importBatchId: string | null;
  sourceKey: string | null;
  createdAt: Date | string | null;
}

export interface ReviewMutationInput extends ReviewActionInput {
  targetStatus: RuntimeReviewStatus;
  action: ReviewAction;
}

export interface ReviewMutationResult {
  item: ReviewStoreRow | null;
  audit: ReviewAuditStoreRow | null;
}

export interface ReviewWorkflowStore {
  listRows(): Promise<ReviewStoreRow[]>;
  listAudit(): Promise<ReviewAuditStoreRow[]>;
  updateReview(id: string, input: ReviewMutationInput): Promise<ReviewMutationResult>;
}

export class ReviewWorkflowUnavailableError extends Error {
  constructor(message = REVIEW_WORKFLOW_UNAVAILABLE_WARNING) {
    super(message);
    this.name = "ReviewWorkflowUnavailableError";
  }
}

export class ReviewItemNotFoundError extends Error {
  constructor(id: string) {
    super(`Review item ${id} was not found.`);
    this.name = "ReviewItemNotFoundError";
  }
}

function emptyCounts(): ReviewStatusCounts {
  return { pending: 0, approved: 0, rejected: 0, needs_review: 0 };
}

function isReviewStatus(value: string): value is RuntimeReviewStatus {
  return (REVIEW_WORKFLOW_STATUSES as readonly string[]).includes(value);
}

function isConfidence(value: string): value is RuntimeConfidence {
  return ["low", "medium", "high", "verified"].includes(value);
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function parseList(value: string | null): string[] {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // Legacy/plain text values fall through to separator parsing.
  }
  return trimmed
    .split(/[|\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function serializeList(values: readonly string[] | undefined): string {
  return values && values.length > 0 ? JSON.stringify([...values]) : "";
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return 50;
  return Math.min(100, Math.max(1, Math.trunc(value)));
}

function normalizeOffset(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function rowStatus(row: ReviewStoreRow): RuntimeReviewStatus {
  return isReviewStatus(row.reviewStatus) ? row.reviewStatus : "needs_review";
}

function rowConfidence(row: ReviewStoreRow): RuntimeConfidence {
  return isConfidence(row.confidence) ? row.confidence : "medium";
}

function itemWarnings(row: ReviewStoreRow): string[] {
  const warnings = parseList(row.validationWarnings);
  if (rowConfidence(row) === "low") warnings.push("Low confidence mapping requires review.");
  if (!row.sourceLabel) warnings.push("Source is not registered in provenance registry.");
  if (!isReviewStatus(row.reviewStatus)) warnings.push("Unknown review status was treated as needs_review.");
  return [...new Set(warnings)];
}

function toItem(row: ReviewStoreRow): ReviewQueueItem {
  const status = rowStatus(row);
  const confidence = rowConfidence(row);
  return {
    id: row.id,
    entityType: "ingredient_name",
    displayName: row.name,
    normalizedName: row.normalized || normalize(row.name),
    mappedIngredientId: row.ingredientId,
    mappedIngredientName: row.inn,
    sourceId: row.sourceKey,
    sourceName: row.sourceLabel,
    confidence,
    confidenceScore: row.confidenceScore,
    locale: row.locale,
    mappingType: row.kind,
    reviewStatus: status,
    conflictFlags: parseList(row.conflictFlags),
    validationWarnings: itemWarnings(row),
    createdAt: toIso(row.importedAt),
    updatedAt: toIso(row.updatedAt),
    reviewedAt: toIso(row.reviewedAt),
    reviewedBy: row.reviewedBy,
    reviewNote: row.reviewNote,
    importBatchId: row.importBatchId,
    provenance: {
      sourceKey: row.sourceKey,
      evidenceLevel: row.evidenceLevel,
      sourceLabel: row.sourceLabel ?? undefined,
      sourceType: (row.sourceType ?? undefined) as SourceType | undefined,
      sourceReliability: (row.sourceReliability ?? undefined) as SourceReliability | undefined,
      sourceUrl: row.sourceUrl,
      importBatchId: row.importBatchId,
    },
  };
}

function toAudit(row: ReviewAuditStoreRow): ReviewAuditEntry {
  return {
    id: row.id,
    entityType: row.entityType === "ingredient_name" ? "ingredient_name" : "other",
    entityId: row.entityId,
    action:
      row.action === "approved" ||
      row.action === "rejected" ||
      row.action === "marked_needs_review"
        ? row.action
        : "marked_needs_review",
    fromStatus: row.fromStatus && isReviewStatus(row.fromStatus) ? row.fromStatus : null,
    toStatus: row.toStatus && isReviewStatus(row.toStatus) ? row.toStatus : null,
    note: row.note,
    reason: row.reason,
    reviewedBy: row.reviewedBy,
    importBatchId: row.importBatchId,
    sourceKey: row.sourceKey,
    createdAt: toIso(row.createdAt),
  };
}

function countsFor(rows: readonly ReviewStoreRow[]): ReviewStatusCounts {
  const counts = emptyCounts();
  for (const row of rows) counts[rowStatus(row)]++;
  return counts;
}

function conflictCount(rows: readonly ReviewStoreRow[]): number {
  return rows.filter((row) => parseList(row.conflictFlags).length > 0).length;
}

function lowConfidenceCount(rows: readonly ReviewStoreRow[]): number {
  return rows.filter(
    (row) => rowConfidence(row) === "low" || row.confidenceScore < 60,
  ).length;
}

function filterRows(rows: readonly ReviewStoreRow[], params: ReviewQueueParams) {
  const status = params.status ?? "pending";
  return rows.filter((row) => {
    if (status !== "all" && rowStatus(row) !== status) return false;
    if (params.conflictOnly && parseList(row.conflictFlags).length === 0) return false;
    if (params.sourceId && row.sourceKey !== params.sourceId) return false;
    if (params.locale && row.locale !== params.locale) return false;
    return true;
  });
}

async function safelyLoadRows(store?: ReviewWorkflowStore): Promise<{
  rows: ReviewStoreRow[];
  audits: ReviewAuditStoreRow[];
  warnings: string[];
}> {
  try {
    const activeStore = store ?? (await createDefaultReviewStore());
    const [rows, audits] = await Promise.all([
      activeStore.listRows(),
      activeStore.listAudit(),
    ]);
    return { rows, audits, warnings: [] };
  } catch (error) {
    if (!(error instanceof ReviewWorkflowUnavailableError)) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ err: message }, "Knowledge review workflow unavailable");
    }
    return { rows: [], audits: [], warnings: [REVIEW_WORKFLOW_UNAVAILABLE_WARNING] };
  }
}

export async function listReviewQueue(
  params: ReviewQueueParams = {},
  store?: ReviewWorkflowStore,
): Promise<ReviewQueueResponseShape> {
  const limit = normalizeLimit(params.limit);
  const offset = normalizeOffset(params.offset);
  const { rows, warnings } = await safelyLoadRows(store);
  const filtered = filterRows(rows, params);
  return {
    items: filtered.slice(offset, offset + limit).map(toItem),
    total: filtered.length,
    limit,
    offset,
    counts: countsFor(rows),
    conflictCount: conflictCount(rows),
    warnings,
  };
}

export async function getReviewStats(
  store?: ReviewWorkflowStore,
): Promise<ReviewStatsResponseShape> {
  const { rows, audits, warnings } = await safelyLoadRows(store);
  const latest = audits
    .map((audit) => toIso(audit.createdAt))
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const counts = countsFor(rows);
  return {
    counts,
    conflictCount: conflictCount(rows),
    lowConfidenceCount: lowConfidenceCount(rows),
    approvedRuntimeCount: counts.approved,
    latestReviewActivity: latest,
    warnings,
  };
}

export async function applyReviewAction(
  id: string,
  targetStatus: RuntimeReviewStatus,
  action: ReviewAction,
  input: ReviewActionInput = {},
  store?: ReviewWorkflowStore,
): Promise<ReviewActionResponseShape> {
  const activeStore = store ?? (await createDefaultReviewStore());
  const result = await activeStore.updateReview(id, {
    ...input,
    targetStatus,
    action,
  });
  if (!result.item || !result.audit) throw new ReviewItemNotFoundError(id);
  return {
    item: toItem(result.item),
    audit: toAudit(result.audit),
    warnings: [],
  };
}

export class MemoryReviewWorkflowStore implements ReviewWorkflowStore {
  private rows: ReviewStoreRow[];
  private audits: ReviewAuditStoreRow[];
  private nextAudit = 1;

  constructor(rows: ReviewStoreRow[], audits: ReviewAuditStoreRow[] = []) {
    this.rows = rows.map((row) => ({ ...row }));
    this.audits = audits.map((audit) => ({ ...audit }));
  }

  async listRows(): Promise<ReviewStoreRow[]> {
    return this.rows.map((row) => ({ ...row }));
  }

  async listAudit(): Promise<ReviewAuditStoreRow[]> {
    return this.audits.map((audit) => ({ ...audit }));
  }

  async updateReview(
    id: string,
    input: ReviewMutationInput,
  ): Promise<ReviewMutationResult> {
    const idx = this.rows.findIndex((row) => row.id === id);
    if (idx < 0) return { item: null, audit: null };
    const current = this.rows[idx];
    const now = new Date().toISOString();
    const note = input.note ?? input.reason ?? null;
    const updated: ReviewStoreRow = {
      ...current,
      reviewStatus: input.targetStatus,
      reviewedAt: now,
      reviewedBy: input.reviewedBy ?? null,
      reviewNote: note,
      updatedAt: now,
    };
    const audit: ReviewAuditStoreRow = {
      id: `audit-${this.nextAudit++}`,
      entityType: "ingredient_name",
      entityId: id,
      action: input.action,
      fromStatus: rowStatus(current),
      toStatus: input.targetStatus,
      note,
      reason: input.reason ?? null,
      reviewedBy: input.reviewedBy ?? null,
      importBatchId: current.importBatchId,
      sourceKey: current.sourceKey,
      createdAt: now,
    };
    this.rows[idx] = updated;
    this.audits.push(audit);
    return { item: { ...updated }, audit: { ...audit } };
  }
}

export function createReviewStoreRow(
  overrides: Partial<ReviewStoreRow> = {},
): ReviewStoreRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    normalized: "reviewbrand",
    name: "ReviewBrand",
    kind: "brand",
    ingredientInnKey: "review-inn",
    sourceKey: "who-inn",
    evidenceLevel: "reference",
    locale: "uk",
    confidence: "medium",
    confidenceScore: 60,
    reviewStatus: "pending",
    conflictFlags: "",
    validationWarnings: "",
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: null,
    importBatchId: "batch-review",
    importedAt: new Date("2026-07-04T00:00:00.000Z"),
    updatedAt: new Date("2026-07-04T00:00:00.000Z"),
    ingredientId: "22222222-2222-4222-8222-222222222222",
    inn: "Review INN",
    sourceLabel: "WHO INN",
    sourceType: "reference",
    sourceReliability: "high",
    sourceUrl: "https://example.test/who",
    ...overrides,
  };
}

export function encodeReviewList(values: readonly string[]): string {
  return serializeList(values);
}

async function createDefaultReviewStore(): Promise<ReviewWorkflowStore> {
  if (!process.env.DATABASE_URL) throw new ReviewWorkflowUnavailableError();

  const dbModule = await import("@workspace/db");
  const {
    db,
    knowledgeIngredientNamesTable: names,
    knowledgeIngredientsTable: ingredients,
    knowledgeSourcesTable: sources,
    knowledgeReviewAuditLogTable: auditLog,
  } = dbModule;

  const listRows = async (): Promise<ReviewStoreRow[]> => {
    return db
      .select({
        id: names.id,
        normalized: names.normalized,
        name: names.name,
        kind: names.kind,
        ingredientInnKey: names.ingredientInnKey,
        sourceKey: names.sourceKey,
        evidenceLevel: names.evidenceLevel,
        locale: names.locale,
        confidence: names.confidence,
        confidenceScore: names.confidenceScore,
        reviewStatus: names.reviewStatus,
        conflictFlags: names.conflictFlags,
        validationWarnings: names.validationWarnings,
        reviewedAt: names.reviewedAt,
        reviewedBy: names.reviewedBy,
        reviewNote: names.reviewNote,
        importBatchId: names.importBatchId,
        importedAt: names.importedAt,
        updatedAt: names.updatedAt,
        ingredientId: ingredients.id,
        inn: ingredients.inn,
        sourceLabel: sources.label,
        sourceType: sources.type,
        sourceReliability: sources.reliability,
        sourceUrl: sources.url,
      })
      .from(names)
      .innerJoin(
        ingredients,
        eq(names.ingredientInnKey, ingredients.innKey),
      )
      .leftJoin(sources, eq(names.sourceKey, sources.key));
  };

  const listAudit = async (): Promise<ReviewAuditStoreRow[]> => {
    return db
      .select({
        id: auditLog.id,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        action: auditLog.action,
        fromStatus: auditLog.fromStatus,
        toStatus: auditLog.toStatus,
        note: auditLog.note,
        reason: auditLog.reason,
        reviewedBy: auditLog.reviewedBy,
        importBatchId: auditLog.importBatchId,
        sourceKey: auditLog.sourceKey,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog);
  };

  return {
    listRows,
    listAudit,

    async updateReview(
      id: string,
      input: ReviewMutationInput,
    ): Promise<ReviewMutationResult> {
      const rowsBefore = await listRows();
      const before = rowsBefore.find((row) => row.id === id);
      if (!before) return { item: null, audit: null };
      const now = new Date();
      const note = input.note ?? input.reason ?? null;
      let audit: ReviewAuditStoreRow | null = null;
      await db.transaction(async (tx) => {
        await tx
          .update(names)
          .set({
            reviewStatus: input.targetStatus,
            reviewedAt: now,
            reviewedBy: input.reviewedBy ?? null,
            reviewNote: note,
            updatedAt: now,
          })
          .where(eq(names.id, id));
        const inserted = await tx
          .insert(auditLog)
          .values({
            entityType: "ingredient_name",
            entityId: id,
            action: input.action,
            fromStatus: rowStatus(before),
            toStatus: input.targetStatus,
            note,
            reason: input.reason ?? null,
            reviewedBy: input.reviewedBy ?? null,
            importBatchId: before.importBatchId,
            sourceKey: before.sourceKey,
          })
          .returning();
        audit = inserted[0] ?? null;
      });
      const rowsAfter = await listRows();
      const after = rowsAfter.find((row) => row.id === id) ?? null;
      return { item: after, audit };
    },
  };
}