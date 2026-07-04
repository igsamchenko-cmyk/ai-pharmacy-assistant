import { eq } from "drizzle-orm";
import { normalize } from "../lib/text";
import { logger } from "../lib/logger";
import { isDbRuntimeEnabled } from "./runtime";
import {
  staticDictionaryProvider,
  createDbDictionaryProvider,
} from "./dictionary/provider";
import type {
  DictionaryEntry,
  NameKind,
  CanonicalIngredient,
} from "./dictionary";
import type {
  EvidenceLevel,
  Provenance,
  SourceReliability,
  SourceType,
} from "./provenance";

export type RuntimeKnowledgeSource =
  | "db"
  | "static"
  | "rxnorm"
  | "openfda"
  | "gemini"
  | "fallback";

export type RuntimeReviewStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "needs_review";

export type RuntimeConfidence = "low" | "medium" | "high" | "verified";

export type RuntimeDbSchemaStatus =
  | "ready"
  | "not_requested"
  | "missing_database_url"
  | "unavailable";

export interface RuntimeProvenance extends Provenance {
  sourceLabel?: string;
  sourceType?: SourceType;
  sourceReliability?: SourceReliability;
  sourceUrl?: string | null;
  locale?: string;
  importBatchId?: string | null;
  importedAt?: string | null;
  reviewStatus?: RuntimeReviewStatus;
}

export interface RuntimeDictionaryEntry extends DictionaryEntry {
  runtimeSource: RuntimeKnowledgeSource;
  confidence: RuntimeConfidence;
  confidenceScore: number;
  provenance: RuntimeProvenance;
}

export interface RuntimeResolveResult {
  entry: RuntimeDictionaryEntry | null;
  source: RuntimeKnowledgeSource;
  warnings: string[];
}

export interface KnowledgeRuntimeStatus {
  runtimeMode: "static" | "db";
  dbEnabled: boolean;
  dbRuntimeRequested: boolean;
  databaseUrlConfigured: boolean;
  dbAvailable: boolean;
  dbSchemaStatus: RuntimeDbSchemaStatus;
  schemaReady: boolean;
  staticRuntimeEnabled: boolean;
  staticFallbackEnabled: boolean;
  fallbackReason: string | null;
  approvedMappingsCount: number;
  pendingCount: number;
  rejectedCount: number;
  needsReviewCount: number;
  lastImportBatch: string | null;
  warnings: string[];
  providerStatus: {
    db: "active" | "disabled" | "unavailable";
    static: "active";
  };
  sourceDistribution: Record<RuntimeKnowledgeSource, number>;
}

export interface DbMappingRow {
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
  importBatchId: string | null;
  importedAt: Date | string | null;
  inn: string;
  latin: string;
  english: string;
  atcCode: string | null;
  groupName: string;
  sourceLabel: string | null;
  sourceType: string | null;
  sourceReliability: string | null;
  sourceUrl: string | null;
}

export interface RuntimeDbStore {
  listMappings(): Promise<DbMappingRow[]>;
}

interface LoadRowsResult {
  rows: DbMappingRow[] | null;
  dbSchemaStatus: RuntimeDbSchemaStatus;
  fallbackReason: string | null;
  warnings: string[];
}

const MISSING_DATABASE_URL_FALLBACK =
  "DATABASE_URL is not configured; static runtime is active.";
const DB_RUNTIME_UNAVAILABLE_FALLBACK =
  "DB runtime is unavailable; static fallback is active.";
const DB_RUNTIME_NOT_REQUESTED_FALLBACK =
  "DB runtime is not requested; static runtime is active.";

const DEFAULT_STATUS_COUNTS = {
  approved: 0,
  pending: 0,
  rejected: 0,
  needs_review: 0,
} satisfies Record<RuntimeReviewStatus, number>;

function isNameKind(value: string): value is NameKind {
  return ["inn", "latin", "english", "brand", "synonym"].includes(value);
}

function isReviewStatus(value: string): value is RuntimeReviewStatus {
  return ["pending", "approved", "rejected", "needs_review"].includes(value);
}

