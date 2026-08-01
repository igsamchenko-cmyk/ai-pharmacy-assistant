import type { DrugInstructionSnapshot } from "../knowledge/instructions/model";
import { ingredientSeeds } from "../knowledge/dictionary/ingredients";
import {
  buildInteractionCandidatePipelineReport,
  type InteractionTriageSignal,
} from "../interactions/candidatePipeline";
import { buildInteractionRuleRegistry } from "../interactions/audit";
import {
  normalizeIngredient,
  type VerifiedInteractionRule,
} from "../interactions/model";
import { getOfficialInstructionForProduct } from "./officialInstructionService";
import {
  RegistryInteractionSelectionError,
  resolveExactRegistryInteractionProduct,
  resolveRegistryInteractionSelection,
  type RegistryInteractionProductRef,
  type RegistryInteractionProductResolver,
} from "./interactionService";

export const INTERACTION_INSTRUCTION_SIGNAL_DISCLAIMER =
  "Автоматично знайдені згадки в офіційних інструкціях є сигналами для професійної перевірки, а не самостійною клінічною класифікацією. Відсутність сигналу не підтверджує сумісність препаратів.";

export type InteractionInstructionSignalPairStatus =
  | "signals_found"
  | "no_signal_in_loaded_instructions"
  | "instructions_unavailable"
  | "composition_unresolved";

export interface InteractionInstructionSignalEvidence {
  registryProductId: string;
  registrationNumber: string;
  tradeName: string;
  sourceUrl: string;
  documentDate: string | null;
  excerpt: string;
}

export interface InteractionInstructionSignal {
  id: string;
  ingredientA: string;
  ingredientB: string;
  triageSignal: InteractionTriageSignal;
  reviewStatus: "needs_review" | "already_verified";
  supportingDocumentCount: number;
  supportingProductCount: number;
  evidence: InteractionInstructionSignalEvidence[];
}

export interface InteractionInstructionSignalPair {
  productAId: string;
  productAName: string;
  productBId: string;
  productBName: string;
  status: InteractionInstructionSignalPairStatus;
  signals: InteractionInstructionSignal[];
}

export interface InteractionInstructionSignalsResult {
  pairs: InteractionInstructionSignalPair[];
  coverage: {
    selectedCount: number;
    instructionAvailableCount: number;
    evaluatedIngredientPairs: number;
    signalPairCount: number;
    candidateCount: number;
  };
  disclaimer: string;
}

export type InteractionInstructionLoader = (
  registryProductId: string,
) => Promise<DrugInstructionSnapshot | null>;

export interface InteractionInstructionSignalOptions {
  resolveProduct?: RegistryInteractionProductResolver;
  loadInstruction?: InteractionInstructionLoader;
  rules?: readonly VerifiedInteractionRule[];
}

function ingredientEntityId(value: string): string {
  return `ingredient:${normalizeIngredient(value)}`;
}

function ingredientPairKey(a: string, b: string): string {
  return [ingredientEntityId(a), ingredientEntityId(b)]
    .sort((left, right) => left.localeCompare(right, "en"))
    .join("|");
}

