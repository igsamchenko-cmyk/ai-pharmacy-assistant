import { describe, it, expect } from "vitest";
import {
  checkInteractions,
  INTERACTION_DISCLAIMER,
} from "../interactionService";

describe("interactionService.checkInteractions", () => {
  it("flags a critical interaction between warfarin and ibuprofen", () => {
    const result = checkInteractions(["warfarin-5", "ibuprofen-200"]);
    expect(result.pairs.length).toBe(1);
    expect(result.pairs[0].riskLevel).toBe("critical");
    expect(result.disclaimer).toBe(INTERACTION_DISCLAIMER);
  });

  it("detects interactions regardless of order", () => {
    const a = checkInteractions(["ibuprofen-200", "warfarin-5"]);
    const b = checkInteractions(["warfarin-5", "ibuprofen-200"]);
    expect(a.pairs.length).toBe(b.pairs.length);
  });

  it("returns no pairs for unrelated drugs", () => {
    const result = checkInteractions(["loratadine-10", "ascorbic-acid"]);
    expect(result.pairs.length).toBe(0);
  });

  it("checks all combinations for multiple drugs", () => {
    const result = checkInteractions([
      "warfarin-5",
      "ibuprofen-200",
      "aspirin-500",
    ]);
    // warfarin+ibuprofen, warfarin+aspirin, aspirin+ibuprofen all interact.
    expect(result.pairs.length).toBe(3);
  });

  it("sorts pairs by descending severity", () => {
    const result = checkInteractions([
      "ibuprofen-200",
      "enalapril-10",
      "warfarin-5",
    ]);
    const order = ["critical", "high", "medium", "low"];
    const indices = result.pairs.map((p) => order.indexOf(p.riskLevel));
    const sorted = [...indices].sort((x, y) => x - y);
    expect(indices).toEqual(sorted);
  });
});
