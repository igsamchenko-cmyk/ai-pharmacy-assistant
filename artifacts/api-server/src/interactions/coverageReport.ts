import type { InteractionRule, RiskLevel } from "../data/interactions";
import type { IngredientSeed } from "../knowledge/dictionary/ingredients";
import {
  normalizeIngredient,
  normalizedInteractionPairKey,
  type VerifiedInteractionRule,
} from "./model";
import { evaluateInteractionRuleEligibility } from "./policy";

export type InteractionCoverageStatus =
  | "verified"
  | "needs_review"
  | "unsupported";

export type InteractionCoverageReason =
  | "approved_exact_pair"
  | "legacy_exact_pair_pending_review"
  | "no_exact_pair_evidence"
  | "ingredient_not_in_catalog"
  | "same_ingredient";

export interface InteractionCatalogSnapshot {
  sourceSha256: string;
  registryRows: number;
  uniqueNormalizedInnExpressions: number;
}

export interface InteractionCoverageInput {
  ingredientSeeds: readonly IngredientSeed[];
  verifiedRules: readonly VerifiedInteractionRule[];
  legacyRules: readonly InteractionRule[];
  catalogSnapshot: InteractionCatalogSnapshot;
  observedRegistryRowsByInn?: ReadonlyMap<string, number>;
}

export interface InteractionPairCoverage {
  ingredientA: string | null;
  ingredientB: string | null;
  pairKey: string | null;
  status: InteractionCoverageStatus;
  reason: InteractionCoverageReason;
}

export interface InteractionPriorityCandidate {
  rank: number;
  ingredientA: string;
  ingredientB: string;
  pairKey: string;
  status: "needs_review";
  highestLegacyRisk: RiskLevel;
  legacyRuleCount: number;
  observedRegistryRowsA: number | null;
  observedRegistryRowsB: number | null;
  observedRegistryRowsTotal: number | null;
  priorityScore: number;
  reason: "legacy_exact_pair_requires_official_source_review";
}

export interface InteractionIngredientCoverage {
  canonicalInn: string;
  therapeuticClasses: string[];
  potentialPartnerCount: number;
  verifiedPairCount: number;
  needsReviewPairCount: number;
  unsupportedPairCount: number;
}

export interface InteractionEvidenceCoverageReport {
  schemaVersion: "interaction-evidence-coverage-v1";
  catalog: InteractionCatalogSnapshot & {
    canonicalInnCount: number;
    therapeuticClassCount: number;
  };
  counts: {
    potentialExactPairs: number;
    verifiedPairs: number;
    needsReviewPairs: number;
    unsupportedPairs: number;
    legacyRules: number;
    resolvedLegacyRules: number;
    unresolvedLegacyRules: number;
    resolvedLegacyPairCount: number;
    observedFrequencyInnCount: number;
  };
  statusDefinitions: Record<
    InteractionCoverageStatus,
    {
      meaning: string;
      clinicalConclusionAllowed: boolean;
    }
  >;
  priorityPolicy: {
    limit: 25;
    riskWeights: Record<RiskLevel, number>;
    frequencyTieBreak: "observed official registry target rows when present; unknown is not zero";
    noAutomaticApproval: true;
  };
  ingredientCoverage: InteractionIngredientCoverage[];
  priorityQueue: InteractionPriorityCandidate[];
}

interface CanonicalIngredient {
  canonicalInn: string;
  therapeuticClasses: Set<string>;
}

interface LegacyPairAggregate {
  ingredientA: string;
  ingredientB: string;
  pairKey: string;
  rules: InteractionRule[];
}

interface CoverageIndex {
  aliases: Map<string, Set<string>>;
  ingredients: Map<string, CanonicalIngredient>;
  verifiedPairKeys: Set<string>;
  legacyPairs: Map<string, LegacyPairAggregate>;
  resolvedLegacyRules: number;
  unresolvedLegacyRules: InteractionRule[];
}

const RISK_WEIGHTS: Record<RiskLevel, number> = {
  critical: 4_000_000,
  high: 3_000_000,
  medium: 2_000_000,
  low: 1_000_000,
};

