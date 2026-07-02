import { describe, it, expect } from "vitest";
import { compareDrugs } from "../compare";
import { GLOBAL_DISCLAIMER } from "../../services/safety";

describe("compareDrugs", () => {
  it("returns one compared entry per resolved drug", () => {
    const result = compareDrugs(["warfarin-5", "ibuprofen-200"]);
    expect(result.drugs).toHaveLength(2);
    expect(result.drugs.map((d) => d.drug.id)).toEqual([
      "warfarin-5",
      "ibuprofen-200",
    ]);
  });

  it("enriches each drug with ATC classification", () => {
    const result = compareDrugs(["paracetamol-500"]);
    const entry = result.drugs[0];
    expect(entry.drug.atcCode).toBeTruthy();
    expect(entry.atc?.anatomicalGroup).toBeTruthy();
  });

  it("builds aligned attribute rows across all drugs", () => {
    const result = compareDrugs(["warfarin-5", "ibuprofen-200"]);
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(row.values).toHaveLength(2);
    }
    const innRow = result.rows.find((r) => r.label.includes("INN"));
    expect(innRow).toBeDefined();
  });

  it("includes a pairwise interaction check", () => {
    const result = compareDrugs(["warfarin-5", "ibuprofen-200"]);
    const critical = result.interactions.pairs.filter(
      (p) => p.riskLevel === "critical",
    );
    expect(critical.length).toBeGreaterThanOrEqual(1);
  });

  it("finds no interactions for a safe pair", () => {
    const result = compareDrugs(["loratadine-10", "ascorbic-acid"]);
    expect(result.interactions.pairs).toHaveLength(0);
  });

  it("always attaches the global safety disclaimer", () => {
    const result = compareDrugs(["paracetamol-500"]);
    expect(result.disclaimer).toBe(GLOBAL_DISCLAIMER);
  });

  it("ignores unknown drug ids", () => {
    const result = compareDrugs(["warfarin-5", "does-not-exist"]);
    expect(result.drugs).toHaveLength(1);
  });
});
