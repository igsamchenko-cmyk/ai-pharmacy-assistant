import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  DispensingCategoryCheck,
  RegistryProductResult,
} from "@workspace/api-client-react";
import { DispensingAssessmentPanel } from "@/pages/dispensing";
import {
  buildDispensingAssessment,
  type DispensingOfficialPrograms,
} from "./dispensing-safety";

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

function officialProgramsFixture(): DispensingOfficialPrograms {
  return {
    reimbursement: {
      version: "1.0",
      registrationNumber: "UA/10001/01/01",
      status: "listed",
      selected: {
        packageKey: "nszu-aaaaaaaaaaaaaaaaaaaaaaaa",
        section: "standard_medicines",
        registrationNumber: "UA/10001/01/01",
        inn: "Еналаприл",
        tradeName: "ЕНАП",
        dosageForm: "таблетки",
        strength: "10 мг",
        packageQuantity: "20 таблеток",
        atcCode: "C09AA02",
        copayUah: "0.00",
        sourcePage: 3,
        sourceRow: 1,
      },
      candidates: [],
      summary: "Упаковка включена до програми «Доступні ліки».",
      source: {
        title: "Перелік лікарських засобів, які підлягають реімбурсації",
        url: "https://backend.nszu.gov.ua/reimbursement.pdf",
        checkedAt: "2026-07-29T00:00:00.000Z",
        releaseDate: "2026-07-17",
        recordCount: 1007,
        sha256: "b".repeat(64),
        freshness: "current",
        warnings: [],
      },
    },
    price: {
      version: "1.0",
      registrationNumber: "UA/10001/01/01",
      status: "not_in_catalog",
      selected: null,
      candidates: [],
      summary: "Реімбурсовані препарати не входять до каталогу цін.",
      source: {
        title: "Національний каталог цін",
        url: "https://moz.gov.ua/uk/nacionalnij-katalog-cin",
        checkedAt: "2026-07-29T00:00:00.000Z",
        releaseDate: "2026-07-01",
        recordCount: 11060,
        sha256: "c".repeat(64),
        freshness: "current",
        scopeNote: "Реімбурсовані препарати не входять до каталогу.",
      },
    },
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
    expect(assessment.checks).toHaveLength(6);
  });

  it("shows a verified exact-product OTC result without claiming full dispensing approval", () => {
    const assessment = buildDispensingAssessment(
      productFixture(),
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

  it("uses exact NSZU and price-source results instead of disconnected placeholders", () => {
    const programs = officialProgramsFixture();
    const assessment = buildDispensingAssessment(
      productFixture(),
      dispensingCategoryFixture(),
      programs,
    );

    expect(
      assessment.checks.find((check) => check.id === "reimbursement"),
    ).toMatchObject({
      tone: "verified",
      statusLabel: "У програмі · безоплатно",
    });
    expect(
      assessment.checks.find((check) => check.id === "price"),
    ).toMatchObject({
      tone: "verified",
      statusLabel: "Доплата НСЗУ · 0 грн",
    });
    expect(
      assessment.checks
        .filter((check) => check.id === "reimbursement" || check.id === "price")
        .map((check) => check.statusLabel),
    ).not.toContain("Джерело не підключено");
  });

  it("advances to manual review only after every automatic regulatory check resolves", () => {
    const assessment = buildDispensingAssessment(
      productFixture(),
      dispensingCategoryFixture(),
      officialProgramsFixture(),
    );

    expect(assessment.decision).toBe("manual_review");
    expect(assessment.decisionLabel).toContain("професійний контроль");
    expect(assessment.decisionDetail).toContain("Регуляторному радарі");
  });

  it("keeps stale official-program data in an incomplete state", () => {
    const programs = officialProgramsFixture();
    programs.reimbursement = programs.reimbursement
      ? {
          ...programs.reimbursement,
          source: {
            ...programs.reimbursement.source,
            freshness: "stale",
          },
        }
      : null;
    const assessment = buildDispensingAssessment(
      productFixture(),
      dispensingCategoryFixture(),
      programs,
    );

    expect(assessment.decision).toBe("incomplete");
    expect(
      assessment.checks.find((check) => check.id === "reimbursement"),
    ).toMatchObject({
      tone: "attention",
      statusLabel: "Дані НСЗУ застарілі",
    });
  });

  it("keeps package-dependent conditions in manual review", () => {
    const conditional = dispensingCategoryFixture({
      status: "conditional",
      action: "verify_exact_package",
      conditions: ["за рецептом: № 100 / без рецепта: № 10"],
      packageDependent: true,
      summary: "Категорія залежить від розміру або виду упаковки.",
    });
    const assessment = buildDispensingAssessment(productFixture(), conditional);
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
    expect(html).toContain("Заборони й поновлення");
    expect(html).toContain("/regulatory-radar?q=UA%2F10001%2F01%2F01");
    expect(html).not.toContain("Введіть серію");
    expect(html).not.toContain("Відпуск дозволено");
  });
});
