import { describe, it, expect } from "vitest";
import {
  buildKnowledgeSnapshot,
  snapshotCounts,
  runImportPipeline,
  DryRunLoader,
} from "../import/pipeline";
import { isKnownSource } from "../provenance";
import { getDictionaryStats } from "../dictionary";

describe("buildKnowledgeSnapshot", () => {
  const snapshot = buildKnowledgeSnapshot();

  it("produces non-empty normalized tables", () => {
    const counts = snapshotCounts(snapshot);
    expect(counts.sources).toBeGreaterThan(0);
    expect(counts.ingredients).toBeGreaterThan(0);
    expect(counts.names).toBeGreaterThan(0);
    expect(counts.atcCodes).toBeGreaterThan(0);
    expect(counts.interactionRules).toBeGreaterThan(0);
  });

  it("deduplicates ingredients by natural key (matches dictionary stats)", () => {
    expect(snapshot.ingredients.length).toBe(getDictionaryStats().ingredients);
    const keys = snapshot.ingredients.map((i) => i.innKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("name mappings have unique normalized keys", () => {
    const keys = snapshot.names.map((n) => n.normalized);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every name mapping references a known source", () => {
    for (const n of snapshot.names) {
      expect(isKnownSource(n.sourceKey)).toBe(true);
    }
  });

  it("every interaction rule row has a sorted pair key and known source", () => {
    for (const r of snapshot.interactionRules) {
      const expected = [
        r.ingredientA.toLowerCase(),
        r.ingredientB.toLowerCase(),
      ]
        .sort()
        .join("|");
      expect(r.pairKey).toBe(expected);
      expect(isKnownSource(r.sourceKey)).toBe(true);
    }
  });

  it("is deterministic across runs", () => {
    const a = snapshotCounts(buildKnowledgeSnapshot());
    const b = snapshotCounts(buildKnowledgeSnapshot());
    expect(a).toEqual(b);
  });
});

describe("runImportPipeline", () => {
  it("validates, snapshots and loads via the injected loader", async () => {
    const loader = new DryRunLoader();
    const result = await runImportPipeline(loader);
    expect(result.ok).toBe(true);
    expect(result.loaded).toBe(true);
    expect(result.loaderId).toBe("dry-run");
    expect(loader.loaded).not.toBeNull();
    expect(loader.loaded?.ingredients.length).toBe(result.counts.ingredients);
  });
});
