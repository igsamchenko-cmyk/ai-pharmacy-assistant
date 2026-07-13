import {
  INTERACTION_SEVERITY_ORDER,
  normalizedInteractionPairKey,
  normalizeIngredient,
  type InteractionSelection,
  type VerifiedInteractionRule,
} from "./model";
import {
  DEFAULT_INTERACTION_SOURCE_POLICY,
  evaluateInteractionRuleEligibility,
  type InteractionSourcePolicy,
} from "./policy";

export const VERIFIED_INTERACTION_FOUND =
  "Виявлено підтверджену потенційну взаємодію.";
export const NO_VERIFIED_RULE =
  "У наявній базі не знайдено підтвердженого правила взаємодії. Це не гарантує сумісність препаратів.";
export const INCOMPLETE_INTERACTION_CHECK =
  "Перевірка неповна: одну або кілька діючих речовин не вдалося однозначно визначити.";

export interface InteractionFinding {
  selectionAId: string;
  selectionAName: string;
  selectionBId: string;
  selectionBName: string;
  ingredientA: string;
  ingredientB: string;
  message: typeof VERIFIED_INTERACTION_FOUND;
  rule: VerifiedInteractionRule;
}

export interface DuplicateIngredientFinding {
  canonicalIngredient: string;
  selectionIds: string[];
  selectionNames: string[];
}

export interface TherapeuticDuplicationFinding {
  therapeuticGroup: string;
  selectionIds: string[];
  selectionNames: string[];
}

export interface InteractionCoverage {
  selectedCount: number;
  resolvedIngredientCount: number;
  unresolvedIngredientCount: number;
  evaluatedIngredientPairs: number;
  matchedApprovedPairs: number;
  status: "complete" | "partial" | "insufficient_data";
  message: typeof NO_VERIFIED_RULE | typeof INCOMPLETE_INTERACTION_CHECK | null;
}

export interface VerifiedInteractionResult {
  findings: InteractionFinding[];
  duplicateIngredients: DuplicateIngredientFinding[];
  therapeuticDuplications: TherapeuticDuplicationFinding[];
  coverage: InteractionCoverage;
}

export interface VerifiedInteractionEngineOptions {
  sourcePolicy?: InteractionSourcePolicy;
}

