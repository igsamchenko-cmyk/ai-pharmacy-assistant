import { describe, expect, it } from "vitest";
import type { RegistryParseResult, RegistryRawRow } from "../ingestion";
import { buildOfficialInstructionCoverageReport } from "../instructions/coverage";
import type { InstructionManifest } from "../instructions/model";

const OFFICIAL_URL =
  "https://www.drlz.com.ua/ibp/lz_www.nsf/id/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB/$file/UA10000101_ABCD.mht";
const OFFICIAL_PDF_URL =
  "https://www.drlz.com.ua/ibp/lz_www.nsf/id/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC/$file/UA50000101_ABCD.pdf";

function row(
  registryId: string,
  registrationNumber: string,
  instructionUrl: string,
): RegistryRawRow {
  return {
    registryId,
    tradeName: `Product ${registryId.slice(0, 2)}`,
    inn: "Ingredient",
    activeIngredient: "Ingredient 10 mg",
    ingredientParse: {
      rawIngredientExpression: "Ingredient",
      parsedIngredients: ["Ingredient"],
      ingredientCount: 1,
      combinationProduct: false,
      parseConfidence: "high",
      parseWarnings: [],
      baseIngredientCandidates: ["Ingredient"],
      saltOrDerivativeFlags: [],
    },
    atcCode: "A01AA01",
    form: "tablets",
    strength: "10 mg",
    applicantName: "Applicant",
    applicantCountry: "Ukraine",
    manufacturer: "Manufacturer",
    country: "Ukraine",
    manufacturers: [{ name: "Manufacturer", country: "Ukraine" }],
    registrationNumber,
    registrationStartDate: "2025-01-01",
    registrationEndDate: "unlimited",
    status: "",
    earlyTermination: "",
    instructionUrl,
    sourceId: "ukraine_state_drug_registry",
    rawIndex: 1,
    warnings: [],
  };
}

function registry(rows: RegistryRawRow[]): RegistryParseResult {
  return {
    version: "1.6-registry-production",
    sourceId: "ukraine_state_drug_registry",
    fileName: "reestr.csv",
    delimiter: ";",
    snapshot: {
      sourceUrl:
        "http://www.drlz.com.ua/ibp/zvity.nsf/all/zvit/$file/reestr.csv",
      downloadedAt: "2026-07-23T00:00:00.000Z",
      contentLength: 100,
      sha256:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      encoding: "windows-1251",
      format: "csv",
      fileName: "reestr.csv",
    },
    rawRows: rows.length,
    parsedRows: rows.length,
    generatedCandidates: 0,
    parseErrors: [],
    warnings: [],
    rows,
    candidates: [],
  };
}

function manifest(): InstructionManifest {
  return {
    version: "1.0",
    generatedAt: "2026-07-23T00:00:00.000Z",
    dataset: {
      title: "State Register",
      publisher: "Ministry of Health",
      url: "https://data.gov.ua/dataset/fded13b8-4e2c-4c48-bf14-65d0e3106463",
      license: "Creative Commons Attribution 4.0",
      registryUrl:
        "http://www.drlz.com.ua/ibp/zvity.nsf/all/zvit/$file/reestr.csv",
      registrySha256:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      registryCheckedAt: "2026-07-23T00:00:00.000Z",
    },
    products: [
      {
        registryProductId: "A".repeat(32),
        registrationNumber: "UA/1000/01/01",
        tradeName: "Product A",
        status: "available",
        documentHash:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        documentDate: null,
        snapshotFile: "snapshots/ua10000101.json",
        availableSections: ["indications", "contraindications"],
      },
    ],
  };
}

describe("official instruction coverage report", () => {
  it("accounts for every exact registry product without registration fallback", () => {
    const report = buildOfficialInstructionCoverageReport(
      registry([
        row("A".repeat(32), "UA/1000/01/01", OFFICIAL_URL),
        row("B".repeat(32), "UA/1000/01/01", OFFICIAL_URL),
        row("E".repeat(32), "UA/5000/01/01", OFFICIAL_PDF_URL),
        row("C".repeat(32), "UA/3000/01/01", ""),
        row(
          "D".repeat(32),
          "UA/4000/01/01",
          "https://example.com/not-official.mht",
        ),
      ]),
      manifest(),
    );

    expect(report.counts).toMatchObject({
      officialProducts: 5,
      structuredSnapshots: 1,
      officialSourceDocuments: 3,
      pendingStructuring: 1,
      officialDocumentOnly: 1,
      notPublishedByDrlz: 1,
      rejectedSourceUrls: 1,
      accountedProducts: 5,
    });
    expect(report.coverage).toMatchObject({
      exactProductMatching: true,
      registrationFallbackUsed: false,
      allProductsAccountedFor: true,
    });
    expect(report.gaps).toEqual([
      expect.objectContaining({
        registryProductId: "B".repeat(32),
        reason: "official_source_pending_structuring",
      }),
      expect.objectContaining({
        registryProductId: "E".repeat(32),
        reason: "official_document_only",
      }),
      expect.objectContaining({
        registryProductId: "C".repeat(32),
        reason: "official_source_not_published",
      }),
      expect.objectContaining({
        registryProductId: "D".repeat(32),
        reason: "official_source_url_rejected",
      }),
    ]);
  });
});
