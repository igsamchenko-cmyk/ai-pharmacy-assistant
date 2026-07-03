import type {
  InsertKnowledgeAtcCode,
  InsertKnowledgeIngredient,
  InsertKnowledgeIngredientName,
  InsertKnowledgeInteractionRule,
  InsertKnowledgeSource,
} from "@workspace/db/schema";
import { validateKnowledge, type QualityReport } from "./validation";
import {
  buildKnowledgeSnapshot,
  snapshotCounts,
  type KnowledgeSnapshot,
  type SnapshotCounts,
} from "./import/pipeline";

export const STATIC_BACKFILL_BATCH_PREFIX = "static-backfill";

export interface BackfillCounts extends SnapshotCounts {
  total: number;
}

export interface BackfillMutationCounts {
  inserted: number;
  updated: number;
  skipped: number;
  conflicts: number;
}

export interface BackfillReport {
  ok: boolean;
  mode: "db" | "dry-run" | "memory";
  batchId: string;
  counts: BackfillCounts;
  mutations: BackfillMutationCounts;
  quality: QualityReport;
  warnings: string[];
  loaded: boolean;
}

export interface BackfillStore {
  readonly id: "db" | "dry-run" | "memory";
  load(snapshot: KnowledgeSnapshot): Promise<BackfillMutationCounts>;
}

export function createBackfillBatchId(now = new Date()): string {
  return `${STATIC_BACKFILL_BATCH_PREFIX}-${now.toISOString().slice(0, 10)}`;
}

export function enrichSnapshotForBackfill(
  snapshot: KnowledgeSnapshot,
  batchId = createBackfillBatchId(),
): KnowledgeSnapshot {
  return {
    ...snapshot,
    names: snapshot.names.map((name) => ({
      ...name,
      locale: name.locale ?? "uk",
      confidence: name.confidence ?? "verified",
      confidenceScore: name.confidenceScore ?? 100,
      reviewStatus: name.reviewStatus ?? "approved",
      importBatchId: batchId,
    })),
  };
}

export function buildStaticBackfillSnapshot(
  batchId = createBackfillBatchId(),
): KnowledgeSnapshot {
  return enrichSnapshotForBackfill(buildKnowledgeSnapshot(), batchId);
}

export function backfillCounts(snapshot: KnowledgeSnapshot): BackfillCounts {
  const counts = snapshotCounts(snapshot);
  return {
    ...counts,
    total:
      counts.sources +
      counts.ingredients +
      counts.names +
      counts.atcCodes +
      counts.interactionRules,
  };
}

export class DryRunBackfillStore implements BackfillStore {
  readonly id = "dry-run";
  loaded: KnowledgeSnapshot | null = null;

  async load(snapshot: KnowledgeSnapshot): Promise<BackfillMutationCounts> {
    this.loaded = snapshot;
    return {
      inserted: backfillCounts(snapshot).total,
      updated: 0,
      skipped: 0,
      conflicts: 0,
    };
  }
}

export class MemoryBackfillStore implements BackfillStore {
  readonly id = "memory";
  readonly sources = new Map<string, InsertKnowledgeSource>();
  readonly ingredients = new Map<string, InsertKnowledgeIngredient>();
  readonly names = new Map<string, InsertKnowledgeIngredientName>();
  readonly atcCodes = new Map<string, InsertKnowledgeAtcCode>();
  readonly interactionRules = new Map<string, InsertKnowledgeInteractionRule>();

  async load(snapshot: KnowledgeSnapshot): Promise<BackfillMutationCounts> {
    const mutations: BackfillMutationCounts = {
      inserted: 0,
      updated: 0,
      skipped: 0,
      conflicts: 0,
    };

    upsertByKey(this.sources, snapshot.sources, (row) => row.key, mutations);
    upsertByKey(
      this.ingredients,
      snapshot.ingredients,
      (row) => row.innKey,
      mutations,
    );
    for (const row of snapshot.names) {
      const existing = this.names.get(row.normalized);
      if (existing && existing.ingredientInnKey !== row.ingredientInnKey) {
        mutations.conflicts++;
        mutations.skipped++;
        continue;
      }
      upsertOne(this.names, row.normalized, row, mutations);
    }
    upsertByKey(this.atcCodes, snapshot.atcCodes, (row) => row.code, mutations);
    upsertByKey(
      this.interactionRules,
      snapshot.interactionRules,
      (row) => row.pairKey,
      mutations,
    );

    return mutations;
  }
}

function upsertByKey<T>(
  map: Map<string, T>,
  rows: readonly T[],
  keyOf: (row: T) => string,
  mutations: BackfillMutationCounts,
): void {
  for (const row of rows) {
    upsertOne(map, keyOf(row), row, mutations);
  }
}

function upsertOne<T>(
  map: Map<string, T>,
  key: string,
  row: T,
  mutations: BackfillMutationCounts,
): void {
  if (map.has(key)) {
    mutations.updated++;
  } else {
    mutations.inserted++;
  }
  map.set(key, row);
}

export async function runStaticBackfill(
  store: BackfillStore,
  opts: { force?: boolean; batchId?: string } = {},
): Promise<BackfillReport> {
  const quality = validateKnowledge();
  const batchId = opts.batchId ?? createBackfillBatchId();
  const snapshot = buildStaticBackfillSnapshot(batchId);
  const counts = backfillCounts(snapshot);
  const warnings: string[] = [];
  const mayLoad = quality.ok || opts.force === true;
  const mutations = mayLoad
    ? await store.load(snapshot)
    : { inserted: 0, updated: 0, skipped: counts.total, conflicts: 0 };

  if (!quality.ok && opts.force !== true) {
    warnings.push("Knowledge quality validation failed; backfill was not loaded.");
  }

  return {
    ok: quality.ok || opts.force === true,
    mode: store.id,
    batchId,
    counts,
    mutations,
    quality,
    warnings,
    loaded: mayLoad,
  };
}