export function createVerifiedInteractionEngine(
  rules: readonly VerifiedInteractionRule[],
  options: VerifiedInteractionEngineOptions = {},
) {
  const policy = options.sourcePolicy ?? DEFAULT_INTERACTION_SOURCE_POLICY;
  const ruleIndex = new Map<string, VerifiedInteractionRule>();
  const eligibleByPair = new Map<string, VerifiedInteractionRule[]>();

  for (const rule of rules) {
    if (!evaluateInteractionRuleEligibility(rule, policy).eligible) continue;
    const key = normalizedInteractionPairKey(
      rule.ingredientA,
      rule.ingredientB,
    );
    const candidates = eligibleByPair.get(key) ?? [];
    candidates.push(rule);
    eligibleByPair.set(key, candidates);
  }

  for (const [key, candidates] of eligibleByPair) {
    const materialSignatures = new Set(
      candidates.map((rule) =>
        JSON.stringify([
          rule.severity,
          rule.clinicalEffect,
          rule.mechanism,
          rule.actionCategory,
          rule.evidenceLevel,
        ]),
      ),
    );
    if (materialSignatures.size === 1) {
      ruleIndex.set(key, candidates[0]);
    }
  }

  return {
    check(
      selections: readonly InteractionSelection[],
    ): VerifiedInteractionResult {
      if (selections.length < 2 || selections.length > 10) {
        throw new RangeError("Interaction checks require 2 to 10 selections.");
      }

      const uniqueSelections = new Map(
        selections.map((selection) => [selection.id, selection]),
      );
      if (uniqueSelections.size !== selections.length) {
        throw new RangeError(
          "Duplicate selection identifiers are not allowed.",
        );
      }

      const ingredientOwners = new Map<
        string,
        { canonicalIngredient: string; ids: Set<string>; names: Set<string> }
      >();
      const groupOwners = new Map<
        string,
        { group: string; ids: Set<string>; names: Set<string> }
      >();

      for (const selection of selections) {
        for (const ingredient of selection.ingredients) {
          const ingredientKey = normalizeIngredient(ingredient.canonicalName);
          const ingredientOwner = ingredientOwners.get(ingredientKey) ?? {
            canonicalIngredient: ingredient.canonicalName,
            ids: new Set<string>(),
            names: new Set<string>(),
          };
          ingredientOwner.ids.add(selection.id);
          ingredientOwner.names.add(selection.label);
          ingredientOwners.set(ingredientKey, ingredientOwner);

          for (const group of ingredient.therapeuticGroups) {
            const groupKey = normalizeIngredient(group);
            const groupOwner = groupOwners.get(groupKey) ?? {
              group,
              ids: new Set<string>(),
              names: new Set<string>(),
            };
            groupOwner.ids.add(selection.id);
            groupOwner.names.add(selection.label);
            groupOwners.set(groupKey, groupOwner);
          }
        }
      }

      const findings: InteractionFinding[] = [];
      const findingKeys = new Set<string>();
      let evaluatedIngredientPairs = 0;

      for (let left = 0; left < selections.length; left += 1) {
        for (let right = left + 1; right < selections.length; right += 1) {
          const selectionA = selections[left];
          const selectionB = selections[right];

          for (const ingredientA of selectionA.ingredients) {
            for (const ingredientB of selectionB.ingredients) {
              const pairKey = normalizedInteractionPairKey(
                ingredientA.canonicalName,
                ingredientB.canonicalName,
              );
              if (
                normalizeIngredient(ingredientA.canonicalName) ===
                normalizeIngredient(ingredientB.canonicalName)
              ) {
                continue;
              }
              evaluatedIngredientPairs += 1;
              const rule = ruleIndex.get(pairKey);
              if (!rule) continue;
              const findingKey = [
                selectionA.id,
                selectionB.id,
                rule.pairKey,
              ].join("|");
              if (findingKeys.has(findingKey)) continue;
              findingKeys.add(findingKey);
              findings.push({
                selectionAId: selectionA.id,
                selectionAName: selectionA.label,
                selectionBId: selectionB.id,
                selectionBName: selectionB.label,
                ingredientA: ingredientA.canonicalName,
                ingredientB: ingredientB.canonicalName,
                message: VERIFIED_INTERACTION_FOUND,
                rule,
              });
            }
          }
        }
      }

      findings.sort(
        (a, b) =>
          INTERACTION_SEVERITY_ORDER[a.rule.severity] -
            INTERACTION_SEVERITY_ORDER[b.rule.severity] ||
          a.rule.pairKey.localeCompare(b.rule.pairKey, "uk"),
      );

      const duplicateIngredients = [...ingredientOwners.values()]
        .filter((owner) => owner.ids.size > 1)
        .map((owner) => ({
          canonicalIngredient: owner.canonicalIngredient,
          selectionIds: [...owner.ids].sort(),
          selectionNames: [...owner.names].sort((a, b) =>
            a.localeCompare(b, "uk"),
          ),
        }));

      const therapeuticDuplications = [...groupOwners.values()]
        .filter((owner) => owner.ids.size > 1)
        .map((owner) => ({
          therapeuticGroup: owner.group,
          selectionIds: [...owner.ids].sort(),
          selectionNames: [...owner.names].sort((a, b) =>
            a.localeCompare(b, "uk"),
          ),
        }));

      const resolvedIngredientCount = selections.reduce(
        (total, selection) => total + selection.ingredients.length,
        0,
      );
      const unresolvedIngredientCount = selections.reduce(
        (total, selection) => total + selection.unresolvedIngredients.length,
        0,
      );
      const status =
        unresolvedIngredientCount > 0
          ? "partial"
          : resolvedIngredientCount === 0
            ? "insufficient_data"
            : "complete";

      return {
        findings,
        duplicateIngredients,
        therapeuticDuplications,
        coverage: {
          selectedCount: selections.length,
          resolvedIngredientCount,
          unresolvedIngredientCount,
          evaluatedIngredientPairs,
          matchedApprovedPairs: findings.length,
          status,
          message:
            unresolvedIngredientCount > 0
              ? INCOMPLETE_INTERACTION_CHECK
              : findings.length === 0
                ? NO_VERIFIED_RULE
                : null,
        },
      };
    },
  };
}
