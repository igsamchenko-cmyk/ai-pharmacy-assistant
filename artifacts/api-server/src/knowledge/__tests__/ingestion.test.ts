import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildBulkIngestReport,
  buildRegistryMappingPlan,
  buildRegistryProductionSummary,
  buildReviewableImportPlan,
  commitRegistryProducts,
  commitReviewableImportPlan,
  decodeRegistryBuffer,
  discoverIngestionSources,
  generateImportCandidates,
  parseIngredientExpression,
  parseRegistryFile,
  parseRegistryText,
  searchMissesToImportRows,
  type ImportRow,
  type KnowledgeImportCommitStore,
  type MappingCommitStats,
  type RegistryProductCommitStats,
} from "../index";

function row(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    ingredientId: "ing-paracetamol",
    canonicalInn: "Парацетамол",
    name: "Парацетамол",
    locale: "uk",
    nameType: "ukrainian",
    sourceId: "who-inn",
    confidence: "high",
    atcCode: "N02BE01",
    notes: "test row",
    ...overrides,
  };
}

function mappingStats(
  overrides: Partial<MappingCommitStats> = {},
): MappingCommitStats {
  return {
    plannedRows: 1,
    uniqueNormalizedMappings: 1,
    attempted: 1,
    inserted: 1,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
    chunks: 1,
    chunkSize: 250,
    elapsedMs: 1,
    finalMappingCount: 1,
    finalApprovedMappingCount: 1,
    importBatchStatus: "completed",
    ...overrides,
  };
}

function productStats(
  overrides: Partial<RegistryProductCommitStats> = {},
): RegistryProductCommitStats {
  return {
    plannedProducts: 1,
    plannedManufacturers: 0,
    plannedRegistrations: 1,
    attemptedProducts: 1,
    attemptedManufacturers: 0,
    insertedProducts: 1,
    insertedManufacturers: 0,
    updatedProducts: 0,
    updatedManufacturers: 0,
    unchangedProducts: 0,
    unchangedManufacturers: 0,
    skippedProducts: 0,
    skippedManufacturers: 0,
    failedProducts: 0,
    failedManufacturers: 0,
    chunks: 1,
    chunkSize: 500,
    finalProductCount: 1,
    finalManufacturerCount: 0,
    finalRegistrationCount: 1,
    elapsedMs: 1,
    importBatchStatus: "completed",
    committedProducts: 1,
    committedManufacturers: 0,
    ...overrides,
  };
}

describe("ingestion source discovery", () => {
  it("classifies official/reference sources and blocks commercial catalogs", () => {
    const report = discoverIngestionSources(
      new Date("2026-07-09T00:00:00.000Z"),
    );
    expect(report.approvedSources).toBeGreaterThan(0);
    expect(report.candidateSources).toBeGreaterThan(0);
    expect(report.blockedSources).toBeGreaterThan(0);
    expect(report.policy.commercialCatalogScrapingAllowed).toBe(false);
    expect(report.policy.runtimeRequiresApprovedRows).toBe(true);
    expect(
      report.sources.some(
        (source) => source.key === "ukraine_state_drug_registry",
      ),
    ).toBe(true);
    expect(
      report.sources.find(
        (source) => source.key === "commercial_pharmacy_catalogs",
      )?.status,
    ).toBe("blocked");
  });
});

