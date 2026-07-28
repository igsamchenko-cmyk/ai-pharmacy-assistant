import { describe, expect, it } from "vitest";
import { checkDispensingCategory } from "./catalog";
import {
  classifyDispensingConditions,
  parseDispensingCategoryRegistry,
} from "./importer";
import type {
  DispensingCategoryRecord,
  DispensingCategorySnapshot,
} from "./model";
import { dispensingCategoryRecordsHash } from "./model";

const OTC_ID = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const RX_ID = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

function snapshot(
  records: DispensingCategoryRecord[],
  generatedAt = "2026-07-28T06:00:00.000Z",
): DispensingCategorySnapshot {
  const categoryCounts = {
    otc: records.filter((record) => record.category === "otc").length,
    prescription: records.filter((record) => record.category === "prescription")
      .length,
    conditional: records.filter((record) => record.category === "conditional")
      .length,
    unknown: records.filter((record) => record.category === "unknown").length,
  };
  return {
    schemaVersion: "ua-drlz-dispensing-categories-v1",
    generatedAt,
    source: {
      title: "Державний реєстр лікарських засобів України",
      publisher: "МОЗ України",
      datasetUrl:
        "https://data.gov.ua/dataset/fded13b8-4e2c-4c48-bf14-65d0e3106463",
      registryUrl:
        "http://www.drlz.com.ua/ibp/zvity.nsf/all/zvit/$file/reestr.csv",
      checkedAt: generatedAt,
      encoding: "windows-1251",
      contentLength: 100,
      sha256: "a".repeat(64),
      recordsSha256: dispensingCategoryRecordsHash(records),
      officialRowCount: records.length,
      recordCount: records.length,
      skippedInvalidIdentityCount: 0,
      missingConditionsCount: categoryCounts.unknown,
      categoryCounts,
      complete: true,
    },
    legalBasis: {
      title: "Перелік безрецептурних лікарських засобів",
      actNumber: "330",
      actDate: "2026-03-16",
      revisionDate: "2026-04-24",
      effectiveDate: "2026-04-24",
      url: "https://zakon.rada.gov.ua/laws/show/z0423-26#Text",
      listDocumentUrl:
        "https://zakon.rada.gov.ua/laws/file/text/136/f554130n25.docx",
      otcListPositionCount: 3418,
    },
    records,
    warnings: [],
  };
}

describe("official dispensing-category ingestion", () => {
  it("keeps package-dependent conditions out of a binary Rx/OTC verdict", () => {
    expect(
      classifyDispensingConditions("за рецептом: № 100 / без рецепта: № 10"),
    ).toEqual({
      category: "conditional",
      packageDependent: true,
      restrictedSetting: false,
    });
    expect(classifyDispensingConditions("без рецепта").category).toBe("otc");
    expect(
      classifyDispensingConditions("за рецептом (тільки в умовах стаціонару)"),
    ).toMatchObject({ category: "prescription", restrictedSetting: true });
    expect(classifyDispensingConditions("").category).toBe("unknown");
  });

  it("parses only records with exact DRLZ product and registration identities", () => {
    const text = [
      '"ID";"Умови відпуску";"Номер Реєстраційного посвідчення"',
      `"${OTC_ID}";"без рецепта";"UA/100/01/01"`,
      '"bad";"за рецептом";"UA/200/01/01"',
    ].join("\n");
    const result = parseDispensingCategoryRegistry(text, {
      sourceSha256: "b".repeat(64),
      contentLength: Buffer.byteLength(text),
      encoding: "utf-8",
      expectedMinRows: 1,
      now: new Date("2026-07-28T06:00:00.000Z"),
    });

    expect(result.source.officialRowCount).toBe(2);
    expect(result.source.recordCount).toBe(1);
    expect(result.source.skippedInvalidIdentityCount).toBe(1);
    expect(result.records[0]).toMatchObject({
      registryProductId: OTC_ID,
      registrationNumber: "UA/100/01/01",
      category: "otc",
    });
  });
});

describe("exact dispensing-category resolver", () => {
  const records: DispensingCategoryRecord[] = [
    {
      registryProductId: OTC_ID,
      registrationNumber: "UA/100/01/01",
      category: "otc",
      conditionsRaw: "без рецепта",
      packageDependent: false,
      restrictedSetting: false,
      sourceRow: 2,
    },
    {
      registryProductId: RX_ID,
      registrationNumber: "UA/200/01/01",
      category: "prescription",
      conditionsRaw: "за рецептом",
      packageDependent: false,
      restrictedSetting: false,
      sourceRow: 3,
    },
  ];

  it("returns an OTC verdict only for a fresh exact evidence record", () => {
    const result = checkDispensingCategory(OTC_ID, "UA/100/01/01", {
      snapshot: snapshot(records),
      now: new Date("2026-07-28T12:00:00.000Z"),
    });

    expect(result.status).toBe("otc");
    expect(result.action).toBe("otc_with_professional_checks");
    expect(result.matchStatus).toBe("product_and_registration");
    expect(result.conditions).toEqual(["без рецепта"]);
  });

  it("requires a prescription for the exact prescription record", () => {
    const result = checkDispensingCategory(RX_ID, "UA/200/01/01", {
      snapshot: snapshot(records),
      now: new Date("2026-07-28T12:00:00.000Z"),
    });
    expect(result.status).toBe("prescription");
    expect(result.action).toBe("prescription_required");
  });

  it("fails closed when the snapshot is stale", () => {
    const result = checkDispensingCategory(OTC_ID, "UA/100/01/01", {
      snapshot: snapshot(records, "2026-07-01T00:00:00.000Z"),
      now: new Date("2026-07-28T12:00:00.000Z"),
    });
    expect(result.status).toBe("otc");
    expect(result.source.freshness).toBe("stale");
    expect(result.action).toBe("manual_review");
  });

  it("reports conflicts across duplicate rows for one registration", () => {
    const conflicting = [
      ...records,
      {
        ...records[0]!,
        registryProductId: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
        category: "prescription" as const,
        conditionsRaw: "за рецептом",
        sourceRow: 4,
      },
    ];
    const result = checkDispensingCategory(
      "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
      "UA/100/01/01",
      {
        snapshot: snapshot(conflicting),
        now: new Date("2026-07-28T12:00:00.000Z"),
      },
    );
    expect(result.matchStatus).toBe("registration");
    expect(result.status).toBe("conflict");
    expect(result.action).toBe("manual_review");
  });
});
