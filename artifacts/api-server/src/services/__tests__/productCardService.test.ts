import { describe, expect, it } from "vitest";
import {
  GetProductCardResponse,
  type RegistryProductResult,
} from "@workspace/api-zod";
import type { DrugInstructionSnapshot } from "../../knowledge/instructions/model";
import type { ProductSeriesRestrictionSummary } from "../../knowledge/seriesRestrictions/summary";
import type { ProfessionalProductProfileLoadResult } from "../professionalProductProfileService";
import {
  loadProductCard,
  type ProductCardDependencies,
} from "../productCardService";

const PRODUCT_ID = "A".repeat(32);
const REGISTRATION = "UA/10001/01/01";
const CHECKED_AT = "2026-08-01T08:00:00.000Z";

function product(
  overrides: Partial<RegistryProductResult> = {},
): RegistryProductResult {
  return {
    resultType: "registry_product",
    id: PRODUCT_ID,
    tradeName: "ТЕСТ-ФАРМА",
    inn: "Тестова речовина",
    activeIngredient: "Тестова речовина 500 мг",
    atcCode: "J01AA01",
    dosageForm: "порошок для розчину для ін'єкцій",
    strength: "500 мг",
    manufacturers: [{ name: "Виробник", country: "Україна" }],
    registration: {
      number: REGISTRATION,
      startDate: "2025-01-01",
      endDate: "2030-01-01",
      status: "active",
    },
    source: {
      key: "state_registry",
      label: "Державний реєстр лікарських засобів",
    },
    mappingStatus: "approved",
    approvedMapping: {
      ingredientId: "ingredient-test",
      inn: "Тестова речовина",
      latin: "Substantia test",
      english: "Test substance",
      atcCode: "J01AA01",
    },
    sourceRecordCount: 1,
    nationalListStatus: "exact",
    nationalListRelease: "ua-national-list-2026",
    nationalListMatchReason: "Точний збіг МНН, форми та дозування.",
    nationalListSection: "Протимікробні засоби",
    nationalListSource: {
      title: "Національний перелік основних лікарських засобів",
      actNumber: "333",
      actDate: "2009-03-25",
      revisionDate: "2026-07-01",
      effectiveDate: "2026-07-01",
      url: "https://zakon.rada.gov.ua/laws/show/333-2009-%D0%BF",
    },
    nationalListCheckedAt: CHECKED_AT,
    nationalListMatchDetails: {
      officialName: "Тестова речовина",
      ingredients: ["Тестова речовина"],
      dosageForms: ["порошок для розчину для ін'єкцій"],
      routes: ["внутрішньовенно"],
      strengths: ["500 мг"],
      ingredientMatch: "match",
      formMatch: "match",
      routeMatch: "match",
      strengthMatch: "match",
    },
    instructionAvailable: true,
    instructionSourceStatus: "structured",
    officialInstructionDocumentUrl: `https://www.drlz.com.ua/ibp/lz_www.nsf/id/${PRODUCT_ID}`,
    ...overrides,
  };
}

type ReadyProfile = Extract<
  ProfessionalProductProfileLoadResult,
  { status: "ready" }
>["profile"];

function profile(
  item: RegistryProductResult,
  dispensingStatus:
    | "otc"
    | "prescription"
    | "conditional"
    | "unknown"
    | "conflict"
    | "not_found" = "prescription",
): ReadyProfile {
  const source = {
    title: "ДРЛЗ",
    url: "https://www.drlz.com.ua/",
    checkedAt: new Date(CHECKED_AT),
    generatedAt: new Date(CHECKED_AT),
    complete: true,
    officialRowCount: 16_474,
    recordCount: 16_474,
    sha256: "b".repeat(64),
    freshness: "current" as const,
    legalBasisTitle: "Наказ МОЗ України",
    legalBasisUrl: "https://zakon.rada.gov.ua/",
    legalBasisRevisionDate: "2026-07-01",
  };
  const keys = [
    "registry",
    "national_list",
    "dispensing_category",
    "instruction",
    "reimbursement",
    "price",
    "interactions",
    "series_restrictions",
  ] as const;
  return {
    version: "1.0",
    product: item,
    dispensingCategory: {
      version: "1.0",
      productId: PRODUCT_ID,
      registrationNumber: REGISTRATION,
      status: dispensingStatus,
      action:
        dispensingStatus === "prescription"
          ? "prescription_required"
          : dispensingStatus === "otc"
            ? "otc_with_professional_checks"
            : "manual_review",
      matchStatus: "product_and_registration",
      summary: "Точна категорія відпуску з ДРЛЗ.",
      conditions: [],
      packageDependent: false,
      restrictedSetting: false,
      source,
    },
    reimbursement: null,
    price: null,
    coverage: {
      connectedSources: 8,
      totalSources: 8,
      complete: false,
      sources: keys.map((key) => ({
        key,
        label: key,
        status:
          key === "interactions" || key === "series_restrictions"
            ? ("requires_input" as const)
            : ("ready" as const),
        detail: "Перевірене джерело.",
        sourceUrl: null,
        checkedAt: null,
      })),
    },
    warnings: [],
  };
}

