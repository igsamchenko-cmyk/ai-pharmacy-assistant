import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_RUNTIME_SMOKE_MISSING_DATABASE_URL,
  RuntimeSmokeConfigurationError,
  nonApprovedRowsAreRuntimeHidden,
  runKnowledgeRuntimeSmoke,
  shouldRunOptionalDbTests,
  validateRuntimeSmokeEnvironment,
} from "../runtimeSmoke";
import type { DbMappingRow, RuntimeDbStore } from "../dbRuntime";

function mapping(overrides: Partial<DbMappingRow> = {}): DbMappingRow {
  return {
    normalized: "ібупрофен",
    name: "Ібупрофен",
    kind: "inn",
    ingredientInnKey: "ibuprofen",
    sourceKey: "who-inn",
    evidenceLevel: "reference",
    locale: "uk",
    confidence: "verified",
    confidenceScore: 100,
    reviewStatus: "approved",
    importBatchId: "smoke-batch-1",
    importedAt: new Date("2026-07-04T00:00:00.000Z"),
    inn: "Ібупрофен",
    latin: "Ibuprofenum",
    english: "Ibuprofen",
    atcCode: "M01AE01",
    groupName: "НПЗЗ",
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

describe("knowledge runtime smoke environment", () => {
  it("requires DATABASE_URL with the documented message", () => {
    expect(validateRuntimeSmokeEnvironment({})).toEqual([
      KNOWLEDGE_RUNTIME_SMOKE_MISSING_DATABASE_URL,
    ]);
  });

  it("accepts a configured DATABASE_URL", () => {
    expect(
      validateRuntimeSmokeEnvironment({
        DATABASE_URL: "postgresql://local/test",
      }),
    ).toEqual([]);
  });

  it("does not run optional DB tests without an explicit flag", () => {
    expect(
      shouldRunOptionalDbTests({ DATABASE_URL: "postgresql://local/test" }),
    ).toBe(false);
  });

  it("does not run optional DB tests when the DB URL is missing", () => {
    expect(shouldRunOptionalDbTests({ RUN_DB_TESTS: "true" })).toBe(false);
  });

  it("runs optional DB tests only when flag and DB URL are both present", () => {
    expect(
      shouldRunOptionalDbTests({
        RUN_DB_TESTS: "true",
        DATABASE_URL: "postgresql://local/test",
      }),
    ).toBe(true);
  });

  it("checks that non-approved rows stay hidden from runtime", () => {
    expect(nonApprovedRowsAreRuntimeHidden()).toBe(true);
  });

  it("throws a configuration error when DATABASE_URL is missing", async () => {
    await expect(
      runKnowledgeRuntimeSmoke({ env: {}, store: store([mapping()]) }),
    ).rejects.toBeInstanceOf(RuntimeSmokeConfigurationError);
  });

  it("keeps the missing DATABASE_URL error text stable", async () => {
    await expect(
      runKnowledgeRuntimeSmoke({ env: {}, store: store([mapping()]) }),
    ).rejects.toThrow(KNOWLEDGE_RUNTIME_SMOKE_MISSING_DATABASE_URL);
  });
});

describe("knowledge runtime smoke report", () => {
  const env = {
    DATABASE_URL: "postgresql://farmassist:secret@localhost:5432/farmassist",
  };

  it("passes with an approved DB-backed mapping", async () => {
    const report = await runKnowledgeRuntimeSmoke({
      env,
      store: store([mapping()]),
    });
    expect(report.ok).toBe(true);
  });

  it("keeps the default Ukrainian sample in the report", async () => {
    const report = await runKnowledgeRuntimeSmoke({
      env,
      store: store([mapping()]),
    });
    expect(report.sample).toBe("Ібупрофен");
  });

  it("reports schema readiness for a healthy store", async () => {
    const report = await runKnowledgeRuntimeSmoke({
      env,
      store: store([mapping()]),
    });
    expect(report.status.dbSchemaStatus).toBe("ready");
    expect(report.checks.schemaExists).toBe(true);
  });

  it("marks DB runtime as requested during smoke", async () => {
    const report = await runKnowledgeRuntimeSmoke({
      env,
      store: store([mapping()]),
    });
    expect(report.status.dbRuntimeRequested).toBe(true);
    expect(report.status.runtimeMode).toBe("db");
  });

  it("reports that a DB URL is configured without exposing it", async () => {
    const report = await runKnowledgeRuntimeSmoke({
      env,
      store: store([mapping()]),
    });
    expect(report.status.databaseUrlConfigured).toBe(true);
    expect(JSON.stringify(report)).not.toContain(
      "postgresql://farmassist:secret",
    );
  });

  it("counts approved mappings", async () => {
    const report = await runKnowledgeRuntimeSmoke({
      env,
      store: store([mapping()]),
    });
    expect(report.status.approvedMappingsCount).toBe(1);
    expect(report.checks.approvedMappingsPresent).toBe(true);
  });

  it("normalizes through the DB provider", async () => {
    const report = await runKnowledgeRuntimeSmoke({
      env,
      store: store([mapping()]),
    });
    expect(report.samples.runtime.source).toBe("db");
    expect(report.samples.runtime.entry?.ingredient.english).toBe("Ibuprofen");
    expect(report.checks.dbNormalizeWorks).toBe(true);
  });

  it("searches through the DB-backed runtime path", async () => {
    const report = await runKnowledgeRuntimeSmoke({
      env,
      store: store([mapping()]),
    });
    expect(report.samples.search.source).toBe("db");
    expect(report.samples.search.normalized?.english).toBe("Ibuprofen");
    expect(report.checks.dbSearchWorks).toBe(true);
  });

  it("verifies that static fallback still works", async () => {
    const report = await runKnowledgeRuntimeSmoke({
      env,
      store: store([mapping()]),
    });
    expect(report.samples.staticFallback.source).toBe("static");
    expect(report.checks.staticFallbackWorks).toBe(true);
  });

  it("reports the DB provider as active", async () => {
    const report = await runKnowledgeRuntimeSmoke({
      env,
      store: store([mapping()]),
    });
    expect(report.status.providerStatus.db).toBe("active");
    expect(report.checks.runtimeStatusDbAvailable).toBe(true);
  });

  it("keeps warnings empty for a healthy store", async () => {
    const report = await runKnowledgeRuntimeSmoke({
      env,
      store: store([mapping()]),
    });
    expect(report.warnings).toEqual([]);
  });

  it("fails when no approved rows are visible", async () => {
    const report = await runKnowledgeRuntimeSmoke({
      env,
      store: store([mapping({ reviewStatus: "pending" })]),
    });
    expect(report.ok).toBe(false);
    expect(report.checks.approvedMappingsPresent).toBe(false);
    expect(report.checks.dbNormalizeWorks).toBe(false);
  });

  it("keeps pending, rejected and needs_review rows out of runtime visibility", async () => {
    const report = await runKnowledgeRuntimeSmoke({
      env,
      store: store([
        mapping({ reviewStatus: "pending" }),
        mapping({
          normalized: "rejected",
          name: "Rejected",
          reviewStatus: "rejected",
        }),
        mapping({
          normalized: "needs",
          name: "Needs",
          reviewStatus: "needs_review",
        }),
      ]),
    });
    expect(report.status.pendingCount).toBe(1);
    expect(report.status.rejectedCount).toBe(1);
    expect(report.status.needsReviewCount).toBe(1);
    expect(report.checks.nonApprovedRowsIgnored).toBe(true);
  });

  it("reports the latest import batch", async () => {
    const report = await runKnowledgeRuntimeSmoke({
      env,
      store: store([
        mapping({
          importBatchId: "old",
          importedAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
        mapping({
          normalized: "new",
          name: "Нурофен",
          importBatchId: "new",
          importedAt: new Date("2026-02-01T00:00:00.000Z"),
        }),
      ]),
    });
    expect(report.status.lastImportBatch).toBe("new");
  });

  it("supports a custom Ukrainian sample", async () => {
    const report = await runKnowledgeRuntimeSmoke({
      env,
      sample: "Нурофен",
      store: store([
        mapping({ normalized: "нурофен", name: "Нурофен", kind: "brand" }),
      ]),
    });
    expect(report.ok).toBe(true);
    expect(report.sample).toBe("Нурофен");
  });

  it("fails when DB rows have unsupported runtime kinds", async () => {
    const report = await runKnowledgeRuntimeSmoke({
      env,
      store: store([mapping({ kind: "unsupported" })]),
    });
    expect(report.ok).toBe(false);
    expect(report.checks.dbNormalizeWorks).toBe(false);
  });
});

describe.skipIf(!shouldRunOptionalDbTests())(
  "knowledge runtime real DB smoke",
  () => {
    it("passes against the configured database", async () => {
      const report = await runKnowledgeRuntimeSmoke();
      expect(report.ok).toBe(true);
    });
  },
);
