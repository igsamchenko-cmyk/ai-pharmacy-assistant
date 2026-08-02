import { describe, expect, it } from "vitest";
import {
  getInstructionForProduct,
  loadInstructionSources,
} from "../instructions/catalog";
import { buildAdministrationFactsCoverageReport } from "../instructions/factsCoverage";
import type {
  AdministrationFacts,
  InstructionQuote,
  InstructionSections,
} from "../instructions/model";
import {
  extractAdministrationFacts,
  instructionQuoteMatchesSource,
} from "../instructions/parser";

function sections(
  administration: string,
  interactions: string,
  storage: string | null = null,
): InstructionSections {
  return {
    indications: null,
    contraindications: null,
    adverseReactions: null,
    interactions,
    specialWarnings: null,
    pregnancyAndLactation: null,
    administration,
    overdose: null,
    storage,
  };
}

function quotes(facts: AdministrationFacts): InstructionQuote[] {
  return [
    facts.reconstitution,
    ...facts.diluents,
    ...facts.incompatibilities,
    facts.infusionRate,
    facts.stabilityAfterPrep,
    facts.renalAdjustment,
    facts.hepaticAdjustment,
    facts.maxDailyDose,
  ].filter((quote): quote is InstructionQuote => quote !== null);
}

describe("deterministic hospital administration facts", () => {
  it("extracts literal paragraphs and preserves exact section offsets", () => {
    const sourceSections = sections(
      [
        "Розчин для інфузії слід готувати шляхом розчинення вмісту флакона у 100 мл 0,9 % розчину натрію хлориду.",
        "Препарат вводять шляхом внутрішньовенної інфузії протягом щонайменше 30 хвилин.",
        "Хімічна і фізична стабільність приготованого розчину зберігається протягом 6 годин при 25 °C.",
        "Дозу слід коригувати, якщо кліренс креатиніну менше 30 мл/хв.",
        "Для пацієнтів з порушенням функції печінки коригування дози не потрібне.",
        "Максимальна добова доза становить 4 г.",
      ].join("\n\n"),
      "Не змішувати з кальційвмісними розчинами в одній інфузійній системі. Розчин Рінгера не слід використовувати для відновлення.",
    );

    const facts = extractAdministrationFacts(sourceSections);

    expect(facts.reconstitution?.text).toContain("шляхом розчинення");
    expect(facts.diluents).toHaveLength(1);
    expect(facts.diluents[0]?.text).toContain("0,9 % розчину натрію хлориду");
    expect(facts.diluents.some((quote) => quote.text.includes("Рінгера"))).toBe(
      false,
    );
    expect(facts.incompatibilities[0]?.text).toContain("Не змішувати");
    expect(facts.infusionRate?.text).toContain("30 хвилин");
    expect(facts.stabilityAfterPrep?.text).toContain("6 годин");
    expect(facts.renalAdjustment?.text).toContain("кліренс креатиніну");
    expect(facts.hepaticAdjustment?.text).toContain("функції печінки");
    expect(facts.maxDailyDose?.text).toContain("Максимальна добова доза");
    expect(
      quotes(facts).every((quote) =>
        instructionQuoteMatchesSource(quote, sourceSections),
      ),
    ).toBe(true);
  });

  it("leaves fields empty when the instruction has no direct statement", () => {
    const facts = extractAdministrationFacts(
      sections(
        "Препарат застосовують за призначенням лікаря.",
        "Дані відсутні.",
      ),
    );

    expect(facts).toEqual({
      reconstitution: null,
      diluents: [],
      incompatibilities: [],
      infusionRate: null,
      stabilityAfterPrep: null,
      renalAdjustment: null,
      hepaticAdjustment: null,
      maxDailyDose: null,
    });
  });

  it("enriches committed snapshots without rewriting source documents", () => {
    const sources = loadInstructionSources();
    const ceftriaxone = sources.products.find(
      (product) => product.registrationNumber === "UA/13141/01/01",
    );
    const meropenem = sources.products.find(
      (product) => product.tradeName === "АРІС",
    );
    expect(ceftriaxone).toBeDefined();
    expect(meropenem).toBeDefined();

    const ceftriaxoneSnapshot = getInstructionForProduct(
      ceftriaxone?.registryProductId ?? "",
    );
    const meropenemSnapshot = getInstructionForProduct(
      meropenem?.registryProductId ?? "",
    );
    expect(
      ceftriaxoneSnapshot?.administrationFacts?.incompatibilities.some(
        (quote) =>
          quote.text.includes("кальцій") && quote.text.includes("преципітат"),
      ),
    ).toBe(true);
    expect(
      ceftriaxoneSnapshot?.administrationFacts?.diluents.some((quote) =>
        quote.text.includes("Рінгера"),
      ),
    ).toBe(false);
    expect(
      meropenemSnapshot?.administrationFacts?.reconstitution?.text,
    ).toContain("воді для ін’єкцій");
    expect(
      meropenemSnapshot?.administrationFacts?.diluents.length,
    ).toBeGreaterThan(0);
    expect(meropenemSnapshot?.administrationFacts?.infusionRate?.text).toMatch(
      /(?:хвилин|хв)/u,
    );

    for (const snapshot of [ceftriaxoneSnapshot, meropenemSnapshot]) {
      expect(snapshot).not.toBeNull();
      expect(
        quotes(
          snapshot?.administrationFacts ??
            extractAdministrationFacts(snapshot?.sections ?? sections("", "")),
        ).every((quote) =>
          instructionQuoteMatchesSource(
            quote,
            snapshot?.sections ?? sections("", ""),
          ),
        ),
      ).toBe(true);
    }
  });

  it("reports parser coverage and proves every emitted quote against its section", () => {
    const snapshots = loadInstructionSources().products.flatMap((product) => {
      const snapshot = getInstructionForProduct(product.registryProductId);
      return snapshot ? [snapshot] : [];
    });
    const report = buildAdministrationFactsCoverageReport(snapshots);

    expect(report.counts.structuredSnapshots).toBe(50);
    expect(report.counts.snapshotsWithAnyFact).toBeGreaterThan(0);
    expect(report.counts.parenteralSnapshots).toBeGreaterThan(0);
    expect(report.counts.parenteralSnapshotsWithAnyFact).toBeGreaterThan(0);
    expect(report.counts.quotes).toBeGreaterThan(0);
    expect(report.counts.exactQuotes).toBe(report.counts.quotes);
    expect(report.coverage.exactQuotePct).toBe(100);
    expect(report.coverage.parenteralAnyFactPct).toBeGreaterThan(0);
    expect(report.coverage.byField.incompatibilities.count).toBeGreaterThan(0);
    expect(report.coverage.byField.renalAdjustment.count).toBeGreaterThan(0);
  });
});
