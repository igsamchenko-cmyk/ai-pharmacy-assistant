import { describe, expect, it } from "vitest";
import {
  INCOMPLETE_INTERACTION_CHECK,
  NO_VERIFIED_RULE,
  VERIFIED_INTERACTION_FOUND,
  createVerifiedInteractionEngine,
} from "../engine";
import {
  normalizedInteractionPairKey,
  type InteractionSelection,
  type VerifiedInteractionRule,
} from "../model";

function approvedRule(
  a: string,
  b: string,
  overrides: Partial<VerifiedInteractionRule> = {},
): VerifiedInteractionRule {
  return {
    id: `rule-${a}-${b}`,
    ingredientA: a,
    ingredientB: b,
    pairKey: normalizedInteractionPairKey(a, b),
    directionality: "symmetric",
    therapeuticGroupsA: [],
    therapeuticGroupsB: [],
    severity: "moderate",
    clinicalEffect: "Structured test effect.",
    mechanism: "Structured test mechanism.",
    explanation: "Structured test explanation.",
    actionCategory: "monitor",
    evidenceLevel: "reference",
    source: {
      key: "project-reviewed-interactions",
      label: "Reviewed interaction test source",
      url: "https://example.invalid/interaction-source",
      documentReference: null,
      version: "2026-01",
      publishedAt: "2026-01-01",
      accessedAt: "2026-07-13",
    },
    reviewStatus: "approved",
    reviewedAt: "2026-07-13",
    unresolvedConflict: false,
    provenance: {
      datasetVersion: "test-v1",
      importedAt: null,
      origin: "curated",
      sourceRecordId: "test-record",
    },
    populationContext: null,
    ...overrides,
  };
}

function selection(
  id: string,
  ingredients: string[],
  groups: string[] = [],
  unresolvedIngredients: string[] = [],
): InteractionSelection {
  return {
    id,
    label: id,
    ingredients: ingredients.map((canonicalName) => ({
      canonicalName,
      therapeuticGroups: groups,
    })),
    unresolvedIngredients,
  };
}

