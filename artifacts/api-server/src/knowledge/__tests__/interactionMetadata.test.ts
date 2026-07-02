import { describe, it, expect } from "vitest";
import { interactionRules } from "../../data/interactions";
import { isKnownSource } from "../provenance";
import { checkInteractions } from "../../services/interactionService";

describe("interaction rule metadata (v0.3)", () => {
  it("every rule is tagged as curated or generated", () => {
    for (const r of interactionRules) {
      expect(r.origin === "curated" || r.origin === "generated").toBe(true);
    }
  });

  it("every rule carries a known provenance source", () => {
    for (const r of interactionRules) {
      expect(r.sourceKey).toBeDefined();
      expect(isKnownSource(r.sourceKey as string)).toBe(true);
    }
  });

  it("every rule carries an evidence level", () => {
    const levels = new Set(["established", "reference", "theoretical"]);
    for (const r of interactionRules) {
      expect(r.evidence).toBeDefined();
      expect(levels.has(r.evidence as string)).toBe(true);
    }
  });

  it("has both curated and generated rules", () => {
    expect(interactionRules.some((r) => r.origin === "curated")).toBe(true);
    expect(interactionRules.some((r) => r.origin === "generated")).toBe(true);
  });

  it("keeps the warfarin + ibuprofen critical constraint", () => {
    const result = checkInteractions(["warfarin-5", "ibuprofen-200"]);
    const critical = result.pairs.filter((p) => p.riskLevel === "critical");
    expect(critical.length).toBe(1);
  });

  it("keeps loratadine + ascorbic acid interaction-free", () => {
    const result = checkInteractions(["loratadine-10", "ascorbic-acid"]);
    expect(result.pairs.length).toBe(0);
  });
});
