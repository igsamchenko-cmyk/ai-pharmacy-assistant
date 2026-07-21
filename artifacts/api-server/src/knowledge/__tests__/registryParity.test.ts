import { describe, expect, it } from "vitest";
import {
  buildOfficialRegistryAudit,
  compareRegistryParity,
  parseRegistryText,
  registryComparableFromOfficial,
  registryFullRowHash,
} from "../ingestion";

function registry() {
  return parseRegistryText(
    [
      "id,trade_name,inn,active_ingredient,form,strength,manufacturer_1_name,manufacturer_1_country,registration_number,registration_end,early_termination",
      "active-1,Alpha,Ingredient A,Ingredient A,tablet,10 mg,Maker A,Ukraine,UA/1,31.12.2027,Ні",
      "expired-1,Beta,Ingredient B,Ingredient B,capsule,20 mg,Maker B,Poland,UA/2,01.01.2020,Ні",
      "other-1,Gamma,Ingredient C,Ingredient C,solution,5 mg/ml,Maker C,Germany,UA/2,,Ні",
    ].join("\n"),
    {
      snapshot: {
        sourceUrl:
          "http://www.drlz.com.ua/ibp/zvity.nsf/all/zvit/$file/reestr.csv",
        downloadedAt: "2026-07-16T00:00:00.000Z",
        contentLength: 123,
        sha256: "a".repeat(64),
        encoding: "utf-8",
        format: "csv",
        fileName: "reestr.csv",
      },
    },
  );
}

describe("official registry parity", () => {
  it("audits every official row instead of a curated sample", () => {
    const parsed = registry();
    const report = buildOfficialRegistryAudit(
      parsed,
      new Date("2026-07-16T00:00:00.000Z"),
    );

    expect(report.rows).toMatchObject({
      raw: 3,
      parsed: 3,
      valid: 3,
      invalid: 0,
      withoutTradeName: 0,
    });
    expect(report.names).toEqual({
      uniqueRawTradeNames: 3,
      uniqueNormalizedTradeNames: 3,
    });
    expect(report.registrations).toMatchObject({
      uniqueNumbers: 2,
      duplicateRows: 1,
      duplicateGroups: 1,
    });
    expect(report.productIds).toMatchObject({
      unique: 3,
      duplicateRows: 0,
    });
    expect(report.statuses).toMatchObject({ active: 1, expired: 1, other: 1 });
    expect(report.failures).toEqual([]);
  });

  it("hashes every field that can change registry parity", () => {
    const row = registry().rows[0]!;
    const baseline = registryFullRowHash(row);
    const mutations = [
      { ...row, tradeName: "Alpha changed" },
      { ...row, activeIngredient: "Ingredient A salt" },
      { ...row, form: "capsule" },
      { ...row, strength: "20 mg" },
      { ...row, applicantName: "Another applicant" },
      {
        ...row,
        manufacturers: [{ name: "Another maker", country: "Ukraine" }],
      },
      { ...row, registrationNumber: "UA/1/changed" },
      { ...row, registrationEndDate: "необмежений" },
      { ...row, instructionUrl: "https://example.test/instruction" },
    ];

    expect(
      mutations.every((mutation) => registryFullRowHash(mutation) !== baseline),
    ).toBe(true);
  });

  it("reports missing, extra, changed and hidden rows without using mapping status", () => {
    const parsed = registry();
    const [active, expired] = parsed.rows;
    const changed = registryComparableFromOfficial(active!);
    changed.form = "wrong form";
    const hidden = registryComparableFromOfficial(expired!);
    hidden.currentStatus = "stale";
    const extra = {
      ...registryComparableFromOfficial(active!),
      registryId: "extra-1",
      tradeName: "Old product",
      normalizedTradeName: "old product",
    };

    const comparison = compareRegistryParity(
      parsed,
      [changed, hidden, extra],
      new Date("2026-07-16T00:00:00.000Z"),
    );

    expect(comparison).toMatchObject({
      databaseCompared: true,
      farmAssistRows: 3,
      missingOfficialRows: 1,
      missingOfficialActiveRows: 0,
      extraFarmAssistRows: 1,
      unintendedStaleRowsShownCurrent: 1,
      officialRowsIncorrectlyMarkedStale: 1,
      silentlyExcludedUnmappedRows: 0,
      exactParity: false,
    });
    expect(comparison.changed).toMatchObject({ forms: 1, any: 1 });
  });

  it("matches the importer manufacturer dedupe key", () => {
    const parsed = parseRegistryText(
      [
        "id,trade_name,inn,active_ingredient,form,strength,manufacturer_1_name,manufacturer_1_country,manufacturer_2_name,manufacturer_2_country,registration_number,registration_end,early_termination",
        "duplicate-makers,Duplicate makers,Ingredient D,Ingredient D,tablet,10 mg,Maker A,India,Maker A,India,UA/4,31.12.2027,Ні",
        "normalized-makers,Normalized makers,Ingredient E,Ingredient E,tablet,20 mg,Maker (bulk))),India,Maker (bulk)),India,UA/5,31.12.2027,Ні",
      ].join("\n"),
    );
    const databaseRows = parsed.rows.map((row) => ({
      ...registryComparableFromOfficial(row),
      manufacturers: [row.manufacturers.at(-1)!],
    }));

    const comparison = compareRegistryParity(parsed, databaseRows);

    expect(comparison.changed).toMatchObject({ manufacturers: 0, any: 0 });
    expect(comparison.exactParity).toBe(true);
  });

  it("requires the full official product set in the import plan even without INN mappings", () => {
    const parsed = parseRegistryText(
      [
        "id,trade_name,inn,registration_number",
        "mapped,Known,Paracetamol,UA/1",
        "registry-only,Registry Only,,UA/2",
      ].join("\n"),
    );

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.candidates.length).toBeGreaterThan(0);
    expect(parsed.rows.map((row) => row.registryId)).toContain("registry-only");
  });
});
