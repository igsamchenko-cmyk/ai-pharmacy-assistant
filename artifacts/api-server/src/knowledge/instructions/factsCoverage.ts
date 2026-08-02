import type {
  AdministrationFacts,
  DrugInstructionSnapshot,
  InstructionQuote,
} from "./model";
import {
  extractAdministrationFacts,
  instructionQuoteMatchesSource,
} from "./parser";

export const ADMINISTRATION_FACT_KEYS = [
  "reconstitution",
  "diluents",
  "incompatibilities",
  "infusionRate",
  "stabilityAfterPrep",
  "renalAdjustment",
  "hepaticAdjustment",
  "maxDailyDose",
] as const;

export type AdministrationFactKey = (typeof ADMINISTRATION_FACT_KEYS)[number];

export interface AdministrationFactsCoverageReport {
  schemaVersion: "administration-facts-coverage-v1";
  counts: {
    structuredSnapshots: number;
    snapshotsWithAnyFact: number;
    parenteralSnapshots: number;
    parenteralSnapshotsWithAnyFact: number;
    quotes: number;
    exactQuotes: number;
  };
  coverage: {
    anyFactPct: number;
    parenteralAnyFactPct: number;
    exactQuotePct: number;
    byField: Record<AdministrationFactKey, { count: number; pct: number }>;
  };
}

const PARENTERAL_FORM_PATTERN =
  /(?:ін[’'ʼ ]?єкц|інфуз|ліофіліз|порошок\s+для\s+розчину)/iu;

function percentage(part: number, total: number): number {
  return total === 0 ? 100 : Math.round((part / total) * 10_000) / 100;
}

export function administrationFactQuotes(
  facts: AdministrationFacts,
): InstructionQuote[] {
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

function hasField(
  facts: AdministrationFacts,
  key: AdministrationFactKey,
): boolean {
  const value = facts[key];
  return Array.isArray(value) ? value.length > 0 : value !== null;
}

export function buildAdministrationFactsCoverageReport(
  snapshots: DrugInstructionSnapshot[],
): AdministrationFactsCoverageReport {
  const structured = snapshots.filter(
    (snapshot) =>
      snapshot.status === "available" || snapshot.status === "partial",
  );
  const fieldCounts = Object.fromEntries(
    ADMINISTRATION_FACT_KEYS.map((key) => [key, 0]),
  ) as Record<AdministrationFactKey, number>;
  let snapshotsWithAnyFact = 0;
  let parenteralSnapshots = 0;
  let parenteralSnapshotsWithAnyFact = 0;
  let quoteCount = 0;
  let exactQuoteCount = 0;

  for (const snapshot of structured) {
    const facts =
      snapshot.administrationFacts ??
      extractAdministrationFacts(snapshot.sections);
    const quotes = administrationFactQuotes(facts);
    const hasAnyFact = quotes.length > 0;
    const parenteral = PARENTERAL_FORM_PATTERN.test(snapshot.dosageForm);
    if (hasAnyFact) snapshotsWithAnyFact += 1;
    if (parenteral) parenteralSnapshots += 1;
    if (parenteral && hasAnyFact) parenteralSnapshotsWithAnyFact += 1;
    quoteCount += quotes.length;
    exactQuoteCount += quotes.filter((quote) =>
      instructionQuoteMatchesSource(quote, snapshot.sections),
    ).length;
    for (const key of ADMINISTRATION_FACT_KEYS) {
      if (hasField(facts, key)) fieldCounts[key] += 1;
    }
  }

  return {
    schemaVersion: "administration-facts-coverage-v1",
    counts: {
      structuredSnapshots: structured.length,
      snapshotsWithAnyFact,
      parenteralSnapshots,
      parenteralSnapshotsWithAnyFact,
      quotes: quoteCount,
      exactQuotes: exactQuoteCount,
    },
    coverage: {
      anyFactPct: percentage(snapshotsWithAnyFact, structured.length),
      parenteralAnyFactPct: percentage(
        parenteralSnapshotsWithAnyFact,
        parenteralSnapshots,
      ),
      exactQuotePct: percentage(exactQuoteCount, quoteCount),
      byField: Object.fromEntries(
        ADMINISTRATION_FACT_KEYS.map((key) => [
          key,
          {
            count: fieldCounts[key],
            pct: percentage(fieldCounts[key], structured.length),
          },
        ]),
      ) as Record<AdministrationFactKey, { count: number; pct: number }>,
    },
  };
}