function isConfidence(value: string): value is RuntimeConfidence {
  return ["low", "medium", "high", "verified"].includes(value);
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function staticEntry(
  entry: DictionaryEntry | null,
): RuntimeDictionaryEntry | null {
  if (!entry) return null;
  return {
    ...entry,
    runtimeSource: "static",
    confidence: "verified",
    confidenceScore: 100,
    provenance: { ...entry.provenance, reviewStatus: "approved" },
  };
}

function dbEntry(row: DbMappingRow): RuntimeDictionaryEntry | null {
  if (!isNameKind(row.kind)) return null;
  const ingredient: CanonicalIngredient = {
    inn: row.inn,
    latin: row.latin,
    english: row.english,
    atc: row.atcCode ?? "",
    group: row.groupName,
  };
  return {
    name: row.name,
    kind: row.kind,
    ingredient,
    runtimeSource: "db",
    confidence: isConfidence(row.confidence) ? row.confidence : "medium",
    confidenceScore: row.confidenceScore,
    provenance: {
      sourceKey: row.sourceKey,
      evidenceLevel: row.evidenceLevel as EvidenceLevel,
      sourceLabel: row.sourceLabel ?? undefined,
      sourceType: row.sourceType as SourceType | undefined,
      sourceReliability: row.sourceReliability as SourceReliability | undefined,
      sourceUrl: row.sourceUrl,
      locale: row.locale,
      importBatchId: row.importBatchId,
      importedAt: toIso(row.importedAt),
      reviewStatus: isReviewStatus(row.reviewStatus)
        ? row.reviewStatus
        : "needs_review",
    },
  };
}

export function createRuntimeProviderFromRows(rows: readonly DbMappingRow[]) {
  const activeRows = rows.filter((row) => row.reviewStatus === "approved");
  const entries = activeRows
    .map(dbEntry)
    .filter((entry): entry is RuntimeDictionaryEntry => entry !== null);
  return createDbDictionaryProvider(entries);
}

async function createDefaultDbStore(): Promise<RuntimeDbStore> {
  const dbModule = await import("@workspace/db");
  const {
    db,
    knowledgeIngredientNamesTable: names,
    knowledgeIngredientsTable: ingredients,
    knowledgeSourcesTable: sources,
  } = dbModule;

  return {
    async listMappings(): Promise<DbMappingRow[]> {
      return db
        .select({
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
          importBatchId: names.importBatchId,
          importedAt: names.importedAt,
          inn: ingredients.inn,
          latin: ingredients.latin,
          english: ingredients.english,
          atcCode: ingredients.atcCode,
          groupName: ingredients.groupName,
          sourceLabel: sources.label,
          sourceType: sources.type,
          sourceReliability: sources.reliability,
          sourceUrl: sources.url,
        })
        .from(names)
        .innerJoin(ingredients, eq(names.ingredientInnKey, ingredients.innKey))
        .leftJoin(sources, eq(names.sourceKey, sources.key));
    },
  };
}

async function loadRowsWithDiagnostics(
  store?: RuntimeDbStore,
): Promise<LoadRowsResult> {
  if (!process.env.DATABASE_URL && !store) {
    return {
      rows: null,
      dbSchemaStatus: "missing_database_url",
      fallbackReason: MISSING_DATABASE_URL_FALLBACK,
      warnings: [MISSING_DATABASE_URL_FALLBACK],
    };
  }
  try {
    const dbStore = store ?? (await createDefaultDbStore());
    return {
      rows: await dbStore.listMappings(),
      dbSchemaStatus: "ready",
      fallbackReason: null,
      warnings: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: message }, "Knowledge DB runtime unavailable");
    return {
      rows: null,
      dbSchemaStatus: "unavailable",
      fallbackReason: DB_RUNTIME_UNAVAILABLE_FALLBACK,
      warnings: [DB_RUNTIME_UNAVAILABLE_FALLBACK],
    };
  }
}

