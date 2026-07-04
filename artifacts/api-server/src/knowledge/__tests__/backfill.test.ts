import { describe, expect, it } from "vitest";
import {
  DryRunBackfillStore,
  MemoryBackfillStore,
  STATIC_BACKFILL_BATCH_PREFIX,
  backfillCounts,
  buildStaticBackfillSnapshot,
  createBackfillBatchId,
  enrichSnapshotForBackfill,
  runStaticBackfill,
} from "../backfill";
import { buildKnowledgeSnapshot } from "../import/pipeline";
import { buildKnowledgeQualityJsonReport } from "../qualityReport";
import {
  snapshotToRuntimeRows,
  verifyKnowledgeRuntime,
} from "../runtimeVerify";
import { resolveRuntimeNameFromRows } from "../dbRuntime";

describe("static knowledge backfill", () => {
  it("creates stable date-based batch ids", () => {
    expect(createBackfillBatchId(new Date("2026-07-03T10:20:30.000Z"))).toBe(
      "static-backfill-2026-07-03",
    );
  });

  it("uses the v0.6 static backfill prefix", () => {
    expect(createBackfillBatchId()).toContain(STATIC_BACKFILL_BATCH_PREFIX);
  });

  it("preserves source counts while enriching snapshots", () => {
    const base = buildKnowledgeSnapshot();
    const enriched = enrichSnapshotForBackfill(base, "batch-test");
    expect(enriched.sources).toHaveLength(base.sources.length);
  });

  it("preserves ingredient counts while enriching snapshots", () => {
    const base = buildKnowledgeSnapshot();
    const enriched = enrichSnapshotForBackfill(base, "batch-test");
    expect(enriched.ingredients).toHaveLength(base.ingredients.length);
  });

  it("preserves ATC counts while enriching snapshots", () => {
    const base = buildKnowledgeSnapshot();
    const enriched = enrichSnapshotForBackfill(base, "batch-test");
    expect(enriched.atcCodes).toHaveLength(base.atcCodes.length);
  });

  it("preserves interaction rule counts while enriching snapshots", () => {
    const base = buildKnowledgeSnapshot();
    const enriched = enrichSnapshotForBackfill(base, "batch-test");
    expect(enriched.interactionRules).toHaveLength(
      base.interactionRules.length,
    );
  });

  it("marks every backfilled mapping as approved", () => {
    const snapshot = buildStaticBackfillSnapshot("batch-test");
    expect(
      snapshot.names.every((name) => name.reviewStatus === "approved"),
    ).toBe(true);
  });

  it("marks every backfilled mapping as verified confidence", () => {
    const snapshot = buildStaticBackfillSnapshot("batch-test");
    expect(snapshot.names.every((name) => name.confidence === "verified")).toBe(
      true,
    );
  });

  it("sets confidence score to 100 for static mappings", () => {
    const snapshot = buildStaticBackfillSnapshot("batch-test");
    expect(snapshot.names.every((name) => name.confidenceScore === 100)).toBe(
      true,
    );
  });

  it("sets Ukrainian locale for static mappings", () => {
    const snapshot = buildStaticBackfillSnapshot("batch-test");
    expect(snapshot.names.every((name) => name.locale === "uk")).toBe(true);
  });

  it("attaches import batch metadata to every mapping", () => {
    const snapshot = buildStaticBackfillSnapshot("batch-test");
    expect(
      snapshot.names.every((name) => name.importBatchId === "batch-test"),
    ).toBe(true);
  });

  it("keeps provenance source keys on every mapping", () => {
    const snapshot = buildStaticBackfillSnapshot("batch-test");
    expect(snapshot.names.every((name) => Boolean(name.sourceKey))).toBe(true);
  });

  it("keeps evidence levels on every mapping", () => {
    const snapshot = buildStaticBackfillSnapshot("batch-test");
    expect(snapshot.names.every((name) => Boolean(name.evidenceLevel))).toBe(
      true,
    );
  });

  it("reports total row count across normalized tables", () => {
    const snapshot = buildStaticBackfillSnapshot("batch-test");
    const counts = backfillCounts(snapshot);
    expect(counts.total).toBe(
      counts.sources +
        counts.ingredients +
        counts.names +
        counts.atcCodes +
        counts.interactionRules,
    );
  });

  it("loads dry-run backfills without a database", async () => {
    const store = new DryRunBackfillStore();
    const report = await runStaticBackfill(store, { batchId: "batch-test" });
    expect(report.mode).toBe("dry-run");
    expect(report.loaded).toBe(true);
    expect(store.loaded?.names[0]?.importBatchId).toBe("batch-test");
  });

  it("counts dry-run rows as planned inserts", async () => {
    const report = await runStaticBackfill(new DryRunBackfillStore(), {
      batchId: "batch-test",
    });
    expect(report.mutations.inserted).toBe(report.counts.total);
  });

  it("does not report dry-run updates", async () => {
    const report = await runStaticBackfill(new DryRunBackfillStore(), {
      batchId: "batch-test",
    });
    expect(report.mutations.updated).toBe(0);
  });

  it("does not report dry-run conflicts", async () => {
    const report = await runStaticBackfill(new DryRunBackfillStore(), {
      batchId: "batch-test",
    });
    expect(report.mutations.conflicts).toBe(0);
  });

  it("inserts first memory backfill run", async () => {
    const store = new MemoryBackfillStore();
    const report = await runStaticBackfill(store, { batchId: "batch-test" });
    expect(report.mutations.inserted).toBe(report.counts.total);
  });

  it("updates second memory backfill run idempotently", async () => {
    const store = new MemoryBackfillStore();
    await runStaticBackfill(store, { batchId: "batch-test" });
    const second = await runStaticBackfill(store, { batchId: "batch-test" });
    expect(second.mutations.inserted).toBe(0);
    expect(second.mutations.updated).toBe(second.counts.total);
  });

  it("keeps one memory row per normalized mapping", async () => {
    const store = new MemoryBackfillStore();
    const report = await runStaticBackfill(store, { batchId: "batch-test" });
    expect(store.names.size).toBe(report.counts.names);
  });

  it("detects conflicting name to ingredient mappings", async () => {
    const store = new MemoryBackfillStore();
    const snapshot = buildStaticBackfillSnapshot("batch-test");
    const first = snapshot.names[0];
    expect(first).toBeDefined();
    store.names.set(first.normalized, { ...first, ingredientInnKey: "other" });
    const mutations = await store.load(snapshot);
    expect(mutations.conflicts).toBe(1);
  });

  it("skips conflicting mappings instead of overwriting them", async () => {
    const store = new MemoryBackfillStore();
    const snapshot = buildStaticBackfillSnapshot("batch-test");
    const first = snapshot.names[0];
    store.names.set(first.normalized, { ...first, ingredientInnKey: "other" });
    await store.load(snapshot);
    expect(store.names.get(first.normalized)?.ingredientInnKey).toBe("other");
  });

  it("converts backfill snapshot into DB runtime rows", () => {
    const rows = snapshotToRuntimeRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.reviewStatus === "approved")).toBe(true);
  });

  it("runtime rows can normalize from the DB provider", () => {
    const rows = snapshotToRuntimeRows();
    const result = resolveRuntimeNameFromRows("Ibuprofen", rows);
    expect(result.source).toBe("db");
    expect(result.entry?.runtimeSource).toBe("db");
  });

  it("runtime rows preserve source attribution", () => {
    const rows = snapshotToRuntimeRows();
    const result = resolveRuntimeNameFromRows("Ibuprofen", rows);
    expect(result.entry?.provenance.sourceKey).toBeTruthy();
    expect(result.entry?.provenance.sourceLabel).toBeTruthy();
  });

  it("runtime rows preserve review status attribution", () => {
    const rows = snapshotToRuntimeRows();
    const result = resolveRuntimeNameFromRows("Ibuprofen", rows);
    expect(result.entry?.provenance.reviewStatus).toBe("approved");
  });

  it("runtime rows preserve import batch attribution", () => {
    const rows = snapshotToRuntimeRows();
    const result = resolveRuntimeNameFromRows("Ibuprofen", rows);
    expect(result.entry?.provenance.importBatchId).toContain(
      STATIC_BACKFILL_BATCH_PREFIX,
    );
  });

  it("runtime verification passes without DATABASE_URL", async () => {
    const oldUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const report = await verifyKnowledgeRuntime();
      expect(report.ok).toBe(true);
      expect(report.databaseUrlConfigured).toBe(false);
    } finally {
      if (oldUrl) process.env.DATABASE_URL = oldUrl;
    }
  });

  it("runtime verification samples DB-shaped rows", async () => {
    const report = await verifyKnowledgeRuntime({ sample: "Ibuprofen" });
    expect(report.samples.dbMock.source).toBe("db");
  });

  it("runtime verification confirms static fallback availability", async () => {
    const report = await verifyKnowledgeRuntime();
    expect(report.checks.staticFallbackAvailable).toBe(true);
  });

  it("quality report includes v0.8 marker", async () => {
    const report = await buildKnowledgeQualityJsonReport();
    expect(report.version).toBe("0.8");
  });

  it("quality report includes provenance coverage", async () => {
    const report = await buildKnowledgeQualityJsonReport();
    expect(report.coverage.mappingProvenancePct).toBe(100);
  });

  it("quality report includes approved mapping coverage", async () => {
    const report = await buildKnowledgeQualityJsonReport();
    expect(report.coverage.approvedMappingPct).toBe(100);
  });

  it("quality report includes runtime status", async () => {
    const report = await buildKnowledgeQualityJsonReport();
    expect(report.runtime.staticFallbackEnabled).toBe(true);
  });
});
