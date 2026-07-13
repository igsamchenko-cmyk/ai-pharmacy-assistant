export type InteractionSeverity =
  | "contraindicated"
  | "major"
  | "moderate"
  | "minor"
  | "informational"
  | "unknown";

export type InteractionActionCategory =
  | "avoid_combination"
  | "specialist_review"
  | "monitor"
  | "consider_alternative"
  | "informational";

export type InteractionEvidenceLevel =
  | "established"
  | "reference"
  | "theoretical";

export type InteractionReviewStatus =
  | "approved"
  | "needs_review"
  | "quarantined"
  | "rejected";

export interface InteractionRuleSource {
  key: string;
  label: string;
  url: string | null;
  documentReference: string | null;
  version: string | null;
  publishedAt: string | null;
  accessedAt: string | null;
}

export interface InteractionRuleProvenance {
  datasetVersion: string;
  importedAt: string | null;
  origin: "curated" | "generated" | "imported";
  sourceRecordId: string | null;
}

export interface VerifiedInteractionRule {
  id: string;
  ingredientA: string;
  ingredientB: string;
  pairKey: string;
  directionality: "symmetric" | "directional";
  therapeuticGroupsA: string[];
  therapeuticGroupsB: string[];
  severity: InteractionSeverity;
  clinicalEffect: string;
  mechanism: string | null;
  explanation: string;
  actionCategory: InteractionActionCategory;
  evidenceLevel: InteractionEvidenceLevel;
  source: InteractionRuleSource;
  reviewStatus: InteractionReviewStatus;
  reviewedAt: string | null;
  unresolvedConflict: boolean;
  provenance: InteractionRuleProvenance;
  populationContext: string | null;
}

export interface ResolvedInteractionIngredient {
  canonicalName: string;
  therapeuticGroups: string[];
}

export interface InteractionSelection {
  id: string;
  label: string;
  ingredients: ResolvedInteractionIngredient[];
  unresolvedIngredients: string[];
}

export function normalizeIngredient(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("uk-UA")
    .replace(/\s+/g, " ");
}

export function normalizedInteractionPairKey(a: string, b: string): string {
  return [normalizeIngredient(a), normalizeIngredient(b)].sort().join("|");
}

export const INTERACTION_SEVERITY_ORDER: Record<InteractionSeverity, number> = {
  contraindicated: 0,
  major: 1,
  moderate: 2,
  minor: 3,
  informational: 4,
  unknown: 5,
};

export const INTERACTION_SEVERITY_LABELS_UK: Record<
  InteractionSeverity,
  string
> = {
  contraindicated: "Протипоказано",
  major: "Клінічно значуща",
  moderate: "Помірна",
  minor: "Незначна",
  informational: "Інформаційна",
  unknown: "Недостатньо даних",
};