describe("verified interaction foundation engine", () => {
  it("normalizes symmetric ingredient pairs", () => {
    expect(normalizedInteractionPairKey(" Варфарин ", "ІБУПРОФЕН")).toBe(
      normalizedInteractionPairKey("ібупрофен", "варфарин"),
    );
  });

  it("expands combination ingredients across products without self-pairs", () => {
    const engine = createVerifiedInteractionEngine([
      approvedRule("alpha", "gamma"),
      approvedRule("beta", "gamma"),
      approvedRule("alpha", "beta"),
    ]);
    const result = engine.check([
      selection("combination", ["alpha", "beta"]),
      selection("single", ["gamma"]),
    ]);

    expect(result.coverage.evaluatedIngredientPairs).toBe(2);
    expect(result.findings.map((finding) => finding.rule.pairKey)).toEqual([
      "alpha|gamma",
      "beta|gamma",
    ]);
  });

  it("detects duplicate ingredients and structured therapeutic groups", () => {
    const engine = createVerifiedInteractionEngine([]);
    const result = engine.check([
      selection("first", ["alpha"], ["group-a"]),
      selection("second", ["alpha"], ["group-a"]),
    ]);

    expect(result.duplicateIngredients).toEqual([
      {
        canonicalIngredient: "alpha",
        selectionIds: ["first", "second"],
        selectionNames: ["first", "second"],
      },
    ]);
    expect(result.therapeuticDuplications[0]?.therapeuticGroup).toBe("group-a");
  });

  it("sorts findings by the bounded severity taxonomy", () => {
    const engine = createVerifiedInteractionEngine([
      approvedRule("alpha", "beta", { severity: "minor" }),
      approvedRule("alpha", "gamma", { severity: "major" }),
    ]);
    const result = engine.check([
      selection("a", ["alpha"]),
      selection("b", ["beta"]),
      selection("c", ["gamma"]),
    ]);
    expect(result.findings.map((finding) => finding.rule.severity)).toEqual([
      "major",
      "minor",
    ]);
  });

  it("uses the required no-rule wording without claiming compatibility", () => {
    const result = createVerifiedInteractionEngine([]).check([
      selection("a", ["alpha"]),
      selection("b", ["beta"]),
    ]);
    expect(result.findings).toEqual([]);
    expect(result.coverage.message).toBe(NO_VERIFIED_RULE);
    expect(result.coverage.message).toContain("не гарантує сумісність");
    expect(result.coverage.message).not.toMatch(/^(сумісні|безпечні разом)/i);
  });

  it("reports unresolved ingredients as an incomplete check", () => {
    const result = createVerifiedInteractionEngine([]).check([
      selection("a", ["alpha"], [], ["unknown-a"]),
      selection("b", ["beta"]),
    ]);
    expect(result.coverage.status).toBe("partial");
    expect(result.coverage.message).toBe(INCOMPLETE_INTERACTION_CHECK);
  });

  it("returns the verified finding wording and visible provenance", () => {
    const result = createVerifiedInteractionEngine([
      approvedRule("alpha", "beta"),
    ]).check([selection("a", ["alpha"]), selection("b", ["beta"])]);
    expect(result.findings[0]?.message).toBe(VERIFIED_INTERACTION_FOUND);
    expect(result.findings[0]?.rule.source.label).toBeTruthy();
    expect(result.findings[0]?.rule.reviewedAt).toBe("2026-07-13");
  });

  it("excludes pending, quarantined, conflicting and disallowed rules", () => {
    const rules = [
      approvedRule("a", "b", { reviewStatus: "needs_review" }),
      approvedRule("a", "c", { reviewStatus: "quarantined" }),
      approvedRule("a", "d", { unresolvedConflict: true }),
      approvedRule("a", "e", {
        source: {
          key: "untrusted",
          label: "Untrusted",
          url: "https://example.invalid",
          documentReference: null,
          version: "1",
          publishedAt: null,
          accessedAt: null,
        },
      }),
    ];
    const result = createVerifiedInteractionEngine(rules).check([
      selection("first", ["a"]),
      selection("second", ["b", "c", "d", "e"]),
    ]);
    expect(result.findings).toEqual([]);
  });

  it("fails closed when approved sources conflict for one pair", () => {
    const engine = createVerifiedInteractionEngine([
      approvedRule("alpha", "beta", { id: "rule-one", severity: "major" }),
      approvedRule("alpha", "beta", {
        id: "rule-two",
        severity: "minor",
        source: {
          key: "official-product-information",
          label: "Second approved source",
          url: "https://example.invalid/source-two",
          documentReference: null,
          version: "2",
          publishedAt: "2026-02-01",
          accessedAt: "2026-07-13",
        },
      }),
    ]);
    const result = engine.check([
      selection("a", ["alpha"]),
      selection("b", ["beta"]),
    ]);
    expect(result.findings).toEqual([]);
    expect(result.coverage.message).toBe(NO_VERIFIED_RULE);
  });
  it("supports a bounded 2 to 10 selection check", () => {
    const engine = createVerifiedInteractionEngine([]);
    expect(() => engine.check([selection("a", ["a"])])).toThrow(RangeError);
    expect(() =>
      engine.check(
        Array.from({ length: 10 }, (_, index) =>
          selection(`item-${index}`, [`ingredient-${index}`]),
        ),
      ),
    ).not.toThrow();
    expect(() =>
      engine.check(
        Array.from({ length: 11 }, (_, index) =>
          selection(`item-${index}`, [`ingredient-${index}`]),
        ),
      ),
    ).toThrow(RangeError);
  });

  it("does not leak environment values or filesystem paths", () => {
    const serialized = JSON.stringify(
      createVerifiedInteractionEngine([approvedRule("alpha", "beta")]).check([
        selection("a", ["alpha"]),
        selection("b", ["beta"]),
      ]),
    );
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toMatch(/[A-Z]:\\|\/home\//);
  });
});