export async function getInteractionInstructionSignals(
  references: readonly RegistryInteractionProductRef[],
  options: InteractionInstructionSignalOptions = {},
): Promise<InteractionInstructionSignalsResult> {
  const unique = new Set(references.map((item) => item.productId));
  if (unique.size !== references.length) {
    throw new RegistryInteractionSelectionError("duplicate_product");
  }

  const resolver =
    options.resolveProduct ?? resolveExactRegistryInteractionProduct;
  const catalogProducts = await Promise.all(
    references.map((reference) => resolver(reference)),
  );
  if (catalogProducts.some((product) => product === null)) {
    throw new RegistryInteractionSelectionError("product_not_found");
  }

  const resolved = catalogProducts.map((product) =>
    resolveRegistryInteractionSelection(product!),
  );
  const instructionLoader =
    options.loadInstruction ?? getOfficialInstructionForProduct;
  const loadedInstructions = await Promise.all(
    references.map(async (reference) => {
      try {
        return await instructionLoader(reference.productId);
      } catch {
        return null;
      }
    }),
  );
  const snapshots = loadedInstructions.filter(
    (snapshot): snapshot is DrugInstructionSnapshot => snapshot !== null,
  );
  const rules = options.rules ?? buildInteractionRuleRegistry();
  const report = buildInteractionCandidatePipelineReport({
    snapshots,
    ingredientSeeds,
    verifiedRules: rules,
    reviewQueueLimit: 1_000,
    evidenceLimitPerCandidate: 5,
  });
  const candidatesByPair = new Map(
    report.candidates
      .filter(
        (candidate) =>
          candidate.left.kind === "ingredient" &&
          candidate.right.kind === "ingredient",
      )
      .map((candidate) => [candidate.pairKey, candidate] as const),
  );
  const pairs: InteractionInstructionSignalPair[] = [];
  let evaluatedIngredientPairs = 0;

  for (let left = 0; left < resolved.length; left += 1) {
    for (let right = left + 1; right < resolved.length; right += 1) {
      const a = resolved[left]!;
      const b = resolved[right]!;
      const compositionUnresolved =
        a.product.unresolvedIngredients.length > 0 ||
        b.product.unresolvedIngredients.length > 0;
      const relevantCandidates = new Map<
        string,
        (typeof report.candidates)[number]
      >();

      if (!compositionUnresolved) {
        for (const ingredientA of a.product.resolvedIngredients) {
          for (const ingredientB of b.product.resolvedIngredients) {
            evaluatedIngredientPairs += 1;
            const candidate = candidatesByPair.get(
              ingredientPairKey(ingredientA, ingredientB),
            );
            if (candidate) relevantCandidates.set(candidate.id, candidate);
          }
        }
      }

      const signals = [...relevantCandidates.values()]
        .map((candidate): InteractionInstructionSignal | null => {
          const evidence = candidate.evidence
            .filter((item) => item.subjectResolution !== "partial_composition")
            .map((item) => ({
              registryProductId: item.registryProductId,
              registrationNumber: item.registrationNumber,
              tradeName: item.tradeName,
              sourceUrl: item.sourceUrl,
              documentDate: item.documentDate,
              excerpt: item.excerpt,
            }));
          if (!evidence.length) return null;
          return {
            id: candidate.id,
            ingredientA: candidate.left.canonicalName,
            ingredientB: candidate.right.canonicalName,
            triageSignal: candidate.triageSignal,
            reviewStatus: candidate.reviewStatus,
            supportingDocumentCount: candidate.supportingDocumentCount,
            supportingProductCount: candidate.supportingProductCount,
            evidence,
          };
        })
        .filter(
          (signal): signal is InteractionInstructionSignal => signal !== null,
        );
      const instructionAvailable =
        loadedInstructions[left] !== null || loadedInstructions[right] !== null;
      const status: InteractionInstructionSignalPairStatus =
        compositionUnresolved
          ? "composition_unresolved"
          : signals.length > 0
            ? "signals_found"
            : instructionAvailable
              ? "no_signal_in_loaded_instructions"
              : "instructions_unavailable";

      pairs.push({
        productAId: a.product.productId,
        productAName: a.product.tradeName,
        productBId: b.product.productId,
        productBName: b.product.tradeName,
        status,
        signals,
      });
    }
  }

  return {
    pairs,
    coverage: {
      selectedCount: references.length,
      instructionAvailableCount: snapshots.length,
      evaluatedIngredientPairs,
      signalPairCount: pairs.filter((pair) => pair.signals.length > 0).length,
      candidateCount: pairs.reduce(
        (total, pair) => total + pair.signals.length,
        0,
      ),
    },
    disclaimer: INTERACTION_INSTRUCTION_SIGNAL_DISCLAIMER,
  };
}
