import { describe, it, expect, beforeEach } from "vitest";
import { knowledgeSearch, clearSearchCache } from "../search";
import { getKnowledgeEngineStats } from "../index";

beforeEach(() => {
  clearSearchCache();
});

describe("knowledgeSearch (offline / skipExternal)", () => {
  it("returns an empty result for a blank query without touching stages", async () => {
    const result = await knowledgeSearch("   ", { skipExternal: true });
    expect(result.query).toBe("");
    expect(result.normalized).toBeNull();
    expect(result.catalogMatches).toHaveLength(0);
  });

  it("resolves a Ukrainian brand via the dictionary stage", async () => {
    const result = await knowledgeSearch("Нурофен", { skipExternal: true });
    expect(result.resolvedStage).toBe("dictionary");
    expect(result.normalized?.english).toBe("Ibuprofen");
    expect(result.atc).not.toBeNull();
  });

  it("does not call external providers when skipExternal is set", async () => {
    const result = await knowledgeSearch("Панадол", { skipExternal: true });
    expect(result.external).toBeNull();
  });

  it("serves repeated queries from cache", async () => {
    const first = await knowledgeSearch("Ксарелто", { skipExternal: true });
    expect(first.fromCache).toBe(false);
    const second = await knowledgeSearch("Ксарелто", { skipExternal: true });
    expect(second.fromCache).toBe(true);
  });

  it("suggests AI when nothing resolves the query", async () => {
    const result = await knowledgeSearch("zzz-not-a-drug-xyz", {
      skipExternal: true,
    });
    expect(result.resolvedStage).toBe("ai");
    expect(result.suggestAi).toBe(true);
  });

  it("finds catalog matches by resolved INN for brand queries", async () => {
    const result = await knowledgeSearch("Нурофен", { skipExternal: true });
    expect(result.catalogMatches.length).toBeGreaterThan(0);
  });
});

describe("getKnowledgeEngineStats", () => {
  it("reports dictionary, interaction, and provider status", () => {
    const stats = getKnowledgeEngineStats();
    expect(stats.dictionary.ingredients).toBeGreaterThan(0);
    expect(stats.dictionary.mappings).toBeGreaterThanOrEqual(500);
    expect(stats.interactionRules).toBeGreaterThanOrEqual(250);
    expect(typeof stats.barcodeResolver).toBe("string");
    expect(typeof stats.catalogImporter).toBe("string");
  });
});
