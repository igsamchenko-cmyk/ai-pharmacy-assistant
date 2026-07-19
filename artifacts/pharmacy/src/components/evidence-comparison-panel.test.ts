import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  EvidenceComparisonPanel,
  EvidenceComparisonUnavailable,
  EVIDENCE_COMPARISON_DISCLAIMER,
} from "./evidence-comparison-panel";
import { CLINICAL_EVIDENCE_COMPARISONS } from "@/lib/evidence-comparisons";

function expectedWithoutRankingLanguage(value: string): string {
  return value
    .replace("назвати один кращим за інший", "стверджувати про перевагу одного над іншим")
    .replace("визначити кращий препарат", "визначити перевагу одного препарату");
}

describe("evidence comparison mobile panel", () => {
  it.each(CLINICAL_EVIDENCE_COMPARISONS)(
    "renders the scannable evidence hierarchy for $id",
    (comparison) => {
      const html = renderToStaticMarkup(
        createElement(EvidenceComparisonPanel, { comparison }),
      );

      expect(html).toContain(comparison.indication);
      expect(html).toContain(comparison.alternatives);
      expect(html).toContain(comparison.comparisonType);
      expect(html).toContain(comparison.confidenceRationale);
      expect(html).toContain(
        expectedWithoutRankingLanguage(comparison.neutralConclusion),
      );
      expect(html).toContain(
        expectedWithoutRankingLanguage(comparison.insufficientData),
      );
      expect(
        comparison.neutralConclusion.trim().split(/\s+/u).length,
      ).toBeLessThanOrEqual(35);
      expect(html).toContain("Що відомо");
      expect(html).toContain("Ефективність");
      expect(html).toContain("Безпека");
      expect(html).toContain("Якість доказів");
      expect(html).toContain("Джерела та методологія");
      expect(html).toContain("Дата перегляду доказів");
      expect(html).toContain(EVIDENCE_COMPARISON_DISCLAIMER);
      expect(html).toContain('data-testid="confidence-badge"');
      expect(html).toContain('data-testid="directness-badge"');
      expect(html).toContain('data-testid="evidence-insufficient-data"');
      expect(html).toContain("Низька");
      expect(html).toContain("Помірна");
      expect(html).toContain("Висока");
      expect(html).toContain("<details");
      expect(html).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/u);
      expect(html).toContain("motion-reduce:transition-none");
      expect(html).toContain("overflow-x-hidden");
      expect(html).not.toContain("overflow-x-auto");
      expect(html).not.toMatch(/(?<!\p{L})(?:кращий|кращим|кращого|кращому|краща|краще|кращі|гірший|гіршим|гіршого|гіршому|гірша|гірше|гірші)(?!\p{L})/iu);

      const hierarchy = [
        'data-testid="evidence-what-is-known"',
        'data-testid="evidence-effectiveness"',
        'data-testid="evidence-safety"',
        'data-testid="evidence-quality"',
        'data-testid="evidence-insufficient-data"',
        'data-testid="evidence-sources-methodology"',
      ].map((marker) => html.indexOf(marker));
      expect(hierarchy.every((index) => index >= 0)).toBe(true);
      expect(hierarchy).toEqual([...hierarchy].sort((left, right) => left - right));

      for (const source of comparison.sources) {
        expect(html).toContain(`href="${source.url}"`);
      }
    },
  );

  it.each([
    ["apixaban-rivaroxaban-af", "Прямі + непрямі дані"],
    ["enalapril-lisinopril-hypertension", "Пряме порівняння"],
    ["ibuprofen-naproxen-acute-pain", "Прямі + непрямі дані"],
  ])("shows calibrated directness for %s", (id, expectedLabel) => {
    const comparison = CLINICAL_EVIDENCE_COMPARISONS.find(
      (item) => item.id === id,
    );
    expect(comparison).toBeDefined();

    const html = renderToStaticMarkup(
      createElement(EvidenceComparisonPanel, { comparison: comparison! }),
    );

    expect(html).toContain(expectedLabel);
  });

  it("does not create a clinical conclusion for unsupported pairs", () => {
    const html = renderToStaticMarkup(
      createElement(EvidenceComparisonUnavailable),
    );
    expect(html).toContain("лише для трьох клінічних пар MVP");
    expect(html).toContain("клінічний висновок не формується");
  });
});