function addAlias(
  aliases: Map<string, Set<string>>,
  alias: string,
  canonicalInn: string,
): void {
  const key = normalizeIngredient(alias);
  if (!key) return;
  const values = aliases.get(key) ?? new Set<string>();
  values.add(canonicalInn);
  aliases.set(key, values);
}

function buildCanonicalIndex(
  seeds: readonly IngredientSeed[],
): Pick<CoverageIndex, "aliases" | "ingredients"> {
  const aliases = new Map<string, Set<string>>();
  const ingredients = new Map<string, CanonicalIngredient>();

  for (const seed of seeds) {
    const canonicalKey = normalizeIngredient(seed.english);
    const current = ingredients.get(canonicalKey) ?? {
      canonicalInn: seed.english.trim(),
      therapeuticClasses: new Set<string>(),
    };
    if (seed.group.trim()) current.therapeuticClasses.add(seed.group.trim());
    ingredients.set(canonicalKey, current);

    for (const alias of [
      seed.inn,
      seed.latin,
      seed.english,
      ...(seed.synonyms ?? []),
    ]) {
      addAlias(aliases, alias, current.canonicalInn);
    }
  }

  return { aliases, ingredients };
}

function resolveCanonicalInn(
  aliases: ReadonlyMap<string, Set<string>>,
  value: string,
): string | null {
  const matches = aliases.get(normalizeIngredient(value));
  return matches?.size === 1 ? ([...matches][0] ?? null) : null;
}

function canonicalPair(
  aliases: ReadonlyMap<string, Set<string>>,
  a: string,
  b: string,
): {
  ingredientA: string;
  ingredientB: string;
  pairKey: string;
} | null {
  const ingredientA = resolveCanonicalInn(aliases, a);
  const ingredientB = resolveCanonicalInn(aliases, b);
  if (!ingredientA || !ingredientB || ingredientA === ingredientB) return null;
  const [first, second] = [ingredientA, ingredientB].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
  return {
    ingredientA: first,
    ingredientB: second,
    pairKey: normalizedInteractionPairKey(first, second),
  };
}

function buildCoverageIndex(input: InteractionCoverageInput): CoverageIndex {
  const { aliases, ingredients } = buildCanonicalIndex(input.ingredientSeeds);
  const verifiedPairKeys = new Set<string>();

  for (const rule of input.verifiedRules) {
    if (!evaluateInteractionRuleEligibility(rule).eligible) continue;
    const pair = canonicalPair(aliases, rule.ingredientA, rule.ingredientB);
    if (pair) verifiedPairKeys.add(pair.pairKey);
  }

  const legacyPairs = new Map<string, LegacyPairAggregate>();
  let resolvedLegacyRules = 0;
  const unresolvedLegacyRules: InteractionRule[] = [];

  for (const rule of input.legacyRules) {
    const pair = canonicalPair(aliases, rule.a, rule.b);
    if (!pair) {
      unresolvedLegacyRules.push(rule);
      continue;
    }
    resolvedLegacyRules += 1;
    const current = legacyPairs.get(pair.pairKey) ?? {
      ...pair,
      rules: [],
    };
    current.rules.push(rule);
    legacyPairs.set(pair.pairKey, current);
  }

  return {
    aliases,
    ingredients,
    verifiedPairKeys,
    legacyPairs,
    resolvedLegacyRules,
    unresolvedLegacyRules,
  };
}

function highestRisk(rules: readonly InteractionRule[]): RiskLevel {
  return (
    [...rules].sort(
      (a, b) => RISK_WEIGHTS[b.riskLevel] - RISK_WEIGHTS[a.riskLevel],
    )[0]?.riskLevel ?? "low"
  );
}

