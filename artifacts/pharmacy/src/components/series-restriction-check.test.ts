import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  RegistryProductResult,
  SeriesRestrictionCheck,
} from "@workspace/api-client-react";
import {
  SeriesRestrictionCheckPanel,
  seriesRestrictionStatusLabel,
} from "./series-restriction-check";

const product = {
  id: "A".repeat(32),
  registration: { number: "UA/15145/01/01" },
} as RegistryProductResult;

const result: SeriesRestrictionCheck = {
  version: "1.0",
  productId: product.id,
  registrationNumber: "UA/15145/01/01",
  series: "AO261002",
  status: "blocked",
  action: "stop",
  summary: "Знайдено чинну заборону.",
  matchedAllSeries: false,
  matchedUnspecifiedSeries: false,
  otherSeriesEventCount: 0,
  events: [
    {
      documentDate: "2026-07-24",
      documentNumber: "336-001.001/002.0/17-26",
      eventType: "permanent_ban",
      registrationNumber: "UA/15145/01/01",
      medicineName: "ПАКЛІТАКСЕЛ АМАКСА",
      dosageForm: "концентрат",
      seriesRaw: "AO261002",
      seriesValues: ["AO261002"],
      allSeries: false,
      seriesUnspecified: false,
      manufacturer: "АкВіда ГмбХ",
      country: "Німеччина",
      additionalInfo: "",
    },
  ],
  source: {
    title: "Реєстр документів щодо якості лікарських засобів",
    url: "https://pub-mex.dls.gov.ua/QLA/DocList.aspx",
    generatedAt: "2026-07-27T20:16:46.102Z",
    latestDocumentDate: "2026-07-24",
    coverageStartDate: "2000-01-01",
    complete: true,
    recordCount: 21421,
    sha256: "a".repeat(64),
    freshness: "current",
  },
};

describe("series restriction check UI", () => {
  it("renders a prominent stop signal and official document number", () => {
    const html = renderToStaticMarkup(
      createElement(SeriesRestrictionCheckPanel, {
        product,
        draftSeries: "AO261002",
        submittedSeries: "AO261002",
        result,
        isLoading: false,
        isError: false,
        onDraftSeriesChange: () => undefined,
        onSubmit: () => undefined,
      }),
    );

    expect(seriesRestrictionStatusLabel(result)).toContain("СТОП");
    expect(html).toContain('data-testid="series-check-result"');
    expect(html).toContain("336-001.001/002.0/17-26");
    expect(html).toContain("AO261002");
    expect(html).toContain("Відкрити офіційний реєстр");
  });

  it("does not describe no-match as safe", () => {
    const noMatch = {
      ...result,
      status: "no_match" as const,
      action: "manual_review" as const,
      events: [],
    };
    expect(seriesRestrictionStatusLabel(noMatch)).toContain("це не дозвіл");
  });
});
