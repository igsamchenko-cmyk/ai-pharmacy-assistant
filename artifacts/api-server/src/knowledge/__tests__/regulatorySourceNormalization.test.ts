import { describe, expect, it } from "vitest";
import {
  parseNationalListHtml,
  type NationalListSnapshot,
} from "../nationalList";
import {
  priceCatalogRecordsHash,
  type PriceCatalogRecord,
} from "../priceCatalog/model";
import {
  mergeSeriesRestrictionSnapshots,
} from "../seriesRestrictions/importer";
import type { SeriesRestrictionSnapshot } from "../seriesRestrictions/model";

const priceRecord: PriceCatalogRecord = {
  catalogId: "UA-000000001-000000002-000000003",
  registrationNumber: "UA/1/01/01",
  inn: "Example A + Example B",
  tradeName: "EXAMPLE",
  dosageForm: "tablet",
  strength: "10 mg + 5 mg",
  packageDescription: "30 tablets",
  manufacturer: "Manufacturer",
  registrationHolder: "Holder",
  atcCode: "A00AA00",
  registrationExpiresAt: "unlimited",
  declaredPriceUah: "100.00",
  maximumRetailPriceUah: "125.00",
  category: "medicine",
  originalMedicine: false,
  exchangeRate: "1",
  declarationOrder: "Order 1",
  sourceRow: 6,
};

function restrictionSnapshot(
  records: SeriesRestrictionSnapshot["records"],
  generatedAt: string,
): SeriesRestrictionSnapshot {
  return {
    schemaVersion: "ua-dls-series-restrictions-v1",
    generatedAt,
    source: {
      title: "DLS quality documents",
      publisher: "DLS",
      url: "https://pub-mex.dls.gov.ua/QLA/DocList.aspx",
      coverageStartDate: "2000-01-01",
      latestDocumentDate: records.at(-1)?.documentDate ?? null,
      complete: true,
      recordCount: records.length,
      requestCount: 1,
      sha256: "a".repeat(64),
      documentTypeIds: ["48"],
    },
    records,
    warnings: [],
  };
}

const baseRestriction = {
  documentDate: "2026-07-29",
  documentNumber: "347-001/26",
  eventType: "temporary_ban" as const,
  registrationNumber: "UA/1/01/01",
  medicineName: "EXAMPLE",
  dosageForm: "tablets",
  seriesRaw: "A1",
  seriesValues: ["A1"],
  allSeries: false,
  seriesUnspecified: false,
  manufacturer: "Manufacturer",
  country: "Ukraine",
  additionalInfo: "",
  sourceOrder: 0,
};

describe("regulatory source normalization", () => {
  it("treats reordered combination strengths as the same price content", () => {
    const reordered = { ...priceRecord, strength: "5 mg + 10 mg" };
    expect(priceCatalogRecordsHash([reordered])).toBe(
      priceCatalogRecordsHash([priceRecord]),
    );
    expect(
      priceCatalogRecordsHash([{ ...priceRecord, strength: "20 mg + 5 mg" }]),
    ).not.toBe(priceCatalogRecordsHash([priceRecord]));
  });

  it("merges a DLS overlap without deleting reviewed history", () => {
    const previous = restrictionSnapshot(
      [
        baseRestriction,
        {
          ...baseRestriction,
          documentDate: "2020-01-01",
          documentNumber: "historic",
          seriesRaw: "OLD",
          seriesValues: ["OLD"],
          sourceOrder: 1,
        },
      ],
      "2026-07-29T12:00:00.000Z",
    );
    const refresh = restrictionSnapshot(
      [
        { ...baseRestriction, additionalInfo: "restored later" },
        {
          ...baseRestriction,
          documentDate: "2026-07-30",
          documentNumber: "350-001/26",
          seriesRaw: "B2",
          seriesValues: ["B2"],
          sourceOrder: 1,
        },
      ],
      "2026-07-30T12:00:00.000Z",
    );

    const merged = mergeSeriesRestrictionSnapshots(previous, refresh);
    expect(merged.records).toHaveLength(3);
    expect(merged.records.some((record) => record.documentNumber === "historic"))
      .toBe(true);
    expect(merged.records.find((record) => record.documentNumber === "347-001/26")?.additionalInfo)
      .toBe("restored later");
    expect(merged.source.coverageStartDate).toBe("2000-01-01");
    expect(merged.source.latestDocumentDate).toBe("2026-07-30");
  });

  it("ignores dynamic HTML outside the National List table", () => {
    const html = (nonce: string, strength = "200 мг") => `
      <html data-request="${nonce}"><body>
        <p>Із змінами, внесеними згідно з Постановою КМ № 1268 від 08.10.2025</p>
        <p>НАЦІОНАЛЬНИЙ ПЕРЕЛІК основних лікарських засобів</p>
        <table>
          <tr><td>Клас, група</td><td>Форма випуску</td></tr>
          <tr><td colspan="2">I. Тестовий розділ</td></tr>
          <tr><td colspan="2">1. Тестова група</td></tr>
          <tr><td>Ібупрофен (Ibuprofen)</td><td>таблетки: ${strength}</td></tr>
        </table>
      </body></html>`;
    const first = parseNationalListHtml(html("request-a"), {
      expectedDocumentHash: null,
    });
    const second = parseNationalListHtml(html("request-b"), {
      expectedDocumentHash: null,
    });
    const changed = parseNationalListHtml(html("request-c", "400 мг"), {
      expectedDocumentHash: null,
    });

    expect(first.source.documentHash).toBe(second.source.documentHash);
    expect(first.source.documentHash).not.toBe(changed.source.documentHash);
    expect(first.counts.valid).toBe(1);
    expect(first.status satisfies NationalListSnapshot["status"]).toBe("reviewed");
  });
});
