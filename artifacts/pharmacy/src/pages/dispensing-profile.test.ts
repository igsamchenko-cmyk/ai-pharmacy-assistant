import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  ProfessionalProductProfile,
  SeriesRestrictionCheck,
} from "@workspace/api-client-react";
import {
  OfficialProgramsPanel,
  ProfessionalProfileCoveragePanel,
} from "./dispensing";

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
    summary: "Реєстраційного номера немає в поточному каталозі цін.",
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
  coverage: {
    connectedSources: 8,
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
        status: "ready",
        detail: "Офіційний знімок підключено.",
        sourceUrl: null,
        checkedAt: null,
      },
      {
        key: "price",
        label: "Гранична ціна",
        status: "ready",
        detail: "Офіційний знімок підключено.",
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
  warnings: [],
};

describe("professional profile coverage panel", () => {
  it("renders all eight source states without a false safe conclusion", () => {
    const html = renderToStaticMarkup(
      createElement(ProfessionalProfileCoveragePanel, { profile }),
    );

    expect(html).toContain("Єдиний профіль джерел");
    expect(html).toContain("Підключено 8/");
    expect(html).toContain("8");
    expect(html).toContain("Державна реєстрація");
    expect(html).toContain("Доступні ліки");
    expect(html).toContain("Гранична ціна");
    expect(html).toContain("Підтверджено");
    expect(html).toContain("Потрібні дані");
    expect(html).toContain("Неповне покриття не є дозволом на відпуск");
    expect(html).not.toContain("Безпечно");
  });

  it("updates series-source coverage after the exact series check", () => {
    const seriesRestriction = {
      status: "no_match",
      summary: "Точного збігу не знайдено.",
      source: {
        title: "Реєстр документів щодо якості лікарських засобів",
        url: "https://pub-mex.dls.gov.ua/QLA/DocList.aspx",
        generatedAt: "2026-07-29T00:00:00.000Z",
        freshness: "current",
      },
    } as SeriesRestrictionCheck;
    const html = renderToStaticMarkup(
      createElement(ProfessionalProfileCoveragePanel, {
        profile,
        seriesRestriction,
      }),
    );

    expect(html).toMatch(
      /profile-source-series_restrictions[\s\S]*?Підтверджено/,
    );
    expect(html.match(/Потрібні дані/g)).toHaveLength(1);
  });
});
describe("official programs panel", () => {
  it("shows exact NSZU reimbursement and explains the price-catalog scope", () => {
    const html = renderToStaticMarkup(
      createElement(OfficialProgramsPanel, { profile }),
    );

    expect(html).toContain("Офіційні програми та ціни");
    expect(html).toContain("«Доступні ліки»");
    expect(html).toContain("Безоплатно");
    expect(html).toContain("Національний каталог цін");
    expect(html).toContain("суму доплати НСЗУ");
    expect(html).not.toContain("Джерело не підключено");
  });

  it("does not present a stale NSZU row as a current positive result", () => {
    const staleReimbursement = profile.reimbursement
      ? {
          ...profile.reimbursement,
          source: {
            ...profile.reimbursement.source,
            freshness: "stale" as const,
          },
        }
      : null;
    const html = renderToStaticMarkup(
      createElement(OfficialProgramsPanel, {
        profile: { ...profile, reimbursement: staleReimbursement },
      }),
    );

    expect(html).toContain("Дані застарілі");
    expect(html).toContain("Не використовуйте цей статус для відпуску");
    expect(html).not.toContain(">Включено<");
  });
});
