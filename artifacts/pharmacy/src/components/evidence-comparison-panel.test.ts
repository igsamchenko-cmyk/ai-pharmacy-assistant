import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ComparisonProductRef } from "@/hooks/use-product-comparison";
import {
  EVIDENCE_REGISTRY,
  resolveEvidenceComparison,
} from "@/lib/evidence-comparisons";
import {
  EvidenceComparisonExperience,
  EvidenceComparisonPanel,
  EvidenceComparisonUnavailable,
  EVIDENCE_COMPARISON_DISCLAIMER,
} from "./evidence-comparison-panel";

function product(
  productId: string,
  tradeName: string,
  inn: string,
  atcCode: string | null,
): ComparisonProductRef {
  const id = productId.padEnd(32, "A").slice(0, 32);
  const registrationNumber = "UA/10001/01/01";
  return {
    productId: id,
    registrationNumber,
    tradeName,
    inn,
    atcCode,
    activeIngredient: inn,
    strength: "10 мг",
    dosageForm: "таблетки",
    manufacturer: "Виробник",
    nationalListStatus: "exact",
    instructionAvailable: false,
    href: `/products/${id}?registration=${encodeURIComponent(registrationNumber)}`,
  };
}

const apixaban = product("A1", "ЕЛІКВІС", "апіксабан", "B01AF02");
const rivaroxaban = product("B1", "КСАРЕЛТО", "ривароксабан", "B01AF01");

describe("evidence comparison mobile panel", () => {
  it.each(EVIDENCE_REGISTRY)(
    "renders scoped evidence hierarchy for $id",
    (comparison) => {
      const html = renderToStaticMarkup(
        createElement(EvidenceComparisonPanel, { comparison }),
      );

      expect(html).toContain(comparison.indication.label);
      expect(html).toContain(comparison.indication.description);
      expect(html).toContain(comparison.indication.population);
      for (const outcome of comparison.indication.outcomes)
        expect(html).toContain(outcome.label);
      expect(html).toContain(comparison.alternatives);
      expect(html).toContain(comparison.comparisonType);
      expect(html).toContain(comparison.confidenceRationale);
      expect(html).toContain("Що відомо");
      expect(html).toContain("Ефективність");
      expect(html).toContain("Безпека");
      expect(html).toContain("Якість доказів");
      expect(html).toContain("Джерела та методологія");
      expect(html).toContain(EVIDENCE_COMPARISON_DISCLAIMER);
      expect(html).toContain('data-testid="confidence-badge"');
      expect(html).toContain('data-testid="directness-badge"');
      expect(html).toContain('data-testid="evidence-insufficient-data"');
      expect(html).toContain("motion-reduce:transition-none");
      expect(html).toContain("overflow-x-hidden");
      expect(html).not.toContain("overflow-x-auto");
      expect(html).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/u);

      for (const source of comparison.sources) {
        expect(html).toContain(`href="${source.url}"`);
      }
    },
  );

  it.each([
    ["apixaban-rivaroxaban-af", "Прямі + непрямі дані"],
    ["enalapril-lisinopril-hypertension", "Пряме порівняння"],
    ["ibuprofen-naproxen-acute-pain", "Прямі + непрямі дані"],
  ])("shows structured directness for %s", (id, expectedLabel) => {
    const comparison = EVIDENCE_REGISTRY.find((item) => item.id === id)!;
    const html = renderToStaticMarkup(
      createElement(EvidenceComparisonPanel, { comparison }),
    );
    expect(html).toContain(expectedLabel);
  });

  it("requires an indication before rendering efficacy conclusions", () => {
    const resolution = resolveEvidenceComparison([apixaban, rivaroxaban]);
    const html = renderToStaticMarkup(
      createElement(EvidenceComparisonExperience, {
        resolution,
        selectedIndicationId: null,
        onSelectIndication: vi.fn(),
      }),
    );

    expect(html).toContain("Оберіть клінічне показання");
    expect(html).toContain("Спочатку виберіть показання");
    expect(html).toContain("Фібриляція передсердь");
    expect(html).not.toContain('data-testid="evidence-effectiveness"');
  });

  it("renders a verified registry record only after exact indication selection", () => {
    const selectedIndicationId = "atrial-fibrillation-stroke-prevention";
    const resolution = resolveEvidenceComparison(
      [apixaban, rivaroxaban],
      selectedIndicationId,
    );
    const html = renderToStaticMarkup(
      createElement(EvidenceComparisonExperience, {
        resolution,
        selectedIndicationId,
        onSelectIndication: vi.fn(),
      }),
    );

    expect(html).toContain("Database-driven resolver");
    expect(html).toContain("Один терапевтичний клас");
    expect(html).toContain("апіксабан");
    expect(html).toContain("ривароксабан");
    expect(html).toContain('data-testid="evidence-effectiveness"');
  });

  it("shows structured insufficient evidence without generating a conclusion", () => {
    const resolution = resolveEvidenceComparison([
      product("C1", "МЕТФОРМІН", "метформін", "A10BA02"),
      product("D1", "ОМЕПРАЗОЛ", "омепразол", "A02BC01"),
    ]);
    const html = renderToStaticMarkup(
      createElement(EvidenceComparisonUnavailable, { resolution }),
    );

    expect(html).toContain("Надійного порівняння немає");
    expect(html).toContain("verified evidence registry");
    expect(html).toContain("не генерується з інструкцій або LLM");
    expect(html).not.toContain('data-testid="evidence-effectiveness"');
  });
});
