import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Router } from "wouter";

vi.mock("../components/report-issue-button", () => ({
  ReportIssueButton: () => "Повідомити про проблему",
}));
import type {
  ProductCard,
  ProductCardFreshnessEntry,
} from "@workspace/api-client-react";
import {
  PRODUCT_CARD_HERO_CLASS,
  PRODUCT_CARD_PAGE_CLASS,
  PRODUCT_CARD_TITLE_CLASS,
  ProductCardContent,
  instructionQuoteFromHash,
} from "./product-card";

const PRODUCT_ID = "A".repeat(32);
const REGISTRATION = "UA/10001/01/01";
const ADMINISTRATION_TEXT = "Розчинити в 10 мл води для ін'єкцій.";
const INTERACTIONS_TEXT = "Не змішувати з несумісними розчинами.";

function freshness(): ProductCardFreshnessEntry[] {
  return [
    "registry",
    "national_list",
    "dispensing_category",
    "instruction",
    "reimbursement",
    "price",
    "interactions",
    "series_restrictions",
  ].map((key) => ({
    key: key as ProductCardFreshnessEntry["key"],
    status: key === "registry" ? "unknown" : "current",
    checkedAt: key === "registry" ? null : "2026-08-01T08:00:00.000Z",
    sourceUrl: key === "registry" ? null : "https://example.org/source",
  }));
}

