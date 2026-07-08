import { describe, expect, it, beforeEach } from "vitest";
import {
  getKnowledgeRuntimeStatus,
  resolveRuntimeName,
  resolveRuntimeNameFromRows,
  type DbMappingRow,
  type RuntimeDbStore,
} from "../dbRuntime";
import { knowledgeSearch, clearSearchCache } from "../search";

function mapping(overrides: Partial<DbMappingRow> = {}): DbMappingRow {
  return {
    normalized: "runtimebrand",
    name: "RuntimeBrand",
    kind: "brand",
    ingredientInnKey: "runtime-inn",
    sourceKey: "who-inn",
    evidenceLevel: "reference",
    locale: "uk",
    confidence: "verified",
    confidenceScore: 100,
    reviewStatus: "approved",
    importBatchId: "batch-1",
    importedAt: new Date("2026-07-03T00:00:00.000Z"),
    inn: "Runtime INN",
    latin: "Runtime Latin",
    english: "Runtime English",
    atcCode: "A01AA01",
    groupName: "Runtime group",
    sourceLabel: "WHO INN",
    sourceType: "reference",
    sourceReliability: "high",
    sourceUrl: "https://example.test/source",
    ...overrides,
  };
}

function store(rows: DbMappingRow[]): RuntimeDbStore {
  return { listMappings: async () => rows };
}

async function withRuntimeFlag<T>(value: string | undefined, fn: () => Promise<T>) {
  const old = process.env.KNOWLEDGE_DB_RUNTIME;
  if (value === undefined) {
    delete process.env.KNOWLEDGE_DB_RUNTIME;
  } else {
    process.env.KNOWLEDGE_DB_RUNTIME = value;
  }
  try {
    return await fn();
  } finally {
    if (old === undefined) {
      delete process.env.KNOWLEDGE_DB_RUNTIME;
    } else {
      process.env.KNOWLEDGE_DB_RUNTIME = old;
    }
  }
}

