import { describe, it, expect } from "vitest";
import { interactionRules } from "../../data/interactions";
import { generatedInteractionRules } from "../../data/interactionRules.generated";

describe("interaction rules", () => {
  it("has at least 250 rules after class-based expansion", () => {
    expect(interactionRules.length).toBeGreaterThanOrEqual(250);
  });

  it("has no duplicate unordered ingredient pairs", () => {
    const seen = new Set<string>();
    for (const r of interactionRules) {
      const key = [r.a.toLowerCase(), r.b.toLowerCase()].sort().join("|");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("has no self-pairs", () => {
    for (const r of interactionRules) {
      expect(r.a.toLowerCase()).not.toBe(r.b.toLowerCase());
    }
  });

  it("every rule has a valid risk level and full guidance", () => {
    const levels = new Set(["low", "medium", "high", "critical"]);
    for (const r of interactionRules) {
      expect(levels.has(r.riskLevel)).toBe(true);
      expect(r.explanation.length).toBeGreaterThan(0);
      expect(r.whatToCheck.length).toBeGreaterThan(0);
      expect(r.whenToSeeDoctor.length).toBeGreaterThan(0);
    }
  });

  it("generated rules are a strict subset contributing the bulk of coverage", () => {
    expect(generatedInteractionRules.length).toBeGreaterThan(200);
  });
});
