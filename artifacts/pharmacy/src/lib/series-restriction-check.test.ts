import { describe, expect, it } from "vitest";
import type { ProductSeriesRestrictionSummary } from "@workspace/api-client-react";
import {
  normalizeSeriesQuery,
  seriesCheckStatusLabel,
  seriesOverviewPresentation,
  SERIES_INPUT_MAX_LENGTH,
} from "./series-restriction-check";

function overview(
  overrides: Partial<ProductSeriesRestrictionSummary> = {},
): ProductSeriesRestrictionSummary {
  return {
    version: "1.0",
    registrationNumber: "UA/10001/01/01",
    hasAnyRestriction: true,
    requiresSeriesCheck: true,
    eventCount: 2,
    restrictedSeries: [],
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
    ...overrides,
  };
}

describe("seriesOverviewPresentation", () => {
  it("leads with an all-series ban when the summary marks every series affected", () => {
    const presentation = seriesOverviewPresentation(
      overview({ allSeriesAffected: true, eventCount: 3 }),
    );
    expect(presentation.tone).toBe("blocked");
    expect(presentation.label).toBe("Заборонено всі серії");
    expect(presentation.detail).toContain("всі серії");
    expect(presentation.detail).toContain("3");
  });

  it("lists named series explicitly when the summary names them", () => {
    const presentation = seriesOverviewPresentation(
      overview({ restrictedSeries: ["AB-1", "CD-2"] }),
    );
    expect(presentation.tone).toBe("caution");
    expect(presentation.detail).toContain("AB-1, CD-2");
  });

  it("truncates a long named-series list and notes the remainder", () => {
    const restrictedSeries = Array.from({ length: 9 }, (_, i) => `S${i}`);
    const presentation = seriesOverviewPresentation(
      overview({ restrictedSeries }),
    );
    expect(presentation.detail).toContain("S0, S1, S2, S3, S4, S5");
    expect(presentation.detail).toContain("та ще 3");
  });

  it("falls back to a generic note when no series are named", () => {
    const presentation = seriesOverviewPresentation(
      overview({ restrictedSeries: [] }),
    );
    expect(presentation.detail).toContain("не деталізовано");
  });

  it("flags an unspecified-series document distinctly from named series", () => {
    const presentation = seriesOverviewPresentation(
      overview({ restrictedSeries: ["AB-1"], unspecifiedSeriesAffected: true }),
    );
    expect(presentation.detail).toContain("без зазначеної серії");
  });

  it("reports a clear result without implying an authorization", () => {
    const presentation = seriesOverviewPresentation(
      overview({ requiresSeriesCheck: false, hasAnyRestriction: false }),
    );
    expect(presentation.tone).toBe("clear");
    expect(presentation.label).toBe(
      "Заборонних документів за номером не знайдено",
    );
    expect(presentation.detail).not.toContain("дозвол");
  });
});

describe("normalizeSeriesQuery", () => {
  it("trims whitespace and strips embedded newlines", () => {
    expect(normalizeSeriesQuery("  AB-12\n34 \r\n")).toBe("AB-12 34");
  });

  it("caps length at the server contract", () => {
    const long = "A".repeat(SERIES_INPUT_MAX_LENGTH + 20);
    expect(normalizeSeriesQuery(long)).toHaveLength(SERIES_INPUT_MAX_LENGTH);
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(normalizeSeriesQuery("   ")).toBe("");
  });
});

describe("seriesCheckStatusLabel", () => {
  it("labels every status distinctly and never implies safety on a miss", () => {
    expect(seriesCheckStatusLabel("blocked")).toBe("Заборонено");
    expect(seriesCheckStatusLabel("restored")).toContain("Поновлено");
    expect(seriesCheckStatusLabel("needs_review")).toContain("ручна");
    expect(seriesCheckStatusLabel("no_match")).not.toMatch(
      /дозвол|безпечн|можна/i,
    );
  });
});