describe("DB-backed knowledge runtime", () => {
  beforeEach(() => {
    clearSearchCache();
  });

  it("uses the static provider when DB runtime is disabled", async () => {
    await withRuntimeFlag(undefined, async () => {
      const result = await resolveRuntimeName("Ibuprofen", store([mapping()]));
      expect(result.source).toBe("static");
      expect(result.entry?.runtimeSource).toBe("static");
    });
  });

  it("uses approved DB mappings when DB runtime is enabled", async () => {
    await withRuntimeFlag("true", async () => {
      const result = await resolveRuntimeName("RuntimeBrand", store([mapping()]));
      expect(result.source).toBe("db");
      expect(result.entry?.ingredient.english).toBe("Runtime English");
      expect(result.entry?.confidence).toBe("verified");
    });
  });

  it("ignores pending mappings in user-facing runtime lookup", async () => {
    await withRuntimeFlag("true", async () => {
      const result = await resolveRuntimeName(
        "PendingBrand",
        store([mapping({ normalized: "pendingbrand", name: "PendingBrand", reviewStatus: "pending" })]),
      );
      expect(result.entry).toBeNull();
      expect(result.source).toBe("fallback");
    });
  });

  it("ignores rejected mappings in user-facing runtime lookup", async () => {
    await withRuntimeFlag("true", async () => {
      const result = await resolveRuntimeName(
        "RejectedBrand",
        store([mapping({ normalized: "rejectedbrand", name: "RejectedBrand", reviewStatus: "rejected" })]),
      );
      expect(result.entry).toBeNull();
      expect(result.source).toBe("fallback");
    });
  });

  it("ignores needs_review mappings in user-facing runtime lookup", async () => {
    await withRuntimeFlag("true", async () => {
      const result = await resolveRuntimeName(
        "ReviewBrand",
        store([mapping({ normalized: "reviewbrand", name: "ReviewBrand", reviewStatus: "needs_review" })]),
      );
      expect(result.entry).toBeNull();
      expect(result.source).toBe("fallback");
    });
  });

  it("keeps real-world typo review candidates hidden until approved", () => {
    const rows = [
      mapping({
        normalized: "paratsytamol",
        name: "paratsytamol",
        kind: "synonym",
        reviewStatus: "needs_review",
        confidence: "high",
        confidenceScore: 80,
      }),
      mapping({
        normalized: "mahniia sulfat",
        name: "mahniia sulfat",
        kind: "synonym",
        reviewStatus: "pending",
        confidence: "medium",
        confidenceScore: 60,
      }),
    ];

    expect(resolveRuntimeNameFromRows("paratsytamol", rows).source).toBe(
      "fallback",
    );
    expect(resolveRuntimeNameFromRows("mahniia sulfat", rows).source).toBe(
      "fallback",
    );
    rows[0].reviewStatus = "approved";
    expect(resolveRuntimeNameFromRows("paratsytamol", rows).source).toBe("db");
  });

  it("returns DB provenance for approved mappings", async () => {
    await withRuntimeFlag("true", async () => {
      const result = await resolveRuntimeName("RuntimeBrand", store([mapping()]));
      expect(result.entry?.provenance).toMatchObject({
        sourceKey: "who-inn",
        sourceLabel: "WHO INN",
        sourceType: "reference",
        sourceReliability: "high",
        reviewStatus: "approved",
        importBatchId: "batch-1",
      });
    });
  });

  it("falls back to static without crashing when DB is unavailable", async () => {
    await withRuntimeFlag("true", async () => {
      const oldUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;
      try {
        const result = await resolveRuntimeName("Ibuprofen");
        expect(result.source).toBe("static");
        expect(result.warnings.length).toBeGreaterThan(0);
      } finally {
        if (oldUrl) process.env.DATABASE_URL = oldUrl;
      }
    });
  });

  it("reports runtime status counts and last import batch", async () => {
    await withRuntimeFlag("true", async () => {
      const status = await getKnowledgeRuntimeStatus(
        store([
          mapping(),
          mapping({ normalized: "p", name: "P", reviewStatus: "pending" }),
          mapping({ normalized: "r", name: "R", reviewStatus: "rejected" }),
          mapping({ normalized: "n", name: "N", reviewStatus: "needs_review" }),
        ]),
      );
      expect(status.dbAvailable).toBe(true);
      expect(status.approvedMappingsCount).toBe(1);
      expect(status.pendingCount).toBe(1);
      expect(status.rejectedCount).toBe(1);
      expect(status.needsReviewCount).toBe(1);
      expect(status.lastImportBatch).toBe("batch-1");
    });
  });

  it("normalizes through DB provenance inside knowledgeSearch", async () => {
    await withRuntimeFlag("true", async () => {
      const result = await knowledgeSearch("RuntimeBrand", {
        skipExternal: true,
        runtimeStore: store([mapping()]),
      });
      expect(result.source).toBe("db");
      expect(result.normalized?.english).toBe("Runtime English");
      expect(result.provenance?.sourceKey).toBe("who-inn");
      expect(result.confidence).toBe("verified");
    });
  });

  it("supports substring lookup for approved DB mappings", async () => {
    await withRuntimeFlag("true", async () => {
      const result = await resolveRuntimeName("Runtime", store([mapping()]));
      expect(result.source).toBe("db");
    });
  });

  it("falls back to static after an enabled DB miss", async () => {
    await withRuntimeFlag("true", async () => {
      const result = await resolveRuntimeName("Ibuprofen", store([mapping()]));
      expect(result.source).toBe("static");
      expect(result.entry?.ingredient.english).toBe("Ibuprofen");
    });
  });

  it("reports DB disabled status without touching the injected store", async () => {
    await withRuntimeFlag("false", async () => {
      const status = await getKnowledgeRuntimeStatus(store([mapping()]));
      expect(status.runtimeMode).toBe("static");
      expect(status.dbAvailable).toBe(false);
      expect(status.providerStatus.db).toBe("disabled");
    });
  });

  it("reports DB unavailable status with warnings", async () => {
    await withRuntimeFlag("true", async () => {
      const oldUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;
      try {
        const status = await getKnowledgeRuntimeStatus();
        expect(status.dbAvailable).toBe(false);
        expect(status.providerStatus.db).toBe("unavailable");
        expect(status.warnings.length).toBeGreaterThan(0);
      } finally {
        if (oldUrl) process.env.DATABASE_URL = oldUrl;
      }
    });
  });

  it("preserves high confidence DB mappings", async () => {
    await withRuntimeFlag("true", async () => {
      const result = await resolveRuntimeName(
        "HighBrand",
        store([mapping({ normalized: "highbrand", name: "HighBrand", confidence: "high", confidenceScore: 85 })]),
      );
      expect(result.entry?.confidence).toBe("high");
      expect(result.entry?.confidenceScore).toBe(85);
    });
  });

  it("downgrades unknown confidence labels to medium", async () => {
    await withRuntimeFlag("true", async () => {
      const result = await resolveRuntimeName(
        "OddBrand",
        store([mapping({ normalized: "oddbrand", name: "OddBrand", confidence: "odd" })]),
      );
      expect(result.entry?.confidence).toBe("medium");
    });
  });

  it("ignores DB rows with unsupported mapping kinds", async () => {
    await withRuntimeFlag("true", async () => {
      const result = await resolveRuntimeName(
        "RuntimeBrand",
        store([mapping({ kind: "unsupported" })]),
      );
      expect(result.entry).toBeNull();
      expect(result.source).toBe("fallback");
    });
  });

  it("chooses the latest import batch by importedAt", async () => {
    await withRuntimeFlag("true", async () => {
      const status = await getKnowledgeRuntimeStatus(
        store([
          mapping({ importBatchId: "old", importedAt: new Date("2026-01-01T00:00:00.000Z") }),
          mapping({ normalized: "new", name: "New", importBatchId: "new", importedAt: new Date("2026-02-01T00:00:00.000Z") }),
        ]),
      );
      expect(status.lastImportBatch).toBe("new");
    });
  });

  it("reports DB source distribution for approved rows", async () => {
    await withRuntimeFlag("true", async () => {
      const status = await getKnowledgeRuntimeStatus(
        store([
          mapping(),
          mapping({ normalized: "second", name: "Second" }),
          mapping({ normalized: "pending", name: "Pending", reviewStatus: "pending" }),
        ]),
      );
      expect(status.sourceDistribution.db).toBe(2);
      expect(status.sourceDistribution.fallback).toBe(0);
    });
  });

  it("reports fallback source distribution when enabled DB is unavailable", async () => {
    await withRuntimeFlag("true", async () => {
      const oldUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;
      try {
        const status = await getKnowledgeRuntimeStatus();
        expect(status.sourceDistribution.fallback).toBeGreaterThan(0);
      } finally {
        if (oldUrl) process.env.DATABASE_URL = oldUrl;
      }
    });
  });

  it("keeps knowledgeSearch on static source when runtime is disabled", async () => {
    await withRuntimeFlag("false", async () => {
      const result = await knowledgeSearch("Ibuprofen", {
        skipExternal: true,
        runtimeStore: store([mapping()]),
      });
      expect(result.source).toBe("static");
    });
  });

  it("keeps empty knowledgeSearch queries on fallback source", async () => {
    await withRuntimeFlag("true", async () => {
      const result = await knowledgeSearch("   ", {
        skipExternal: true,
        runtimeStore: store([mapping()]),
      });
      expect(result.source).toBe("fallback");
      expect(result.normalized).toBeNull();
    });
  });

  it("marks cached DB search results as fromCache on the second call", async () => {
    await withRuntimeFlag("true", async () => {
      const runtimeStore = store([mapping()]);
      const first = await knowledgeSearch("RuntimeBrand", {
        skipExternal: true,
        runtimeStore,
      });
      const second = await knowledgeSearch("RuntimeBrand", {
        skipExternal: true,
        runtimeStore,
      });
      expect(first.fromCache).toBe(false);
      expect(second.fromCache).toBe(true);
      expect(second.source).toBe("db");
    });
  });


  it("makes a pending row visible after it is approved", () => {
    const rows = [
      mapping({ normalized: "transitionbrand", name: "TransitionBrand", reviewStatus: "pending" }),
    ];
    expect(resolveRuntimeNameFromRows("TransitionBrand", rows).source).toBe("fallback");
    rows[0].reviewStatus = "approved";
    expect(resolveRuntimeNameFromRows("TransitionBrand", rows).source).toBe("db");
  });

  it("hides an approved row after it is rejected", () => {
    const rows = [
      mapping({ normalized: "hidebrand", name: "HideBrand", reviewStatus: "approved" }),
    ];
    expect(resolveRuntimeNameFromRows("HideBrand", rows).source).toBe("db");
    rows[0].reviewStatus = "rejected";
    expect(resolveRuntimeNameFromRows("HideBrand", rows).source).toBe("fallback");
  });
  it("returns importedAt as an ISO provenance string", async () => {
    await withRuntimeFlag("true", async () => {
      const result = await resolveRuntimeName("RuntimeBrand", store([mapping()]));
      expect(result.entry?.provenance.importedAt).toBe(
        "2026-07-03T00:00:00.000Z",
      );
    });
  });

  it("preserves DB ATC and group metadata", async () => {
    await withRuntimeFlag("true", async () => {
      const result = await resolveRuntimeName("RuntimeBrand", store([mapping()]));
      expect(result.entry?.ingredient.atc).toBe("A01AA01");
      expect(result.entry?.ingredient.group).toBe("Runtime group");
    });
  });

  it("uses fallback source for non-drug misses", async () => {
    await withRuntimeFlag("true", async () => {
      const result = await resolveRuntimeName("not-a-known-drug", store([mapping()]));
      expect(result.source).toBe("fallback");
      expect(result.entry).toBeNull();
    });
  });

  it("keeps status warnings empty when DB store is healthy", async () => {
    await withRuntimeFlag("true", async () => {
      const status = await getKnowledgeRuntimeStatus(store([mapping()]));
      expect(status.warnings).toEqual([]);
      expect(status.dbAvailable).toBe(true);
    });
  });
});
