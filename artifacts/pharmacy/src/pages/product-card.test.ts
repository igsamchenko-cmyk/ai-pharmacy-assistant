import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../components/report-issue-button", () => ({
  ReportIssueButton: () => "Повідомити про проблему",
}));
import type {
  ProductCard,
  ProductCardFreshnessEntry,
} from "@workspace/api-client-react";
import type { InstructionCacheRecord } from "@/lib/instruction-cache";
import {
  CachedInstructionPreview,
  PRODUCT_CARD_HERO_CLASS,
  PRODUCT_CARD_PAGE_CLASS,
  PRODUCT_CARD_TITLE_CLASS,
  ProductCardContent,
  instructionQuoteFromHash,
  instructionSectionKeyFromHash,
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

function renderCard(
  value: ProductCard,
  activeTab: "profile" | "analogs" | "instruction" = "profile",
): string {
  // The series-check panel calls a react-query hook (enabled only after a
  // pharmacist submits a series), so `useQuery` needs a client in context
  // even though this static render never triggers a fetch.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        Router,
        { ssrPath: `/products/${PRODUCT_ID}` },
        createElement(ProductCardContent, {
          card: value,
          favorite: false,
          onToggleFavorite: () => undefined,
          activeTab,
        }),
      ),
    ),
  );
}

