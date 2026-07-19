import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  EvidenceComparisonPanel,
  EvidenceComparisonUnavailable,
  EVIDENCE_COMPARISON_DISCLAIMER,
} from "./evidence-comparison-panel";
import { CLINICAL_EVIDENCE_COMPARISONS } from "@/lib/evidence-comparisons";

describe("evidence comparison mobile panel", () => {
  it.each(CLINICAL_EVIDENCE_COMPARISONS)("renders every required field for $id", (comparison) => {
    const html = renderToStaticMarkup(createElement(EvidenceComparisonPanel, { comparison }));

    expect(html).toContain(comparison.indication);
    expect(html).toContain(comparison.alternatives);
    expect(html).toContain(comparison.comparisonType);
    expect(html).toContain(comparison.confidenceRationale);
    expect(html).toContain(comparison.neutralConclusion);
    expect(html).toContain(comparison.insufficientData);
    expect(html).toContain("Ключові outcomes ефективності");
    expect(html).toContain("Ключові ризики");
    expect(html).toContain("Джерела");
    expect(html).toContain("Дата перегляду доказів");
    expect(html).toContain(EVIDENCE_COMPARISON_DISCLAIMER);
    expect(html).toContain("<details");
    expect(html).toContain("overflow-x-hidden");
    expect(html).not.toContain("overflow-x-auto");
    for (const source of comparison.sources) expect(html).toContain(`href="${source.url}"`);
  });

  it("does not create a clinical conclusion for unsupported pairs", () => {
    const html = renderToStaticMarkup(createElement(EvidenceComparisonUnavailable));
    expect(html).toContain("лише для трьох клінічних пар MVP");
    expect(html).toContain("клінічний висновок не формується");
  });
});