describe("Ukrainian registry ingestion", () => {
  it("parses registry CSV and generates reviewable candidates", () => {
    const csv = [
      "trade_name,inn,atc_code,status",
      "Парацетамол,Парацетамол,N02BE01,active",
      "Sample Trade,Ібупрофен,M01AE01,active",
    ].join("\n");
    const result = parseRegistryText(csv, { fileName: "registry.csv" });
    const plan = buildReviewableImportPlan(result.candidates);

    expect(result.rawRows).toBe(2);
    expect(result.generatedCandidates).toBe(3);
    expect(
      result.candidates.some((candidate) => candidate.nameType === "brand"),
    ).toBe(true);
    expect(plan.preview.missingSources).toBe(0);
    expect(
      plan.reviewable.some((candidate) => candidate.reviewStatus === "pending"),
    ).toBe(true);
  });

  it("parses the official semicolon registry export shape", () => {
    const csv = [
      [
        "ID",
        "\u0422\u043e\u0440\u0433\u0456\u0432\u0435\u043b\u044c\u043d\u0435 \u043d\u0430\u0439\u043c\u0435\u043d\u0443\u0432\u0430\u043d\u043d\u044f",
        "\u041c\u0456\u0436\u043d\u0430\u0440\u043e\u0434\u043d\u0435 \u043d\u0435\u043f\u0430\u0442\u0435\u043d\u0442\u043e\u0432\u0430\u043d\u0435 \u043d\u0430\u0439\u043c\u0435\u043d\u0443\u0432\u0430\u043d\u043d\u044f",
        "\u0424\u043e\u0440\u043c\u0430 \u0432\u0438\u043f\u0443\u0441\u043a\u0443",
        "\u0421\u043a\u043b\u0430\u0434 (\u0434\u0456\u044e\u0447\u0456)",
        "\u041a\u043e\u0434 \u0410\u0422\u0421 1",
        "\u0417\u0430\u044f\u0432\u043d\u0438\u043a: \u043d\u0430\u0437\u0432\u0430 \u0443\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u043e\u044e",
        "\u0412\u0438\u0440\u043e\u0431\u043d\u0438\u043a 1: \u043d\u0430\u0437\u0432\u0430 \u0443\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u043e\u044e",
        "\u0412\u0438\u0440\u043e\u0431\u043d\u0438\u043a 1: \u043a\u0440\u0430\u0457\u043d\u0430",
        "\u041d\u043e\u043c\u0435\u0440 \u0420\u0435\u0454\u0441\u0442\u0440\u0430\u0446\u0456\u0439\u043d\u043e\u0433\u043e \u043f\u043e\u0441\u0432\u0456\u0434\u0447\u0435\u043d\u043d\u044f",
        "\u0414\u0430\u0442\u0430 \u043f\u043e\u0447\u0430\u0442\u043a\u0443 \u0434\u0456\u0457",
        "\u0414\u0430\u0442\u0430 \u0437\u0430\u043a\u0456\u043d\u0447\u0435\u043d\u043d\u044f",
        "URL \u0456\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0456\u0457",
      ]
        .map((cell) => `"${cell}"`)
        .join(";"),
      [
        "abc",
        "\u041f\u0410\u041d\u0410\u0414\u041e\u041b",
        "Paracetamol",
        "\u0442\u0430\u0431\u043b\u0435\u0442\u043a\u0438",
        "1 \u0442\u0430\u0431\u043b\u0435\u0442\u043a\u0430 \u043c\u0456\u0441\u0442\u0438\u0442\u044c 500 \u043c\u0433",
        "N02BE01",
        "Applicant UA",
        "Manufacturer UA",
        "\u0423\u043a\u0440\u0430\u0457\u043d\u0430",
        "UA/123/01/01",
        "01.01.2026",
        "\u043d\u0435\u043e\u0431\u043c\u0435\u0436\u0435\u043d\u0438\u0439",
        "http://www.drlz.com.ua/ibp/lz_www.nsf/id/example",
      ]
        .map((cell) => `"${cell}"`)
        .join(";"),
    ].join("\n");

    const result = parseRegistryText(csv, { fileName: "reestr.csv" });
    const plan = buildReviewableImportPlan(result.candidates);
    const summary = buildRegistryProductionSummary(result, {
      reviewDistribution: plan.preview.reviewDistribution,
    });

    expect(result.delimiter).toBe(";");
    expect(result.rows[0]).toMatchObject({
      registryId: "abc",
      tradeName: "\u041f\u0410\u041d\u0410\u0414\u041e\u041b",
      inn: "Paracetamol",
      atcCode: "N02BE01",
      registrationNumber: "UA/123/01/01",
    });
    expect(summary.products.total).toBe(1);
    expect(summary.ingredients.uniqueInn).toBe(1);
    expect(summary.manufacturers.uniqueManufacturers).toBe(1);
    expect(summary.registrations.uniqueNumbers).toBe(1);
    expect(summary.mappings.brandCandidates).toBe(1);
    expect(JSON.stringify(summary)).not.toMatch(/[A-Za-z]:\\/);
    expect(JSON.stringify(summary)).not.toContain("postgresql://");
  });

  it("parses active ingredient expressions conservatively", () => {
    expect(parseIngredientExpression("Ceftriaxone")).toMatchObject({
      parsedIngredients: ["Ceftriaxone"],
      ingredientCount: 1,
      combinationProduct: false,
      parseConfidence: "high",
    });
    expect(parseIngredientExpression("Amlodipine and Valsartan")).toMatchObject(
      {
        parsedIngredients: ["Amlodipine", "Valsartan"],
        ingredientCount: 2,
        combinationProduct: true,
      },
    );
    expect(
      parseIngredientExpression("Amlodipine \u0442\u0430 Valsartan"),
    ).toMatchObject({
      ingredientCount: 2,
      combinationProduct: true,
    });
    expect(
      parseIngredientExpression("Levofloxacin hydrochloride"),
    ).toMatchObject({
      ingredientCount: 1,
      combinationProduct: false,
      saltOrDerivativeFlags: ["hydrochloride"],
    });
  });

  it("keeps registry review conflicts out of approved mapping blockers", () => {
    const registry = parseRegistryText(
      [
        "trade_name,inn,registration_number",
        "Shared Brand,Ceftriaxone,UA/1/01/01",
        "Shared Brand,Amlodipine,UA/2/01/01",
        "Combo,Amlodipine and Valsartan,UA/3/01/01",
        "Salt,Levofloxacin hydrochloride,UA/4/01/01",
      ].join("\n"),
    );
    const plan = buildRegistryMappingPlan(registry);
    const summary = buildRegistryProductionSummary(registry, plan.stats);
    const json = JSON.stringify({ plan, summary });

    expect(registry.rawRows).toBe(4);
    expect(registry.parsedRows).toBe(4);
    expect(
      registry.rows.find((item) => item.tradeName === "Combo")?.warnings,
    ).toContain("combination_or_multi_ingredient");
    expect(
      registry.candidates.some((candidate) =>
        candidate.canonicalInn.includes("and"),
      ),
    ).toBe(false);
    expect(plan.conflictGroups.length).toBeGreaterThanOrEqual(1);
    expect(
      plan.conflictGroups.some(
        (group) => group.normalizedName === "sharedbrand",
      ),
    ).toBe(true);
    expect(plan.reviewDistribution.quarantined).toBeGreaterThan(0);
    expect(plan.reviewDistribution.needs_review).toBeGreaterThan(0);
    expect(plan.approvedCandidateConflicts).toBe(0);
    expect(plan.blocked).not.toContain("hard_conflicts");
    expect(summary.readiness.productSnapshotReady).toBe(true);
    expect(summary.readiness.approvedMappingsReady).toBe(true);
    expect(json).not.toMatch(/[A-Za-z]:\\/);
    expect(json).not.toContain("postgresql://");
  });

  it("decodes Windows-1251 registry snapshots without adding a dependency", () => {
    const decoded = decodeRegistryBuffer(Buffer.from([0xd2, 0xe5, 0xf1, 0xf2]));
    expect(decoded.encoding).toBe("windows-1251");
    expect(decoded.text).toBe("\u0422\u0435\u0441\u0442");
  });

  it("returns sanitized XLSX guidance instead of trying to parse spreadsheets", () => {
    const result = parseRegistryText("not,xlsx", { fileName: "registry.xlsx" });
    expect(result.parseErrors.join(" ")).toContain("CSV/TSV");
    expect(JSON.stringify(result)).not.toMatch(/[A-Za-z]:\\/);
  });

  it("resolves repo data files when the process cwd is the API package", () => {
    const originalCwd = process.cwd();
    const packageCwd = /[\\/]artifacts[\\/]api-server$/.test(originalCwd)
      ? originalCwd
      : resolve(originalCwd, "artifacts/api-server");

    process.chdir(packageCwd);
    try {
      const result = parseRegistryFile(
        "data/imports/ukraine-registry-sample.csv",
        {
          includeTradeNames: false,
        },
      );

      expect(result.rawRows).toBeGreaterThan(0);
      expect(result.generatedCandidates).toBeGreaterThan(0);
      expect(JSON.stringify(result)).not.toMatch(/[A-Za-z]:\\/);
    } finally {
      process.chdir(originalCwd);
    }
  });
});

