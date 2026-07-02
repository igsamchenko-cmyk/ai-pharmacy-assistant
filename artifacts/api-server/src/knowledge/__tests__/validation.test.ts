import { describe, it, expect } from "vitest";
import { validateKnowledge, runQualityChecks } from "../validation";
import type { DictionaryEntry } from "../dictionary";
import type { InteractionRule } from "../../data/interactions";
import type { DrugRecord } from "../../data/drugs";

function entry(overrides: Partial<DictionaryEntry> = {}): DictionaryEntry {
  return {
    name: "Аспірин",
    kind: "brand",
    ingredient: {
      inn: "Ацетилсаліцилова кислота",
      latin: "Acidum acetylsalicylicum",
      english: "Acetylsalicylic acid",
      atc: "N02BA01",
      group: "НПЗЗ",
    },
    provenance: { sourceKey: "demo-catalog", evidenceLevel: "demo" },
    ...overrides,
  };
}

function rule(overrides: Partial<InteractionRule> = {}): InteractionRule {
  return {
    a: "варфарин",
    b: "ібупрофен",
    riskLevel: "critical",
    explanation: "x",
    whatToCheck: "y",
    whenToSeeDoctor: "z",
    origin: "curated",
    sourceKey: "pharmacology-reference",
    evidence: "established",
    ...overrides,
  };
}

function drug(overrides: Partial<DrugRecord> = {}): DrugRecord {
  return {
    id: "aspirin-100",
    brandName: "Аспірин",
    inn: "Ацетилсаліцилова кислота",
    atcCode: "N02BA01",
    form: "Таблетки",
    dosage: "100 мг",
    pharmacologicalGroup: "НПЗЗ",
    indications: "-",
    contraindications: "-",
    sideEffects: "-",
    warnings: "-",
    storage: "-",
    source: "demo",
    ...overrides,
  };
}

describe("validateKnowledge (live data)", () => {
  it("passes with no errors on the shipped knowledge base", () => {
    const report = validateKnowledge();
    expect(report.ok).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  it("reports 100% provenance coverage for mappings and rules", () => {
    const report = validateKnowledge();
    expect(report.coverage.mappingProvenancePct).toBe(100);
    expect(report.coverage.ruleSourcePct).toBe(100);
  });

  it("counts curated and generated rules separately", () => {
    const report = validateKnowledge();
    expect(report.counts.curatedRules).toBeGreaterThan(0);
    expect(report.counts.generatedRules).toBeGreaterThan(0);
    expect(report.counts.curatedRules + report.counts.generatedRules).toBe(
      report.counts.interactionRules,
    );
  });
});

describe("runQualityChecks (crafted data)", () => {
  const base = {
    entries: [entry()],
    rules: [rule()],
    catalog: [drug()],
  };

  it("is ok for clean crafted data", () => {
    expect(runQualityChecks(base).ok).toBe(true);
  });

  it("flags a mapping with an unknown source", () => {
    const report = runQualityChecks({
      ...base,
      entries: [
        entry({ provenance: { sourceKey: "made-up", evidenceLevel: "demo" } }),
      ],
    });
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.code === "mapping.unknown_source")).toBe(
      true,
    );
  });

  it("flags a duplicate name pointing at different ingredients", () => {
    const other = entry({
      ingredient: { ...entry().ingredient, inn: "Парацетамол" },
    });
    const report = runQualityChecks({ ...base, entries: [entry(), other] });
    expect(
      report.errors.some((e) => e.code === "mapping.duplicate_conflict"),
    ).toBe(true);
  });

  it("flags a self-pair interaction rule", () => {
    const report = runQualityChecks({
      ...base,
      rules: [rule({ a: "варфарин", b: "варфарин" })],
    });
    expect(report.errors.some((e) => e.code === "rule.self_pair")).toBe(true);
  });

  it("flags an invalid risk level", () => {
    const report = runQualityChecks({
      ...base,
      // deliberately invalid to exercise the check
      rules: [rule({ riskLevel: "extreme" as InteractionRule["riskLevel"] })],
    });
    expect(report.errors.some((e) => e.code === "rule.invalid_risk")).toBe(true);
  });

  it("warns about a rule missing its source", () => {
    const report = runQualityChecks({
      ...base,
      rules: [rule({ sourceKey: undefined })],
    });
    expect(report.warnings.some((w) => w.code === "rule.missing_source")).toBe(
      true,
    );
  });

  it("flags a duplicate drug id", () => {
    const report = runQualityChecks({
      ...base,
      catalog: [drug(), drug()],
    });
    expect(report.errors.some((e) => e.code === "drug.duplicate_id")).toBe(true);
  });
});
