import { describe, expect, it } from "vitest";
import { getInstructionForProduct } from "../../knowledge/instructions/catalog";
import type { DrugInstructionSnapshot } from "../../knowledge/instructions/model";
import {
  buildInstructionSearchIndex,
  normalizeInstructionSearchQuery,
  searchInstructionIndex,
} from "../instructionSearchService";

const SOURCE_PRODUCT_ID = "FDF34C07D1E7F97CC2258C8400321E41";
const ADMINISTRATION =
  "Ванкоміцин слід розводити у 100 мл 0,9 % розчину натрію хлориду та вводити протягом щонайменше 60 хвилин.";
const INTERACTIONS =
  "Препарат не змішувати в одній інфузійній системі з розчинами, що містять кальцій.";

function fixture(): DrugInstructionSnapshot {
  const source = getInstructionForProduct(SOURCE_PRODUCT_ID);
  if (!source) throw new Error("instruction_fixture_missing");
  return {
    ...source,
    tradeName: "ВАНКОМІЦИН",
    inn: "Vancomycin",
    sections: {
      indications: null,
      contraindications: null,
      adverseReactions: null,
      interactions: INTERACTIONS,
      specialWarnings: null,
      pregnancyAndLactation: null,
      administration: ADMINISTRATION,
      overdose: null,
      storage: null,
    },
  };
}

describe("official instruction full-text search", () => {
  const snapshot = fixture();
  const index = buildInstructionSearchIndex(
    [snapshot],
    "2026-08-10T08:00:00.000Z",
  );

  it("finds a professional question across product metadata and literal section text", () => {
    const result = searchInstructionIndex(index, {
      q: "чим розводити ванкоміцин",
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      registryProductId: snapshot.registryProductId,
      tradeName: "ВАНКОМІЦИН",
      sectionKey: "administration",
    });
    const item = result.items[0]!;
    expect(item.quote.text).toBe(ADMINISTRATION);
    expect(
      snapshot.sections.administration?.slice(
        item.quote.charStart,
        item.quote.charEnd,
      ),
    ).toBe(item.quote.text);
    expect(item.highlights.length).toBeGreaterThan(0);
    expect(item.matchedTerms).toContain("розводити");
  });

  it("supports transliteration, wrong keyboard layout, morphology and two-character prefixes", () => {
    const transliteration = searchInstructionIndex(index, {
      q: "ne zmishuvaty kaltsii",
    });
    expect(transliteration.items[0]?.matchMode).toBe("transliteration");

    const keyboard = searchInstructionIndex(index, { q: "rfkmwsq" });
    expect(keyboard.items[0]?.matchMode).toBe("keyboard_layout");

    const morphology = searchInstructionIndex(index, {
      q: "не змішувати з кальцієм",
    });
    expect(morphology.items[0]?.sectionKey).toBe("interactions");

    const prefix = searchInstructionIndex(index, { q: "ка" });
    expect(prefix.items[0]?.quote.text).toContain("кальцій");
  });

  it("tolerates one-character spelling mistakes without changing the source quote", () => {
    const typo = searchInstructionIndex(index, { q: "калцій" });

    expect(typo.items[0]?.matchMode).toBe("approximate");
    expect(typo.items[0]?.quote.text).toBe(INTERACTIONS);
  });

  it("applies the section filter and normalizes punctuation safely", () => {
    expect(normalizeInstructionSearchQuery("  КЛІРЕНС—30  ")).toBe(
      "кліренс 30",
    );
    expect(
      searchInstructionIndex(index, {
        q: "кальцій",
        section: "administration",
      }).total,
    ).toBe(0);
    expect(
      searchInstructionIndex(index, {
        q: "кальцій",
        section: "interactions",
      }).total,
    ).toBe(1);
  });
});