describe("candidate generation", () => {
  it("creates transliteration and typo candidates without auto-approving typos", () => {
    const result = generateImportCandidates([row()], { typoLimitPerName: 2 });
    const plan = buildReviewableImportPlan(result.rows);

    expect(result.generatedRows).toBeGreaterThan(0);
    expect(
      result.rows.some((candidate) => candidate.nameType === "transliteration"),
    ).toBe(true);
    expect(result.rows.some((candidate) => candidate.nameType === "typo")).toBe(
      true,
    );
    expect(plan.preview.reviewDistribution.needs_review).toBeGreaterThan(0);
  });

  it("turns search misses into needs_review rows", () => {
    const rows = searchMissesToImportRows([
      {
        query: "парацетомол",
        canonicalInn: "Парацетамол",
        atcCode: "N02BE01",
        reason: "beta miss",
      },
    ]);
    const plan = buildReviewableImportPlan(rows);

    expect(rows).toHaveLength(1);
    expect(rows[0].sourceId).toBe("project_search_miss_feedback");
    expect(rows[0].nameType).toBe("typo");
    expect(plan.reviewable[0].reviewStatus).toBe("needs_review");
  });
});

describe("candidate commit flow", () => {
  it("writes through an injected store without requiring a real database", async () => {
    const plan = buildReviewableImportPlan([row({ confidence: "medium" })]);
    const written: { rows: number; batchId: string; chunkSize?: number }[] = [];
    const store: KnowledgeImportCommitStore = {
      async writeBatch(rows, batchId, options) {
        written.push({
          rows: rows.length,
          batchId,
          chunkSize: options?.chunkSize,
        });
        return mappingStats();
      },
    };
    const result = await commitReviewableImportPlan(plan, {
      store,
      batchId: "test-batch",
      chunkSize: 100,
    });

    expect(result).toMatchObject({
      committedRows: 1,
      batchId: "test-batch",
      inserted: 1,
      unchanged: 0,
      importBatchStatus: "completed",
    });
    expect(written).toEqual([
      { rows: 1, batchId: "test-batch", chunkSize: 100 },
    ]);
  });

  it("fails when an approved mapping commit persists zero rows", async () => {
    const plan = buildReviewableImportPlan([row()]);
    const store: KnowledgeImportCommitStore = {
      async writeBatch() {
        return mappingStats({
          attempted: 0,
          inserted: 0,
          updated: 0,
          unchanged: 0,
          finalMappingCount: 0,
          finalApprovedMappingCount: 0,
        });
      },
    };

    await expect(
      commitReviewableImportPlan(plan, {
        store,
        batchId: "zero-write",
        approvedOnly: true,
      }),
    ).rejects.toThrow(
      "Approved mappings commit completed with zero persisted rows.",
    );
  });

  it("rejects non-approved rows before an approved-only DB write", async () => {
    const plan = buildReviewableImportPlan([
      row({ confidence: "low", name: "Review Candidate" }),
    ]);
    let called = false;
    const store: KnowledgeImportCommitStore = {
      async writeBatch() {
        called = true;
        return mappingStats();
      },
    };

    await expect(
      commitReviewableImportPlan(plan, {
        store,
        batchId: "approved-only",
        approvedOnly: true,
      }),
    ).rejects.toThrow(/non-approved review status/);
    expect(called).toBe(false);
  });

  it("can commit registry product snapshots through an injected store", async () => {
    const registry = parseRegistryText(
      [
        "id,trade_name,inn,atc_code,registration_number",
        "abc,Panadol,Paracetamol,N02BE01,UA/123/01/01",
      ].join("\n"),
    );
    const store: KnowledgeImportCommitStore = {
      async writeBatch() {
        throw new Error("not used");
      },
      async writeRegistryProducts(rows, batchId) {
        expect(rows).toHaveLength(1);
        expect(batchId).toBe("registry-test");
        return productStats({
          plannedProducts: rows.length,
          attemptedProducts: rows.length,
          insertedProducts: rows.length,
          committedProducts: rows.length,
        });
      },
    };

    await expect(
      commitRegistryProducts(registry.rows, {
        store,
        batchId: "registry-test",
      }),
    ).resolves.toMatchObject({
      committedProducts: 1,
      committedManufacturers: 0,
      batchId: "registry-test",
      skipped: false,
    });
  });

  it("hard-fails registry product commits that persist zero planned rows", async () => {
    const registry = parseRegistryText(
      [
        "id,trade_name,inn,atc_code,registration_number",
        "abc,Panadol,Paracetamol,N02BE01,UA/123/01/01",
      ].join("\n"),
    );
    const store: KnowledgeImportCommitStore = {
      async writeBatch() {
        throw new Error("not used");
      },
      async writeRegistryProducts(rows) {
        return productStats({
          plannedProducts: rows.length,
          attemptedProducts: rows.length,
          insertedProducts: 0,
          updatedProducts: 0,
          unchangedProducts: 0,
          committedProducts: 0,
          finalProductCount: 0,
          finalRegistrationCount: 0,
        });
      },
    };

    await expect(
      commitRegistryProducts(registry.rows, {
        store,
        batchId: "registry-test",
      }),
    ).rejects.toThrow(
      "Products-only commit completed with zero persisted rows.",
    );
  });

  it("keeps combination product snapshots independent from runtime mapping commits", async () => {
    const registry = parseRegistryText(
      [
        "id,trade_name,inn,atc_code,registration_number",
        "combo-1,Combo,Amlodipine and Valsartan,C09DB01,UA/222/01/01",
      ].join("\n"),
    );
    const store: KnowledgeImportCommitStore = {
      async writeBatch() {
        throw new Error("runtime mappings must not be written");
      },
      async writeRegistryProducts(rows) {
        expect(rows).toHaveLength(1);
        expect(rows[0]?.warnings).toContain("combination_or_multi_ingredient");
        return productStats({
          plannedProducts: rows.length,
          attemptedProducts: rows.length,
          insertedProducts: rows.length,
          committedProducts: rows.length,
        });
      },
    };

    await expect(
      commitRegistryProducts(registry.rows, {
        store,
        batchId: "registry-combo-test",
      }),
    ).resolves.toMatchObject({
      committedProducts: 1,
      skipped: false,
    });
  });

  it("reports idempotent registry product reruns as unchanged rows", async () => {
    const registry = parseRegistryText(
      [
        "id,trade_name,inn,atc_code,registration_number",
        "abc,Panadol,Paracetamol,N02BE01,UA/123/01/01",
      ].join("\n"),
    );
    const results = [
      productStats({
        insertedProducts: 1,
        unchangedProducts: 0,
        committedProducts: 1,
      }),
      productStats({
        insertedProducts: 0,
        unchangedProducts: 1,
        committedProducts: 0,
      }),
    ];
    const store: KnowledgeImportCommitStore = {
      async writeBatch() {
        throw new Error("not used");
      },
      async writeRegistryProducts() {
        return results.shift() ?? productStats();
      },
    };

    await expect(
      commitRegistryProducts(registry.rows, {
        store,
        batchId: "registry-first",
      }),
    ).resolves.toMatchObject({ insertedProducts: 1, unchangedProducts: 0 });
    await expect(
      commitRegistryProducts(registry.rows, {
        store,
        batchId: "registry-second",
      }),
    ).resolves.toMatchObject({ insertedProducts: 0, unchangedProducts: 1 });
  });

  it("does not allow copyrighted source rows to be committed", async () => {
    const plan = buildReviewableImportPlan([
      row({ sourceId: "drugbank-copy", notes: "drugbank" }),
    ]);
    const store: KnowledgeImportCommitStore = {
      async writeBatch() {
        throw new Error("must not be called");
      },
    };

    await expect(
      commitReviewableImportPlan(plan, { store, force: true }),
    ).rejects.toThrow(/copyrighted/);
  });
});

describe("bulk ingest report", () => {
  it("summarizes candidate files without paths or secrets", () => {
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://user:secret@example.test/db";
    try {
      const report = buildBulkIngestReport({
        now: new Date("2026-07-09T00:00:00.000Z"),
      });
      const json = JSON.stringify(report);

      expect(report.candidates.files).toBeGreaterThanOrEqual(4);
      expect(report.candidates.rows).toBeGreaterThan(0);
      expect(report.candidates.rejected).toBe(0);
      expect(report.runtimeSafety.approvedOnlyRuntime).toBe(true);
      expect(json).not.toContain("postgresql://");
      expect(json).not.toContain("secret@example");
      expect(json).not.toMatch(/[A-Za-z]:\\/);
      expect(json).not.toContain("/opt/render/project");
    } finally {
      if (originalUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalUrl;
    }
  });
});
