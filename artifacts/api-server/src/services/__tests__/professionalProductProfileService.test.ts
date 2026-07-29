import { describe, expect, it } from "vitest";
import {
  GetProfessionalProductProfileResponse,
  type RegistryProductResult,
} from "@workspace/api-zod";
import {
  loadProfessionalProductProfile,
  type ProfessionalProductProfileDependencies,
} from "../professionalProductProfileService";

const PRODUCT_ID = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const REGISTRATION = "UA/10001/01/01";

function product(
  overrides: Partial<RegistryProductResult> = {},
): RegistryProductResult {
  return {
    resultType: "registry_product",
    id: PRODUCT_ID,
    tradeName: "ЕНАП",
    inn: "Еналаприл",
    activeIngredient: "Еналаприл 10 мг",
    atcCode: "C09AA02",
    dosageForm: "таблетки, по 20 таблеток у блістері",
    strength: "10 мг",
    manufacturers: [{ name: "КРКА", country: "Словенія" }],
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
      ingredientId: "ingredient-enalapril",
      inn: "Еналаприл",
      latin: "Enalaprilum",
      english: "Enalapril",
      atcCode: "C09AA02",
    },
    sourceRecordCount: 1,
    nationalListStatus: "exact",
    nationalListRelease: "ua-national-list-2025-10-10",
    nationalListMatchReason: "Точний збіг МНН, лікарської форми та дозування.",
    nationalListSection: "Серцево-судинні засоби",
    nationalListSource: {
      title: "Національний перелік основних лікарських засобів",
      actNumber: "333",
      actDate: "2009-03-25",
      revisionDate: "2025-10-10",
      effectiveDate: "2025-10-10",
      url: "https://zakon.rada.gov.ua/laws/show/333-2009-%D0%BF",
    },
    nationalListCheckedAt: "2026-07-29T00:00:00.000Z",
    nationalListMatchDetails: {
      officialName: "Еналаприл",
      ingredients: ["Еналаприл"],
      dosageForms: ["таблетки"],
      routes: ["перорально"],
      strengths: ["10 мг"],
      ingredientMatch: "match",
      formMatch: "match",
      routeMatch: "match",
      strengthMatch: "match",
    },
    instructionAvailable: true,
    instructionSourceStatus: "structured",
    officialInstructionDocumentUrl:
      "https://www.drlz.com.ua/ibp/lz_www.nsf/id/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ...overrides,
  };
}

function dispensingCategory() {
  return {
    version: "1.0" as const,
    productId: PRODUCT_ID,
    registrationNumber: REGISTRATION,
    status: "prescription" as const,
    action: "prescription_required" as const,
    matchStatus: "product_and_registration" as const,
    summary: "ДРЛЗ позначає точну позицію як рецептурну.",
    conditions: ["За рецептом"],
    packageDependent: false,
    restrictedSetting: false,
    source: {
      title: "ДРЛЗ",
      url: "https://www.drlz.com.ua/",
      checkedAt: "2026-07-29T00:00:00.000Z",
      generatedAt: "2026-07-29T00:00:00.000Z",
      complete: true,
      officialRowCount: 16_533,
      recordCount: 16_533,
      sha256: "a".repeat(64),
      freshness: "current" as const,
      legalBasisTitle: "Наказ МОЗ України №330",
      legalBasisUrl: "https://zakon.rada.gov.ua/",
      legalBasisRevisionDate: "2026-07-01",
    },
  };
}

function dependencies(
  overrides: Partial<ProfessionalProductProfileDependencies> = {},
): ProfessionalProductProfileDependencies {
  return {
    resolveExactProduct: async () => ({
      status: "found",
      product: product(),
    }),
    checkDispensingCategory: () => dispensingCategory(),
    ...overrides,
  };
}