async function loadRows(
  warnings: string[],
  store?: RuntimeDbStore,
): Promise<DbMappingRow[] | null> {
  const result = await loadRowsWithDiagnostics(store);
  warnings.push(...result.warnings);
  return result.rows;
}

function countRows(rows: readonly DbMappingRow[]) {
  const counts = { ...DEFAULT_STATUS_COUNTS };
  for (const row of rows) {
    if (isReviewStatus(row.reviewStatus)) counts[row.reviewStatus]++;
  }
  return counts;
}

function lastBatch(rows: readonly DbMappingRow[]): string | null {
  let best: { batch: string; time: string } | null = null;
  for (const row of rows) {
    if (!row.importBatchId) continue;
    const time = toIso(row.importedAt) ?? "";
    if (!best || time > best.time) best = { batch: row.importBatchId, time };
  }
  return best?.batch ?? null;
}

export async function getKnowledgeRuntimeStatus(
  store?: RuntimeDbStore,
): Promise<KnowledgeRuntimeStatus> {
  const dbEnabled = isDbRuntimeEnabled();
  const databaseUrlConfigured = Boolean(process.env.DATABASE_URL);
  const staticCount = staticDictionaryProvider.listEntries().length;
  const loadResult = dbEnabled
    ? await loadRowsWithDiagnostics(store)
    : {
        rows: null,
        dbSchemaStatus: "not_requested" as const,
        fallbackReason: DB_RUNTIME_NOT_REQUESTED_FALLBACK,
        warnings: [],
      };
  const rows = loadResult.rows;
  const counts = rows ? countRows(rows) : { ...DEFAULT_STATUS_COUNTS };
  return {
    runtimeMode: dbEnabled ? "db" : "static",
    dbEnabled,
    dbRuntimeRequested: dbEnabled,
    databaseUrlConfigured,
    dbAvailable: rows !== null,
    dbSchemaStatus: loadResult.dbSchemaStatus,
    schemaReady: rows !== null,
    staticRuntimeEnabled: true,
    staticFallbackEnabled: true,
    fallbackReason: loadResult.fallbackReason,
    approvedMappingsCount: counts.approved,
    pendingCount: counts.pending,
    rejectedCount: counts.rejected,
    needsReviewCount: counts.needs_review,
    lastImportBatch: rows ? lastBatch(rows) : null,
    warnings: loadResult.warnings,
    providerStatus: {
      db: dbEnabled ? (rows ? "active" : "unavailable") : "disabled",
      static: "active",
    },
    sourceDistribution: {
      db: counts.approved,
      static: staticCount,
      rxnorm: 0,
      openfda: 0,
      gemini: 0,
      fallback: rows === null && dbEnabled ? staticCount : 0,
    },
  };
}

export async function resolveRuntimeName(
  query: string,
  store?: RuntimeDbStore,
): Promise<RuntimeResolveResult> {
  const warnings: string[] = [];
  if (isDbRuntimeEnabled()) {
    const rows = await loadRows(warnings, store);
    if (rows) {
      const provider = createRuntimeProviderFromRows(rows);
      const entry = provider.normalizeQuery(
        query,
      ) as RuntimeDictionaryEntry | null;
      if (entry) return { entry, source: "db", warnings };
    }
  }

  const fallback = staticEntry(staticDictionaryProvider.normalizeQuery(query));
  return {
    entry: fallback,
    source: fallback ? "static" : "fallback",
    warnings,
  };
}

export function resolveRuntimeNameFromRows(
  query: string,
  rows: readonly DbMappingRow[],
): RuntimeResolveResult {
  const provider = createRuntimeProviderFromRows(rows);
  const dbResult = provider.normalizeQuery(
    query,
  ) as RuntimeDictionaryEntry | null;
  if (dbResult) return { entry: dbResult, source: "db", warnings: [] };
  const fallback = staticEntry(staticDictionaryProvider.normalizeQuery(query));
  return {
    entry: fallback,
    source: fallback ? "static" : "fallback",
    warnings: [],
  };
}

export function normalizedKey(value: string): string {
  return normalize(value);
}