function observedRows(
  values: ReadonlyMap<string, number> | undefined,
  ingredient: string,
): number | null {
  const value = values?.get(ingredient);
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function priorityQueue(
  index: CoverageIndex,
  observedRegistryRowsByInn: ReadonlyMap<string, number> | undefined,
): InteractionPriorityCandidate[] {
  const candidates = [...index.legacyPairs.values()]
    .filter((pair) => !index.verifiedPairKeys.has(pair.pairKey))
    .map((pair) => {
      const highestLegacyRisk = highestRisk(pair.rules);
      const observedRegistryRowsA = observedRows(
        observedRegistryRowsByInn,
        pair.ingredientA,
      );
      const observedRegistryRowsB = observedRows(
        observedRegistryRowsByInn,
        pair.ingredientB,
      );
      const hasFrequency =
        observedRegistryRowsA !== null || observedRegistryRowsB !== null;
      const observedRegistryRowsTotal = hasFrequency
        ? (observedRegistryRowsA ?? 0) + (observedRegistryRowsB ?? 0)
        : null;
      return {
        rank: 0,
        ingredientA: pair.ingredientA,
        ingredientB: pair.ingredientB,
        pairKey: pair.pairKey,
        status: "needs_review" as const,
        highestLegacyRisk,
        legacyRuleCount: pair.rules.length,
        observedRegistryRowsA,
        observedRegistryRowsB,
        observedRegistryRowsTotal,
        priorityScore:
          RISK_WEIGHTS[highestLegacyRisk] +
          Math.min(observedRegistryRowsTotal ?? 0, 999_999),
        reason: "legacy_exact_pair_requires_official_source_review" as const,
      };
    })
    .sort(
      (a, b) =>
        b.priorityScore - a.priorityScore ||
        a.pairKey.localeCompare(b.pairKey, "en"),
    )
    .slice(0, 25);

  return candidates.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
  }));
}

function ingredientCoverage(
  index: CoverageIndex,
): InteractionIngredientCoverage[] {
  const ingredients = [...index.ingredients.values()].sort((a, b) =>
    a.canonicalInn.localeCompare(b.canonicalInn, "en"),
  );
  const counters = new Map(
    ingredients.map((ingredient) => [
      ingredient.canonicalInn,
      { verified: 0, needsReview: 0, unsupported: 0 },
    ]),
  );

  for (let left = 0; left < ingredients.length; left += 1) {
    for (let right = left + 1; right < ingredients.length; right += 1) {
      const ingredientA = ingredients[left]!.canonicalInn;
      const ingredientB = ingredients[right]!.canonicalInn;
      const pairKey = normalizedInteractionPairKey(ingredientA, ingredientB);
      const status = index.verifiedPairKeys.has(pairKey)
        ? "verified"
        : index.legacyPairs.has(pairKey)
          ? "needsReview"
          : "unsupported";
      counters.get(ingredientA)![status] += 1;
      counters.get(ingredientB)![status] += 1;
    }
  }

  return ingredients.map((ingredient) => {
    const counts = counters.get(ingredient.canonicalInn)!;
    return {
      canonicalInn: ingredient.canonicalInn,
      therapeuticClasses: [...ingredient.therapeuticClasses].sort((a, b) =>
        a.localeCompare(b, "uk"),
      ),
      potentialPartnerCount: ingredients.length - 1,
      verifiedPairCount: counts.verified,
      needsReviewPairCount: counts.needsReview,
      unsupportedPairCount: counts.unsupported,
    };
  });
}

export function createInteractionCoverageResolver(
  input: InteractionCoverageInput,
): {
  resolvePair: (
    ingredientA: string,
    ingredientB: string,
  ) => InteractionPairCoverage;
} {
  const index = buildCoverageIndex(input);
  return {
    resolvePair(ingredientA: string, ingredientB: string) {
      const canonicalA = resolveCanonicalInn(index.aliases, ingredientA);
      const canonicalB = resolveCanonicalInn(index.aliases, ingredientB);
      if (!canonicalA || !canonicalB) {
        return {
          ingredientA: canonicalA,
          ingredientB: canonicalB,
          pairKey: null,
          status: "unsupported",
          reason: "ingredient_not_in_catalog",
        };
      }
      if (canonicalA === canonicalB) {
        return {
          ingredientA: canonicalA,
          ingredientB: canonicalB,
          pairKey: null,
          status: "unsupported",
          reason: "same_ingredient",
        };
      }
      const pairKey = normalizedInteractionPairKey(canonicalA, canonicalB);
      if (index.verifiedPairKeys.has(pairKey)) {
        return {
          ingredientA: canonicalA,
          ingredientB: canonicalB,
          pairKey,
          status: "verified",
          reason: "approved_exact_pair",
        };
      }
      if (index.legacyPairs.has(pairKey)) {
        return {
          ingredientA: canonicalA,
          ingredientB: canonicalB,
          pairKey,
          status: "needs_review",
          reason: "legacy_exact_pair_pending_review",
        };
      }
      return {
        ingredientA: canonicalA,
        ingredientB: canonicalB,
        pairKey,
        status: "unsupported",
        reason: "no_exact_pair_evidence",
      };
    },
  };
}