describe("professional product profile service", () => {
  it("aggregates one exact product while preserving incomplete source coverage", async () => {
    const result = await loadProfessionalProductProfile(
      PRODUCT_ID,
      REGISTRATION,
      dependencies(),
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(
      GetProfessionalProductProfileResponse.safeParse(result.profile).success,
    ).toBe(true);
    expect(result.profile.product).toMatchObject({
      id: PRODUCT_ID,
      registration: { number: REGISTRATION, status: "active" },
    });
    expect(result.profile.dispensingCategory).toMatchObject({
      status: "prescription",
      matchStatus: "product_and_registration",
    });
    expect(result.profile.coverage).toMatchObject({
      connectedSources: 6,
      totalSources: 8,
      complete: false,
    });
    expect(result.profile.coverage.sources.map((item) => item.key)).toEqual([
      "registry",
      "national_list",
      "dispensing_category",
      "instruction",
      "reimbursement",
      "price",
      "interactions",
      "series_restrictions",
    ]);
    expect(
      result.profile.coverage.sources.find(
        (item) => item.key === "interactions",
      )?.detail,
    ).toContain("33 з 320");
    expect(result.profile.warnings).toEqual([
      "reimbursement_source_not_connected",
      "price_source_not_connected",
    ]);
  });

  it("fails closed when the exact product pair is absent or mismatched", async () => {
    await expect(
      loadProfessionalProductProfile(
        PRODUCT_ID,
        REGISTRATION,
        dependencies({
          resolveExactProduct: async () => ({ status: "not_found" }),
        }),
      ),
    ).resolves.toEqual({ status: "not_found" });

    await expect(
      loadProfessionalProductProfile(
        PRODUCT_ID,
        REGISTRATION,
        dependencies({
          resolveExactProduct: async () => ({
            status: "found",
            product: product({
              id: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
            }),
          }),
        }),
      ),
    ).resolves.toEqual({ status: "not_found" });
  });

  it("does not replace an unavailable production registry with fallback data", async () => {
    await expect(
      loadProfessionalProductProfile(
        PRODUCT_ID,
        REGISTRATION,
        dependencies({
          resolveExactProduct: async () => ({ status: "unavailable" }),
        }),
      ),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("keeps the product profile available when Rx/OTC evidence fails", async () => {
    const result = await loadProfessionalProductProfile(
      PRODUCT_ID,
      REGISTRATION,
      dependencies({
        checkDispensingCategory: () => {
          throw new Error("snapshot unavailable");
        },
      }),
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.profile.dispensingCategory).toBeNull();
    expect(result.profile.coverage.connectedSources).toBe(5);
    expect(
      result.profile.coverage.sources.find(
        (item) => item.key === "dispensing_category",
      )?.status,
    ).toBe("unavailable");
    expect(result.profile.warnings).toContain(
      "dispensing_category_unavailable",
    );
  });

  it("marks non-exact regulatory states without inventing a positive conclusion", async () => {
    const result = await loadProfessionalProductProfile(
      PRODUCT_ID,
      REGISTRATION,
      dependencies({
        resolveExactProduct: async () => ({
          status: "found",
          product: product({
            registration: {
              number: REGISTRATION,
              startDate: "2020-01-01",
              endDate: "2025-01-01",
              status: "terminated",
            },
            nationalListStatus: "uncertain",
            nationalListMatchReason: "Форма або дозування не збігаються.",
            instructionAvailable: false,
            instructionSourceStatus: "not_published",
            officialInstructionDocumentUrl: null,
          }),
        }),
      }),
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.profile.coverage.complete).toBe(false);
    expect(result.profile.warnings).toEqual(
      expect.arrayContaining([
        "registration_not_active",
        "national_list_not_exact",
        "instruction_not_structured",
      ]),
    );
  });

  it("contains no secrets or local filesystem paths", async () => {
    const result = await loadProfessionalProductProfile(
      PRODUCT_ID,
      REGISTRATION,
      dependencies(),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toContain("C:");
    expect(serialized).not.toContain("/home/");
  });
});
