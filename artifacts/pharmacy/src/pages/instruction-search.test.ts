import { describe, expect, it } from "vitest";
import type { InstructionSearchResult } from "@workspace/api-client-react";
import {
  highlightedQuoteSegments,
  instructionSearchResultHref,
} from "./instruction-search";

const PRODUCT_ID = "A".repeat(32);

function result(): InstructionSearchResult {
  return {
    registryProductId: PRODUCT_ID,
    registrationNumber: "UA/1234/01/01",
    tradeName: "ТЕСТ",
    inn: "Test",
    dosageForm: "розчин для інфузій",
    strength: "10 мг/мл",
    sectionKey: "interactions",
    quote: {
      text: "Не змішувати з розчинами кальцію.",
      sectionKey: "interactions",
      charStart: 100,
      charEnd: 133,
    },
    highlights: [
      { charStart: 103, charEnd: 112 },
      { charStart: 125, charEnd: 132 },
    ],
    matchedTerms: ["змішувати", "кальцію"],
    matchMode: "all_terms",
    source: {
      url: "https://www.drlz.com.ua/",
      documentDate: "2026-08-01T00:00:00.000Z",
      checkedAt: "2026-08-10T00:00:00.000Z",
      coveragePct: 100,
    },
  };
}

describe("instruction search UI helpers", () => {
  it("builds a mobile-safe exact product-card anchor on the Instruction tab", () => {
    expect(instructionSearchResultHref(result())).toBe(
      `/products/${PRODUCT_ID}?registration=UA%2F1234%2F01%2F01&tab=instruction#instruction-quote-interactions-100-133`,
    );
  });

  it("highlights only verified ranges inside the literal quote", () => {
    const item = result();
    const segments = highlightedQuoteSegments(item.quote, item.highlights);
    expect(
      segments
        .filter((segment) => segment.highlighted)
        .map((segment) => segment.text),
    ).toEqual([item.quote.text.slice(3, 12), item.quote.text.slice(25, 32)]);
    expect(segments.map((segment) => segment.text).join("")).toBe(
      item.quote.text,
    );
  });

  it("ignores out-of-bounds highlight coordinates", () => {
    const item = result();
    expect(
      highlightedQuoteSegments(item.quote, [
        { charStart: 0, charEnd: 5 },
        { charStart: 200, charEnd: 210 },
      ]),
    ).toEqual([{ text: item.quote.text, highlighted: false }]);
  });
});