export function buildInteractionEvidenceCoverageReport(
  input: InteractionCoverageInput,
): InteractionEvidenceCoverageReport {
  const index = buildCoverageIndex(input);
  const canonicalInnCount = index.ingredients.size;
  const potentialExactPairs = (canonicalInnCount * (canonicalInnCount - 1)) / 2;
  const verifiedPairs = index.verifiedPairKeys.size;
  const needsReviewPairs = [...index.legacyPairs.keys()].filter(
    (pairKey) => !index.verifiedPairKeys.has(pairKey),
  ).length;
  const unsupportedPairs =
    potentialExactPairs - verifiedPairs - needsReviewPairs;
  const therapeuticClasses = new Set(
    [...index.ingredients.values()].flatMap((ingredient) => [
      ...ingredient.therapeuticClasses,
    ]),
  );

  if (unsupportedPairs < 0) {
    throw new Error("Interaction coverage counts are inconsistent.");
  }

  return {
    schemaVersion: "interaction-evidence-coverage-v1",
    catalog: {
      ...input.catalogSnapshot,
      canonicalInnCount,
      therapeuticClassCount: therapeuticClasses.size,
    },
    counts: {
      potentialExactPairs,
      verifiedPairs,
      needsReviewPairs,
      unsupportedPairs,
      legacyRules: input.legacyRules.length,
      resolvedLegacyRules: index.resolvedLegacyRules,
      unresolvedLegacyRules: index.unresolvedLegacyRules.length,
      resolvedLegacyPairCount: index.legacyPairs.size,
      observedFrequencyInnCount: input.observedRegistryRowsByInn?.size ?? 0,
    },
    statusDefinitions: {
      verified: {
        meaning:
          "Exact canonical INN pair has a runtime-eligible reviewed rule with allowed provenance.",
        clinicalConclusionAllowed: true,
      },
      needs_review: {
        meaning:
          "Exact canonical INN pair exists only in the legacy candidate set and requires official-source review.",
        clinicalConclusionAllowed: false,
      },
      unsupported: {
        meaning:
          "No exact reviewed rule exists; this does not mean that an interaction is absent.",
        clinicalConclusionAllowed: false,
      },
    },
    priorityPolicy: {
      limit: 25,
      riskWeights: RISK_WEIGHTS,
      frequencyTieBreak:
        "observed official registry target rows when present; unknown is not zero",
      noAutomaticApproval: true,
    },
    ingredientCoverage: ingredientCoverage(index),
    priorityQueue: priorityQueue(index, input.observedRegistryRowsByInn),
  };
}

export function extractObservedRegistryRowsByInn(
  value: unknown,
  ingredientSeeds: readonly IngredientSeed[],
): Map<string, number> {
  const { aliases } = buildCanonicalIndex(ingredientSeeds);
  const output = new Map<string, number>();
  if (!value || typeof value !== "object") return output;
  const cases = (value as { cases?: unknown }).cases;
  if (!Array.isArray(cases)) return output;

  for (const item of cases) {
    if (!item || typeof item !== "object") continue;
    const record = item as {
      registryPresence?: { sampleInn?: unknown };
      provenance?: { registryTargetCount?: unknown };
    };
    const sampleInn = record.registryPresence?.sampleInn;
    const count = record.provenance?.registryTargetCount;
    if (!Array.isArray(sampleInn) || typeof count !== "number" || count < 0) {
      continue;
    }
    for (const candidate of sampleInn) {
      if (typeof candidate !== "string") continue;
      const canonicalInn = resolveCanonicalInn(aliases, candidate);
      if (!canonicalInn) continue;
      output.set(
        canonicalInn,
        Math.max(output.get(canonicalInn) ?? 0, Math.floor(count)),
      );
    }
  }

  return output;
}
