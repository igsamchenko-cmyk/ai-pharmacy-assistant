import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProfessionalProductProfile } from "@workspace/api-client-react";
import { ProfessionalProfileCoveragePanel } from "./dispensing";

const profile: ProfessionalProductProfile = {
  version: "1.0",
  product: {
    resultType: "registry_product",
    id: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    tradeName: "ЕНАП",
    inn: "Еналаприл",
    activeIngredient: "Еналаприл 10 мг",
    atcCode: "C09AA02",
    dosageForm: "таблетки",
    strength: "10 мг",
    manufacturers: [{ name: "КРКА", country: "Словенія" }],
    registration: {
      number: "UA/10001/01/01",
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
    nationalListRelease: "release-1",
    nationalListMatchReason: "Точний збіг.",
    nationalListSection: "Серцево-судинні засоби",
    nationalListSource: null,
    nationalListCheckedAt: "2026-07-29T00:00:00.000Z",
    nationalListMatchDetails: null,
    instructionAvailable: true,
    instructionSourceStatus: "structured",
    officialInstructionDocumentUrl: null,
  },
  dispensingCategory: null,
  coverage: {
    connectedSources: 6,
    totalSources: 8,
    complete: false,
    sources: [
      {
        key: "registry",
        label: "Державна реєстрація",
        status: "ready",
        detail: "Точну позицію знайдено.",
        sourceUrl: null,
        checkedAt: null,
      },
      {
        key: "national_list",
        label: "Національний перелік",
        status: "ready",
        detail: "Точний збіг.",
        sourceUrl: null,
        checkedAt: "2026-07-29T00:00:00.000Z",
      },
      {
        key: "dispensing_category",
        label: "Умови відпуску",
        status: "attention",
        detail: "Потрібна ручна перевірка.",
        sourceUrl: null,
        checkedAt: null,
      },
      {
        key: "instruction",
        label: "Офіційна інструкція",
        status: "ready",
        detail: "Структурована інструкція доступна.",
        sourceUrl: null,
        checkedAt: null,
      },
      {
        key: "reimbursement",
        label: "Доступні ліки",
        status: "not_connected",
        detail: "Джерело не підключено.",
        sourceUrl: null,
        checkedAt: null,
      },
      {
        key: "price",
        label: "Гранична ціна",
        status: "not_connected",
        detail: "Джерело не підключено.",
        sourceUrl: null,
        checkedAt: null,
      },
      {
        key: "interactions",
        label: "Перевірені взаємодії",
        status: "requires_input",
        detail: "Потрібні інші препарати.",
        sourceUrl: null,
        checkedAt: null,
      },
      {
        key: "series_restrictions",
        label: "Заборони серій",
        status: "requires_input",
        detail: "Потрібна серія.",
        sourceUrl: null,
        checkedAt: null,
      },
    ],
  },
  warnings: [
    "reimbursement_source_not_connected",
    "price_source_not_connected",
  ],
};

describe("professional profile coverage panel", () => {
  it("renders all eight source states without a false safe conclusion", () => {
    const html = renderToStaticMarkup(
      createElement(ProfessionalProfileCoveragePanel, { profile }),
    );

    expect(html).toContain("Єдиний профіль джерел");
    expect(html).toContain("Підключено 6/");
    expect(html).toContain("8");
    expect(html).toContain("Державна реєстрація");
    expect(html).toContain("Доступні ліки");
    expect(html).toContain("Гранична ціна");
    expect(html).toContain("Не підключено");
    expect(html).toContain("Потрібні дані");
    expect(html).toContain("Неповне покриття не є дозволом на відпуск");
    expect(html).not.toContain("Безпечно");
  });
});