function instruction(): DrugInstructionSnapshot {
  return {
    version: "1.0",
    registryProductId: PRODUCT_ID,
    registrationNumber: REGISTRATION,
    tradeName: "ТЕСТ-ФАРМА",
    inn: "Тестова речовина",
    activeIngredient: "Тестова речовина 500 мг",
    dosageForm: "порошок для розчину для ін'єкцій",
    strength: "500 мг",
    manufacturer: "Виробник",
    manufacturerCountry: "Україна",
    registrationStartDate: "2025-01-01",
    registrationEndDate: "2030-01-01",
    status: "available",
    sections: {
      indications: "Показання.",
      contraindications: "Протипоказання.",
      adverseReactions: null,
      interactions: "Не змішувати з кальцієм.",
      specialWarnings: null,
      pregnancyAndLactation: null,
      administration: "Розчинити у 10 мл води для ін'єкцій.",
      overdose: null,
      storage: "Зберігати при температурі до 25 °C.",
    },
    source: {
      url: `https://www.drlz.com.ua/ibp/lz_www.nsf/id/${PRODUCT_ID}`,
      documentId: "B".repeat(32),
      documentDate: "2026-07-01T00:00:00.000Z",
      checkedAt: CHECKED_AT,
      documentHash: "c".repeat(64),
      contentLength: 10_000,
      parserVersion: "ua-drlz-mht-v1",
      datasetTitle: "ДРЛЗ",
      datasetUrl: "https://www.drlz.com.ua/",
      license: "CC BY 4.0",
    },
    provenance: {
      sourceAllowed: true,
      registrationMatched: true,
      contentLocationMatched: true,
      availableSectionCount: 5,
      coveragePct: 56,
    },
    warnings: [],
  };
}

function seriesSummary(): ProductSeriesRestrictionSummary {
  return {
    version: "1.0",
    registrationNumber: REGISTRATION,
    hasAnyRestriction: true,
    requiresSeriesCheck: true,
    eventCount: 1,
    restrictedSeries: ["AB-1"],
    allSeriesAffected: false,
    unspecifiedSeriesAffected: false,
    events: [
      {
        documentDate: "2026-07-30",
        documentNumber: "123-26",
        eventType: "temporary_ban",
        registrationNumber: REGISTRATION,
        medicineName: "ТЕСТ-ФАРМА",
        dosageForm: "порошок",
        seriesRaw: "AB-1",
        seriesValues: ["AB-1"],
        allSeries: false,
        seriesUnspecified: false,
        manufacturer: "Виробник",
        country: "Україна",
        additionalInfo: "",
        sourceOrder: 0,
      },
    ],
    source: {
      title: "Реєстр документів щодо якості лікарських засобів",
      url: "https://pub-mex.dls.gov.ua/QLA/DocList.aspx",
      generatedAt: CHECKED_AT,
      latestDocumentDate: "2026-07-30",
      coverageStartDate: "2000-01-01",
      complete: true,
      recordCount: 20_000,
      sha256: "d".repeat(64),
      freshness: "current",
    },
  };
}

function dependencies(
  overrides: Partial<ProductCardDependencies> = {},
): ProductCardDependencies {
  const item = product();
  return {
    resolveProductById: async () => ({ status: "found", product: item }),
    loadProfessionalProfile: async () => ({
      status: "ready",
      profile: profile(item),
    }),
    loadInstruction: async () => instruction(),
    summarizeSeries: () => seriesSummary(),
    ...overrides,
  };
}

describe("product card service", () => {
  it("aggregates verified evidence with per-source freshness in one response", async () => {
    const result = await loadProductCard(PRODUCT_ID, dependencies());

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(GetProductCardResponse.safeParse(result.card).success).toBe(true);
    expect(result.card.dispensing).toMatchObject({
      status: "prescription",
      confidence: "verified",
    });
    expect(result.card.instruction).toMatchObject({
      available: true,
      sourceStatus: "structured",
      provenance: { coveragePct: 56 },
    });
    expect(result.card.seriesStatus).toMatchObject({
      hasAnyRestriction: true,
      requiresSeriesCheck: true,
      restrictedSeries: ["AB-1"],
    });
    expect(result.card.warnings).toContain("series_check_required");
    expect(result.card.freshness).toHaveLength(8);
    expect(
      result.card.coverage.sources.find(
        (source) => source.key === "series_restrictions",
      )?.status,
    ).toBe("requires_input");
  });

  it("keeps unknown dispensing unknown and isolates optional source failures", async () => {
    const item = product();
    const result = await loadProductCard(
      PRODUCT_ID,
      dependencies({
        loadProfessionalProfile: async () => ({
          status: "ready",
          profile: profile(item, "unknown"),
        }),
        loadInstruction: async () => {
          throw new Error("instruction unavailable");
        },
        summarizeSeries: () => {
          throw new Error("series snapshot unavailable");
        },
      }),
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.card.dispensing).toMatchObject({
      status: "unknown",
      confidence: "requires_review",
    });
    expect(result.card.dispensing.status).not.toBe("otc");
    expect(result.card.instruction).toMatchObject({
      available: false,
      sourceStatus: "temporarily_unavailable",
      sections: null,
    });
    expect(result.card.seriesStatus).toBeNull();
    expect(result.card.warnings).toEqual(
      expect.arrayContaining([
        "instruction_source_unavailable",
        "series_restrictions_unavailable",
      ]),
    );
  });

  it("fails closed when a source returns evidence for another product", async () => {
    const wrongInstruction = instruction();
    wrongInstruction.registryProductId = "B".repeat(32);
    const result = await loadProductCard(
      PRODUCT_ID,
      dependencies({ loadInstruction: async () => wrongInstruction }),
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.card.instruction.available).toBe(false);
    expect(result.card.warnings).toContain("instruction_source_unavailable");
  });
});