describe("operational product card UI", () => {
  it("keeps a long trade name visible and never promotes unknown dispensing to OTC", () => {
    const value = card();
    const html = renderCard(value);

    expect(html).toContain(value.identity.tradeName);
    expect(html).toContain('data-testid="product-card-title"');
    expect(html).not.toContain('data-testid="product-card-dispensing-status"');
    expect(html).not.toContain("Категорію не підтверджено");
    expect(html).not.toContain("Без рецепта");
    expect(html).not.toContain("Не трактуйте відсутні або неповні дані");
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
    expect(instructionIndex).toBeLessThan(
      html.indexOf('data-testid="product-card-series-status"'),
    );
  });

  it("omits the status area when dispensing is unresolved and bans are stale", () => {
    const base = card();
    const html = renderCard(
      card({
        seriesStatus: {
          ...base.seriesStatus!,
          source: {
            ...base.seriesStatus!.source,
            freshness: "stale",
          },
        },
      }),
    );

    expect(html).not.toContain('data-testid="product-card-key-statuses"');
    expect(html).not.toContain('data-testid="product-card-dispensing-status"');
    expect(html).not.toContain('data-testid="product-card-series-status"');
    expect(html).not.toContain("Знімок заборон потребує оновлення");
  });

  it("offers a real exact-series check instead of a passive warning", () => {
    const attention = renderCard(card());
    expect(attention).toContain("Є розпорядження — перевірте серію");
    expect(attention).toContain("AB-1");
    expect(attention).toContain('data-testid="series-check-panel"');
    expect(attention).toContain('data-testid="series-input"');
    const submitIndex = attention.indexOf('data-testid="series-check-submit"');
    expect(submitIndex).toBeGreaterThan(-1);
    // The submit button starts disabled: no series has been typed yet, and
    // the check must never fire against an empty/unsubmitted value.
    expect(attention.slice(0, submitIndex)).toMatch(/disabled[^>]*$/);
    expect(attention).not.toContain('data-testid="series-check-result"');

    const allSeries = renderCard(
      card({
        seriesStatus: {
          ...card().seriesStatus!,
          allSeriesAffected: true,
        },
      }),
    );
    expect(allSeries).toContain("Заборонено всі серії");
    expect(allSeries).toContain(
      "заборона поширюється на всі серії цього реєстраційного посвідчення",
    );

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
    // The interactive checker stays available even when the snapshot shows
    // no restriction, since a pharmacist can still look up a specific series.
    expect(clear).toContain('data-testid="series-input"');
  });

  it("separates profile and instruction content without hiding safety actions", () => {
    const value = card();
    const profile = renderCard(value, "profile");

    expect(profile).toContain("Розчинити в 10 мл води для ін&#x27;єкцій.");
    expect(profile).toContain("Не змішувати з несумісними розчинами.");
    expect(profile).toContain("Госпітальні факти з інструкції");
    expect(profile).toContain("Переліки та ціна");
    expect(profile).toContain("Свіжість кожного джерела");
    expect(profile).toContain("Розпорядження Держлікслужби");
    expect(profile).toContain("Фармаконагляд");
    expect(profile).toContain("AI-довідка");
    expect(profile).not.toContain('data-testid="product-ai-summary"');
    expect(profile).not.toContain('id="instruction-administration"');
    expect(profile).toContain('data-testid="product-card-panel-profile"');

    const instruction = renderCard(value, "instruction");
    expect(instruction).toContain(
      `id="instruction-quote-administration-0-${ADMINISTRATION_TEXT.length}"`,
    );
    expect(instruction).toContain(
      `data-char-end="${ADMINISTRATION_TEXT.length}"`,
    );
    expect(instruction).toContain('id="instruction-administration"');
    expect(instruction).toContain("Шукати в інструкціях");
    expect(instruction).not.toContain("Переліки та ціна");
    expect(instruction).not.toContain(
      "Прямої вказівки про швидкість введення не знайдено",
    );
    expect(instruction).not.toContain("Швидкість введення");
    expect(instruction).toContain("Повідомити про проблему");
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

  it("uses a wide unclamped layout for one verified hospital fact", () => {
    const base = card();
    const maxDoseText =
      "Дозу слід встановлювати індивідуально, поступово збільшуючи її під контролем частоти серцевих скорочень.";
    const html = renderCard(
      card({
        instruction: {
          ...base.instruction,
          sections: {
            ...base.instruction.sections,
            administration: maxDoseText,
          },
          administrationFacts: {
            reconstitution: null,
            diluents: [],
            incompatibilities: [],
            infusionRate: null,
            stabilityAfterPrep: null,
            renalAdjustment: null,
            hepaticAdjustment: null,
            maxDailyDose: {
              text: maxDoseText,
              sectionKey: "administration",
              charStart: 0,
              charEnd: maxDoseText.length,
            },
          },
        },
      }),
    );

    expect(html).toContain('data-layout="single"');
    expect(html).toContain('data-testid="hospital-fact-quote"');
    expect(html).toContain("lg:max-w-5xl");
    expect(html).toContain("max-w-4xl");
    expect(html).toContain(maxDoseText);
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

  it("shows the trust strip with the document date, registration number and a partial badge", () => {
    const value = card();
    const html = renderCard(value, "instruction");

    expect(html).toContain('data-testid="instruction-trust-badge"');
    expect(html).toContain("Офіційна редакція від");
    expect(html).toContain(REGISTRATION);
    expect(html).toContain("джерело ДРЛЗ");
    expect(html).toContain('data-testid="instruction-partial-badge"');
    expect(html).toContain("Розпізнано частково");
  });

  it("hides the partial badge once every canonical section is covered", () => {
    const base = card();
    const html = renderCard(
      card({
        instruction: {
          ...base.instruction,
          provenance: {
            ...base.instruction.provenance!,
            availableSectionCount: 9,
            coveragePct: 100,
          },
        },
      }),
      "instruction",
    );

    expect(html).toContain('data-testid="instruction-trust-badge"');
    expect(html).not.toContain('data-testid="instruction-partial-badge"');
  });

  it("parses a plain section anchor for PR-H chip/search landing, distinct from the quote-anchor format", () => {
    expect(instructionSectionKeyFromHash("#instruction-indications")).toBe(
      "indications",
    );
    expect(
      instructionSectionKeyFromHash("#instruction-pregnancyAndLactation"),
    ).toBe("pregnancyAndLactation");
    expect(instructionSectionKeyFromHash("#instruction-unknown")).toBeNull();
    expect(
      instructionSectionKeyFromHash("#instruction-quote-interactions-0-10"),
    ).toBeNull();
    expect(instructionSectionKeyFromHash("")).toBeNull();
  });

  it("renders quick-jump chips only for sections actually present in this instruction (PR-H, H.1.2)", () => {
    const html = renderCard(card(), "instruction");
    // Fixture has indications/administration/contraindications/interactions
    // populated and adverseReactions/pregnancyAndLactation null.
    expect(html).toContain(
      'data-testid="instruction-section-chip-indications"',
    );
    expect(html).toContain(
      'data-testid="instruction-section-chip-administration"',
    );
    expect(html).toContain(
      'data-testid="instruction-section-chip-contraindications"',
    );
    expect(html).toContain(
      'data-testid="instruction-section-chip-interactions"',
    );
    expect(html).not.toContain(
      'data-testid="instruction-section-chip-pregnancyAndLactation"',
    );
    expect(html).not.toContain(
      'data-testid="instruction-section-chip-adverseReactions"',
    );
  });

  it("never shows a 'Діти' chip -- no children section exists in the reconciled 9-key model", () => {
    const base = card();
    const html = renderCard(
      card({
        instruction: {
          ...base.instruction,
          sections: {
            indications: "Показання.",
            contraindications: "Протипоказання.",
            adverseReactions: "Побічні.",
            interactions: "Взаємодії.",
            specialWarnings: "Застереження.",
            pregnancyAndLactation: "Вагітність.",
            administration: "Дози.",
            overdose: "Передозування.",
            storage: "Зберігання.",
          },
        },
      }),
      "instruction",
    );
    const chipCount = (
      html.match(/data-testid="instruction-section-chip-/g) ?? []
    ).length;
    expect(chipCount).toBe(6);
    expect(html).not.toContain("Діти");
  });

  it("omits the chip row entirely when there are no structured sections", () => {
    const base = card();
    const html = renderCard(
      card({ instruction: { ...base.instruction, sections: null } }),
      "instruction",
    );
    expect(html).not.toContain('data-testid="instruction-section-chips"');
  });

  it("renders the 3-step font-size control and defaults to the medium step (PR-I, I.2)", () => {
    const html = renderCard(card(), "instruction");
    expect(html).toContain('data-testid="instruction-font-size-control"');
    expect(html).toContain('data-testid="instruction-font-size-sm"');
    expect(html).toContain('data-testid="instruction-font-size-md"');
    expect(html).toContain('data-testid="instruction-font-size-lg"');
    expect(html).toMatch(
      /aria-pressed="true"[^>]*data-testid="instruction-font-size-md"/,
    );
  });

  it("omits the font-size control when there are no structured sections (PR-I, I.2)", () => {
    const base = card();
    const html = renderCard(
      card({ instruction: { ...base.instruction, sections: null } }),
      "instruction",
    );
    expect(html).not.toContain('data-testid="instruction-font-size-control"');
  });

  it("renders a share button for every section shown on the tab (PR-I, I.2)", () => {
    const html = renderCard(card(), "instruction");
    // All 9 canonical sections render a details row (with a "not
    // structured" fallback message for the null ones), so every one gets
    // its own share link -- not just the populated sections.
    for (const key of [
      "indications",
      "contraindications",
      "adverseReactions",
      "interactions",
      "specialWarnings",
      "pregnancyAndLactation",
      "administration",
      "overdose",
      "storage",
    ]) {
      expect(html).toContain(`data-testid="instruction-section-share-${key}"`);
    }
  });

  it("relabels the section search box as find-in-text (PR-I, I.1)", () => {
    const html = renderCard(card(), "instruction");
    expect(html).toContain("Знайти в тексті");
    expect(html).toContain('data-testid="instruction-find-input"');
    // With no query typed yet, the match counter/prev/next controls are
    // not rendered at all -- they only appear once there is something to
    // count or navigate.
    expect(html).not.toContain('data-testid="instruction-find-nav"');
  });
});

describe("cached instruction preview", () => {
  function cachedRecord(
    overrides: Partial<InstructionCacheRecord> = {},
  ): InstructionCacheRecord {
    const base = card();
    return {
      productId: PRODUCT_ID,
      instruction: base.instruction,
      productTradeName: base.identity.tradeName,
      registrationNumber: REGISTRATION,
      documentHash: base.instruction.source?.documentHash ?? null,
      cachedAt: 1_700_000_000_000,
      lastAccessedAt: 1_700_000_000_000,
      ...overrides,
    };
  }

  it("renders sections, trade name and the trust strip straight from the cache", () => {
    const html = renderToStaticMarkup(
      createElement(Router, { ssrPath: `/products/${PRODUCT_ID}` }, [
        createElement(CachedInstructionPreview, {
          key: "preview",
          cached: cachedRecord(),
        }),
      ]),
    );

    expect(html).toContain('data-testid="product-card-cached-instruction"');
    expect(html).toContain(card().identity.tradeName);
    expect(html).toContain(REGISTRATION);
    expect(html).toContain('data-testid="instruction-trust-badge"');
    expect(html).toContain("Збережена версія");
    expect(html).toContain("Розчинити в 10 мл води для ін&#x27;єкцій.");
    expect(html).toContain("Оновлюємо дані з сервера");
  });

  it("omits the section list when the cached record has no structured sections", () => {
    const base = card();
    const html = renderToStaticMarkup(
      createElement(Router, { ssrPath: `/products/${PRODUCT_ID}` }, [
        createElement(CachedInstructionPreview, {
          key: "preview",
          cached: cachedRecord({
            instruction: { ...base.instruction, sections: null },
          }),
        }),
      ]),
    );

    expect(html).not.toContain('id="instruction-administration"');
    expect(html).toContain("Оновлюємо дані з сервера");
  });
});
