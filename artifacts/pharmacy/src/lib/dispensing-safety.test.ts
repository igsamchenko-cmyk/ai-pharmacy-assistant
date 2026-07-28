import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  DispensingCategoryCheck,
  RegistryProductResult,
  SeriesRestrictionCheck,
} from "@workspace/api-client-react";
import { DispensingAssessmentPanel } from "@/pages/dispensing";
import { buildDispensingAssessment } from "./dispensing-safety";

function productFixture(
  overrides: Partial<RegistryProductResult> = {},
): RegistryProductResult {
  return {
    resultType: "registry_product",
    id: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    tradeName: "ЕНАП",
    inn: "Еналаприл",
    activeIngredient: "Еналаприл",
    atcCode: "C09AA02",
    dosageForm: "таблетки, по 20 таблеток у блістері",
    strength: "10 мг",
    manufacturers: [{ name: "KRKA", country: "Словенія" }],
    registration: {
      number: "UA/10001/01/01",
      startDate: "2025-01-01",
      endDate: "2030-01-01",
      status: "active",
    },
    source: { key: "drlz", label: "Державний реєстр лікарських засобів" },
    mappingStatus: "approved",
    approvedMapping: {
      ingredientId: "ingredient-1",
      inn: "Еналаприл",
      latin: "Enalaprilum",
      english: "Enalapril",
      atcCode: "C09AA02",
    },
    sourceRecordCount: 1,
    nationalListStatus: "exact",
    nationalListRelease: "ua-national-list-2025-10-10",
    nationalListMatchReason: "Точний збіг.",
    nationalListSection: "Серцево-судинні засоби",
    nationalListSource: {
      title: "Національний перелік",
      actNumber: "333",
      actDate: "2009-03-25",
      revisionDate: "2025-10-10",
      effectiveDate: "2025-10-10",
      url: "https://zakon.rada.gov.ua/laws/show/333-2009-%D0%BF#Text",
    },
    nationalListCheckedAt: "2026-07-18T00:00:00.000Z",
    nationalListMatchDetails: null,
    instructionAvailable: true,
    instructionSourceStatus: "structured",
    ...overrides,
  };
}

function dispensingCategoryFixture(
  overrides: Partial<DispensingCategoryCheck> = {},
): DispensingCategoryCheck {
  return {
    version: "1.0",
    productId: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    registrationNumber: "UA/10001/01/01",
    status: "otc",
    action: "otc_with_professional_checks",
    matchStatus: "product_and_registration",
    summary: "ДРЛЗ позначає цю точну реєстраційну позицію як безрецептурну.",
    conditions: ["без рецепта"],
    packageDependent: false,
    restrictedSetting: false,
    source: {
      title: "Державний реєстр лікарських засобів України",
      url: "https://data.gov.ua/dataset/fded13b8-4e2c-4c48-bf14-65d0e3106463",
      checkedAt: "2026-07-28T03:59:18.283Z",
      generatedAt: "2026-07-28T03:59:18.283Z",
      complete: true,
      officialRowCount: 16474,
      recordCount: 16474,
      sha256: "a".repeat(64),
      freshness: "current",
      legalBasisTitle: "Перелік безрецептурних лікарських засобів",
      legalBasisUrl: "https://zakon.rada.gov.ua/laws/show/z0423-26#Text",
      legalBasisRevisionDate: "2026-04-24",
    },
    ...overrides,
  };
}

describe("dispensing safety assessment", () => {
  it("never marks dispensing complete while critical regulatory sources are disconnected", () => {
    const assessment = buildDispensingAssessment(productFixture());

    expect(assessment.decision).toBe("incomplete");
    expect(
      assessment.checks.find((check) => check.id === "registration")?.tone,
    ).toBe("verified");
    expect(assessment.checks.find((check) => check.id === "rx-otc")?.tone).toBe(
      "attention",
    );
    expect(
      assessment.checks.find((check) => check.id === "series-restrictions")
        ?.detail,
    ).toContain("не означає відсутність заборони");
  });

  it("shows a verified exact-product OTC result without claiming full dispensing approval", () => {
    const assessment = buildDispensingAssessment(
      productFixture(),
      undefined,
      dispensingCategoryFixture(),
    );
    const check = assessment.checks.find((item) => item.id === "rx-otc");

    expect(check).toMatchObject({
      tone: "verified",
      statusLabel: "Без рецепта — точний запис ДРЛЗ",
    });
    expect(check?.detail).toContain("Умови ДРЛЗ: без рецепта");
    expect(assessment.decision).toBe("incomplete");
  });

  it("keeps package-dependent conditions in manual review", () => {
    const conditional = dispensingCategoryFixture({
      status: "conditional",
      action: "verify_exact_package",
      conditions: ["за рецептом: № 100 / без рецепта: № 10"],
      packageDependent: true,
      summary: "Категорія залежить від розміру або виду упаковки.",
    });
    const assessment = buildDispensingAssessment(
      productFixture(),
      undefined,
      conditional,
    );
    const check = assessment.checks.find((item) => item.id === "rx-otc");

    expect(check).toMatchObject({
      tone: "attention",
      statusLabel: "Залежить від упаковки",
    });
    expect(assessment.decisionDetail).toContain("точний розмір упаковки");
  });

  it("blocks a registry position whose registration is terminated", () => {
    const assessment = buildDispensingAssessment(
      productFixture({
        registration: {
          number: "UA/10001/01/01",
          startDate: "2020-01-01",
          endDate: "2025-01-01",
          status: "terminated",
        },
      }),
    );

    expect(assessment.decision).toBe("blocked");
    expect(assessment.decisionLabel).toContain("не підтверджено");
  });

  it("blocks dispensing when the exact series assessment contains a ban", () => {
    const restriction = {
      status: "blocked",
      summary: "Знайдено чинну заборону для точної серії.",
      source: {
        title: "Реєстр документів щодо якості лікарських засобів",
        url: "https://pub-mex.dls.gov.ua/QLA/DocList.aspx",
        generatedAt: "2026-07-27T20:16:46.102Z",
        freshness: "current",
      },
    } as SeriesRestrictionCheck;

    const assessment = buildDispensingAssessment(productFixture(), restriction);

    expect(assessment.decision).toBe("blocked");
    expect(assessment.decisionDetail).toContain("точної серії");
    expect(
      assessment.checks.find((check) => check.id === "series-restrictions")
        ?.tone,
    ).toBe("blocked");
  });
  it("renders evidence states and a direct exact-product instruction action", () => {
    const product = productFixture();
    const html = renderToStaticMarkup(
      createElement(DispensingAssessmentPanel, {
        product,
        dispensingCategory: dispensingCategoryFixture(),
      }),
    );

    expect(html).toContain('data-testid="dispensing-assessment"');
    expect(html).toContain('data-testid="dispensing-check-rx-otc"');
    expect(html).toContain("Без рецепта — точний запис ДРЛЗ");
    expect(html).toContain("Джерело не підключено");
    expect(html).toContain(`/instructions/${product.id}`);
    expect(html).not.toContain("Відпуск дозволено");
  });
});