function card(overrides: Partial<ProductCard> = {}): ProductCard {
  const identity: ProductCard["identity"] = {
    resultType: "registry_product",
    id: PRODUCT_ID,
    tradeName: `КРЕОН® ${"ДУЖЕ-ДОВГА-ТОРГОВА-НАЗВА".repeat(8)}`,
    inn: "Мультіензими",
    activeIngredient: "Панкреатин",
    atcCode: "A09AA02",
    dosageForm: "капсули тверді з гастрорезистентними гранулами",
    strength: "150 мг",
    manufacturers: [{ name: "Абботт Лабораторіз ГмбХ", country: "Німеччина" }],
    registration: {
      number: REGISTRATION,
      startDate: "2025-01-01",
      endDate: "2030-01-01",
      status: "active",
    },
    source: { key: "drlz", label: "Державний реєстр ЛЗ" },
    mappingStatus: "approved",
    approvedMapping: {
      ingredientId: "ingredient-pancreatin",
      inn: "Мультіензими",
      latin: "Multienzymes",
      english: "Multienzymes",
      atcCode: "A09AA02",
    },
    sourceRecordCount: 1,
    nationalListStatus: "exact",
    nationalListRelease: "ua-national-list-2026",
    nationalListMatchReason: "Точний збіг.",
    nationalListSection: "Травна система",
    nationalListSource: {
      title: "Національний перелік",
      actNumber: "333",
      actDate: "2009-03-25",
      revisionDate: "2026-07-01",
      effectiveDate: "2026-07-01",
      url: "https://zakon.rada.gov.ua/",
    },
    nationalListCheckedAt: "2026-08-01T08:00:00.000Z",
    nationalListMatchDetails: null,
    instructionAvailable: true,
    instructionSourceStatus: "structured",
    officialInstructionDocumentUrl: `https://www.drlz.com.ua/ibp/lz_www.nsf/id/${PRODUCT_ID}`,
  };
  const sources: ProductCard["coverage"]["sources"] = [
    "registry",
    "national_list",
    "dispensing_category",
    "instruction",
    "reimbursement",
    "price",
    "interactions",
    "series_restrictions",
  ].map((key) => ({
    key: key as ProductCard["coverage"]["sources"][number]["key"],
    label: key,
    status: "ready",
    detail: "Перевірено.",
    sourceUrl: null,
    checkedAt: null,
  }));

  return {
    version: "1.0",
    identity,
    dispensing: {
      status: "unknown",
      confidence: "requires_review",
      check: {
        version: "1.0",
        productId: PRODUCT_ID,
        registrationNumber: REGISTRATION,
        status: "unknown",
        action: "manual_review",
        matchStatus: "product_and_registration",
        summary: "Умови відпуску не заповнені у точному записі.",
        conditions: [],
        packageDependent: false,
        restrictedSetting: false,
        source: {
          title: "ДРЛЗ",
          url: "https://www.drlz.com.ua/",
          checkedAt: "2026-08-01T08:00:00.000Z",
          generatedAt: "2026-08-01T08:00:00.000Z",
          complete: true,
          officialRowCount: 16_474,
          recordCount: 16_474,
          sha256: "b".repeat(64),
          freshness: "current",
          legalBasisTitle: "Наказ МОЗ",
          legalBasisUrl: "https://zakon.rada.gov.ua/",
          legalBasisRevisionDate: "2026-07-01",
        },
      },
    },
    economics: {
      nationalList: {
        status: "exact",
        release: "ua-national-list-2026",
        matchReason: "Точний збіг.",
        section: "Травна система",
        source: identity.nationalListSource,
        checkedAt: "2026-08-01T08:00:00.000Z",
      },
      reimbursement: null,
      price: null,
    },
    seriesStatus: {
      version: "1.0",
      registrationNumber: REGISTRATION,
      hasAnyRestriction: true,
      requiresSeriesCheck: true,
      eventCount: 2,
      restrictedSeries: ["AB-1"],
      allSeriesAffected: false,
      unspecifiedSeriesAffected: false,
      events: [],
      source: {
        title: "Держлікслужба",
        url: "https://pub-mex.dls.gov.ua/QLA/DocList.aspx",
        generatedAt: "2026-08-01T08:00:00.000Z",
        latestDocumentDate: "2026-08-01",
        coverageStartDate: "2000-01-01",
        complete: true,
        recordCount: 20_000,
        sha256: "c".repeat(64),
        freshness: "current",
      },
    },
    instruction: {
      available: true,
      sourceStatus: "structured",
      sections: {
        indications: "Показання з офіційної інструкції.",
        contraindications: "Протипоказання з офіційної інструкції.",
        adverseReactions: null,
        interactions: INTERACTIONS_TEXT,
        specialWarnings: null,
        pregnancyAndLactation: null,
        administration: ADMINISTRATION_TEXT,
        overdose: null,
        storage: "Зберігати до 25 °C.",
      },
      administrationFacts: {
        reconstitution: {
          text: ADMINISTRATION_TEXT,
          sectionKey: "administration",
          charStart: 0,
          charEnd: ADMINISTRATION_TEXT.length,
        },
        diluents: [
          {
            text: ADMINISTRATION_TEXT,
            sectionKey: "administration",
            charStart: 0,
            charEnd: ADMINISTRATION_TEXT.length,
          },
        ],
        incompatibilities: [
          {
            text: INTERACTIONS_TEXT,
            sectionKey: "interactions",
            charStart: 0,
            charEnd: INTERACTIONS_TEXT.length,
          },
        ],
        infusionRate: null,
        stabilityAfterPrep: null,
        renalAdjustment: null,
        hepaticAdjustment: null,
        maxDailyDose: null,
      },
      source: {
        url: `https://www.drlz.com.ua/ibp/lz_www.nsf/id/${PRODUCT_ID}`,
        documentId: "D".repeat(32),
        documentDate: "2026-07-01T00:00:00.000Z",
        checkedAt: "2026-08-01T08:00:00.000Z",
        documentHash: "d".repeat(64),
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
    },
    freshness: freshness(),
    coverage: {
      connectedSources: 8,
      totalSources: 8,
      complete: false,
      sources,
    },
    warnings: ["series_check_required"],
    ...overrides,
  };
}

function renderCard(value: ProductCard): string {
  return renderToStaticMarkup(
    createElement(
      Router,
      { ssrPath: `/products/${PRODUCT_ID}` },
      createElement(ProductCardContent, {
        card: value,
        favorite: false,
        onToggleFavorite: () => undefined,
        draftSeries: "",
        submittedSeries: "",
        seriesLoading: false,
        seriesError: false,
        onDraftSeriesChange: () => undefined,
        onSubmitSeries: () => undefined,
      }),
    ),
  );
}

describe("operational product card UI", () => {
  it("keeps a long trade name visible and never promotes unknown dispensing to OTC", () => {
    const value = card();
    const html = renderCard(value);

    expect(html).toContain(value.identity.tradeName);
    expect(html).toContain('data-testid="product-card-title"');
    expect(html).toContain("Категорію не підтверджено");
    expect(html).not.toContain("Без рецепта");
    expect(html).toContain("Не трактуйте відсутні або неповні дані");
    expect(PRODUCT_CARD_PAGE_CLASS).toContain("overflow-x-clip");
    expect(PRODUCT_CARD_HERO_CLASS).not.toContain("overflow-hidden");
    expect(PRODUCT_CARD_TITLE_CLASS).toContain("overflow-wrap:anywhere");
    expect(PRODUCT_CARD_TITLE_CLASS).toContain("relative z-10");
    const instructionIndex = html.indexOf(
      'data-testid="product-card-instruction-quick-action"',
    );
    expect(html).toContain("Відкрити інструкцію");
    expect(instructionIndex).toBeGreaterThan(
      html.indexOf('data-testid="product-card-title"'),
    );
    expect(instructionIndex).toBeLessThan(html.indexOf("Категорія відпуску"));
  });

  it("shows exact-series input only when a prohibition document raised the flag", () => {
    const attention = renderCard(card());
    expect(attention).toContain("Є розпорядження — перевірте серію");
    expect(attention).toContain('data-testid="series-input"');

    const clear = renderCard(
      card({
        seriesStatus: {
          ...card().seriesStatus!,
          hasAnyRestriction: false,
          requiresSeriesCheck: false,
          eventCount: 0,
          restrictedSeries: [],
        },
      }),
    );
    expect(clear).toContain("Заборонних документів за номером не знайдено");
    expect(clear).not.toContain('data-testid="series-input"');
  });

  it("keeps direct instruction text, economics and per-source dates on one page", () => {
    const html = renderCard(card());

    expect(html).toContain("Розчинити в 10 мл води для ін&#x27;єкцій.");
    expect(html).toContain("Не змішувати з несумісними розчинами.");
    expect(html).toContain("Госпітальні факти з інструкції");
    expect(html).toContain(
      `id="instruction-quote-administration-0-${ADMINISTRATION_TEXT.length}"`,
    );
    expect(html).toContain(`data-char-end="${ADMINISTRATION_TEXT.length}"`);
    expect(html).not.toContain(
      "Прямої вказівки про швидкість введення не знайдено",
    );
    expect(html).not.toContain("Швидкість введення");
    expect(html).toContain("У тексті");
    expect(html).toContain('id="instruction-administration"');
    expect(html).toContain("Переліки та ціна");
    expect(html).toContain("Свіжість кожного джерела");
    expect(html).toContain("Розпорядження Держлікслужби");
    expect(html).toContain("Повідомити про проблему");
  });

  it("omits hospital facts entirely when no verified quotes exist", () => {
    const base = card();
    const html = renderCard(
      card({
        instruction: {
          ...base.instruction,
          administrationFacts: {
            reconstitution: null,
            diluents: [],
            incompatibilities: [],
            infusionRate: null,
            stabilityAfterPrep: null,
            renalAdjustment: null,
            hepaticAdjustment: null,
            maxDailyDose: null,
          },
        },
      }),
    );

    expect(html).not.toContain("Госпітальні факти з інструкції");
    expect(html).not.toContain("Прямої структурованої вказівки поки немає");
    expect(html).not.toContain("Відновлення / розчинник");
  });

  it("resolves a search-result hash only when it points to exact section text", () => {
    const sections = card().instruction.sections;
    const valid = instructionQuoteFromHash(
      `#instruction-quote-interactions-0-${INTERACTIONS_TEXT.length}`,
      sections,
    );
    expect(valid).toEqual({
      text: INTERACTIONS_TEXT,
      sectionKey: "interactions",
      charStart: 0,
      charEnd: INTERACTIONS_TEXT.length,
    });
    expect(
      instructionQuoteFromHash(
        "#instruction-quote-interactions-0-99999",
        sections,
      ),
    ).toBeNull();
    expect(
      instructionQuoteFromHash("#instruction-quote-unknown-0-4", sections),
    ).toBeNull();
  });
});
