import { SearchCatalogQueryParams } from "@workspace/api-zod";
import { interactionRules, type RiskLevel } from "../data/interactions";
import {
  buildInteractionRuleRegistry,
  buildInteractionFoundationAudit,
} from "../interactions/audit";
import {
  INCOMPLETE_INTERACTION_CHECK,
  NO_VERIFIED_RULE,
  VERIFIED_INTERACTION_FOUND,
  createVerifiedInteractionEngine,
} from "../interactions/engine";
import type {
  InteractionSelection,
  VerifiedInteractionRule,
} from "../interactions/model";
import { normalizeIngredient } from "../interactions/model";
import type { DrugRecord } from "../data/drugs";
import { normalize } from "../lib/text";
import { getDrugsByIds } from "./drugService";
import { searchCatalog } from "./catalogSearchService";

export const INTERACTION_DISCLAIMER =
  "Інформація має довідковий характер і не є медичною консультацією. Не призначайте, не змінюйте і не скасовуйте лікування без консультації лікаря. Відсутність підтвердженого правила у FarmAssist не доводить сумісність препаратів.";

export interface InteractionPair {
  drugAId: string;
  drugAName: string;
  drugBId: string;
  drugBName: string;
  riskLevel: RiskLevel;
  explanation: string;
  whatToCheck: string;
  whenToSeeDoctor: string;
}

export interface InteractionResult {
  pairs: InteractionPair[];
  disclaimer: string;
}

function matchRule(a: DrugRecord, b: DrugRecord): InteractionPair | null {
  const innA = normalize(a.inn);
  const innB = normalize(b.inn);

  for (const rule of interactionRules) {
    const ra = normalize(rule.a);
    const rb = normalize(rule.b);
    const forward = innA.includes(ra) && innB.includes(rb);
    const backward = innA.includes(rb) && innB.includes(ra);
    if (forward || backward) {
      return {
        drugAId: a.id,
        drugAName: a.brandName,
        drugBId: b.id,
        drugBName: b.brandName,
        riskLevel: rule.riskLevel,
        explanation: rule.explanation,
        whatToCheck: rule.whatToCheck,
        whenToSeeDoctor: rule.whenToSeeDoctor,
      };
    }
  }
  return null;
}

const RISK_ORDER: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Legacy demo-only interaction path retained for beta scenarios and compare v1. */
export function checkInteractions(drugIds: string[]): InteractionResult {
  const unique = [...new Set(drugIds)];
  const selected = getDrugsByIds(unique);
  const pairs: InteractionPair[] = [];

  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      const pair = matchRule(selected[i], selected[j]);
      if (pair) pairs.push(pair);
    }
  }

  pairs.sort((a, b) => RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel]);
  return { pairs, disclaimer: INTERACTION_DISCLAIMER };
}

export interface RegistryInteractionProductRef {
  productId: string;
  registrationNumber: string;
}

export interface RegistryInteractionCatalogProduct {
  id: string;
  tradeName: string;
  inn: string;
  activeIngredient: string;
  atcCode: string | null;
  dosageForm: string;
  strength: string | null;
  registration: { number: string };
  mappingStatus: "approved" | "unmapped" | "ambiguous";
  approvedMapping: { inn: string } | null;
}

export interface RegistryInteractionResolvedProduct {
  productId: string;
  registrationNumber: string;
  tradeName: string;
  inn: string;
  activeIngredient: string;
  dosageForm: string;
  strength: string | null;
  mappingStatus: "approved" | "unmapped" | "ambiguous";
  ingredientResolution: "approved_exact" | "unresolved";
  resolvedIngredients: string[];
  unresolvedIngredients: string[];
}

export interface RegistryInteractionEvidenceSource {
  label: string;
  url: string | null;
  documentReference: string | null;
  version: string | null;
  publishedAt: string | null;
  accessedAt: string | null;
  reviewedAt: string;
}

export interface RegistryInteractionFinding {
  ingredientA: string;
  ingredientB: string;
  severity: VerifiedInteractionRule["severity"];
  clinicalEffect: string;
  mechanism: string | null;
  explanation: string;
  actionCategory: VerifiedInteractionRule["actionCategory"];
  evidenceLevel: VerifiedInteractionRule["evidenceLevel"];
  source: RegistryInteractionEvidenceSource;
}

export type RegistryInteractionPairStatus =
  | "verified_interaction"
  | "same_ingredient"
  | "insufficient_evidence"
  | "incomplete_composition";

export interface RegistryInteractionPairResult {
  productAId: string;
  productAName: string;
  productBId: string;
  productBName: string;
  status: RegistryInteractionPairStatus;
  message: string;
  findings: RegistryInteractionFinding[];
  duplicateIngredients: string[];
}

export interface RegistryInteractionCheckResult {
  products: RegistryInteractionResolvedProduct[];
  pairs: RegistryInteractionPairResult[];
  coverage: {
    selectedCount: number;
    resolvedIngredientCount: number;
    unresolvedIngredientCount: number;
    evaluatedIngredientPairs: number;
    matchedApprovedPairs: number;
    status: "complete" | "partial" | "insufficient_data";
    totalRules: number;
    runtimeEligibleRules: number;
    datasetVersion: string;
  };
  disclaimer: string;
}

export class RegistryInteractionSelectionError extends Error {
  constructor(
    public readonly code:
      | "duplicate_product"
      | "product_not_found"
      | "registry_unavailable",
  ) {
    super(code);
    this.name = "RegistryInteractionSelectionError";
  }
}

export type RegistryInteractionProductResolver = (
  reference: RegistryInteractionProductRef,
) => Promise<RegistryInteractionCatalogProduct | null>;

export async function resolveExactRegistryInteractionProduct(
  reference: RegistryInteractionProductRef,
): Promise<RegistryInteractionCatalogProduct | null> {
  const input = SearchCatalogQueryParams.parse({
    q: reference.registrationNumber,
    productId: reference.productId,
    type: "registry_products",
    view: "flat",
    page: 1,
    pageSize: 25,
  });
  const result = await searchCatalog(input);
  if (result.runtimeMode !== "db") {
    throw new RegistryInteractionSelectionError("registry_unavailable");
  }
  const product = result.registryProducts.items.find(
    (item) =>
      item.id === reference.productId &&
      item.registration.number === reference.registrationNumber,
  );
  return product ?? null;
}

function officialCompositionLabel(
  product: RegistryInteractionCatalogProduct,
): string {
  return (
    product.inn.trim() ||
    product.activeIngredient.trim() ||
    "Склад у реєстрі не зазначено"
  ).slice(0, 2000);
}

export function resolveRegistryInteractionSelection(
  product: RegistryInteractionCatalogProduct,
): {
  product: RegistryInteractionResolvedProduct;
  selection: InteractionSelection;
} {
  const approvedInn = product.approvedMapping?.inn.trim() ?? "";
  const exactApproved =
    product.mappingStatus === "approved" && approvedInn.length > 0;
  const resolvedIngredients = exactApproved ? [approvedInn] : [];
  const unresolvedIngredients = exactApproved
    ? []
    : [officialCompositionLabel(product)];

  return {
    product: {
      productId: product.id,
      registrationNumber: product.registration.number,
      tradeName: product.tradeName,
      inn: product.inn,
      activeIngredient: product.activeIngredient,
      dosageForm: product.dosageForm,
      strength: product.strength,
      mappingStatus: product.mappingStatus,
      ingredientResolution: exactApproved ? "approved_exact" : "unresolved",
      resolvedIngredients,
      unresolvedIngredients,
    },
    selection: {
      id: product.id,
      label: product.tradeName,
      ingredients: resolvedIngredients.map((canonicalName) => ({
        canonicalName,
        therapeuticGroups: [],
      })),
      unresolvedIngredients,
    },
  };
}

function findingForApi(
  finding: ReturnType<
    ReturnType<typeof createVerifiedInteractionEngine>["check"]
  >["findings"][number],
): RegistryInteractionFinding | null {
  if (!finding.rule.reviewedAt) return null;
  return {
    ingredientA: finding.ingredientA,
    ingredientB: finding.ingredientB,
    severity: finding.rule.severity,
    clinicalEffect: finding.rule.clinicalEffect,
    mechanism: finding.rule.mechanism,
    explanation: finding.rule.explanation,
    actionCategory: finding.rule.actionCategory,
    evidenceLevel: finding.rule.evidenceLevel,
    source: {
      label: finding.rule.source.label,
      url: finding.rule.source.url,
      documentReference: finding.rule.source.documentReference,
      version: finding.rule.source.version,
      publishedAt: finding.rule.source.publishedAt,
      accessedAt: finding.rule.source.accessedAt,
      reviewedAt: finding.rule.reviewedAt,
    },
  };
}

function pairMessage(status: RegistryInteractionPairStatus): string {
  switch (status) {
    case "verified_interaction":
      return VERIFIED_INTERACTION_FOUND;
    case "same_ingredient":
      return "Обидві реєстрові позиції мають однакову підтверджену діючу речовину. Це не є висновком про взаємозамінність або безпечність одночасного застосування.";
    case "incomplete_composition":
      return INCOMPLETE_INTERACTION_CHECK;
    case "insufficient_evidence":
      return NO_VERIFIED_RULE;
  }
}

export interface RegistryInteractionCheckOptions {
  resolveProduct?: RegistryInteractionProductResolver;
  rules?: readonly VerifiedInteractionRule[];
}

export async function checkRegistryInteractions(
  references: readonly RegistryInteractionProductRef[],
  options: RegistryInteractionCheckOptions = {},
): Promise<RegistryInteractionCheckResult> {
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
  const rules = options.rules ?? buildInteractionRuleRegistry();
  const engineResult = createVerifiedInteractionEngine(rules).check(
    resolved.map((item) => item.selection),
  );
  const audit = buildInteractionFoundationAudit([...rules]);
  const pairs: RegistryInteractionPairResult[] = [];

  for (let left = 0; left < resolved.length; left += 1) {
    for (let right = left + 1; right < resolved.length; right += 1) {
      const a = resolved[left];
      const b = resolved[right];
      const findings = engineResult.findings
        .filter(
          (finding) =>
            finding.selectionAId === a.product.productId &&
            finding.selectionBId === b.product.productId,
        )
        .map(findingForApi)
        .filter(
          (finding): finding is RegistryInteractionFinding => finding !== null,
        );
      const duplicateIngredients = engineResult.duplicateIngredients
        .filter(
          (duplicate) =>
            duplicate.selectionIds.includes(a.product.productId) &&
            duplicate.selectionIds.includes(b.product.productId),
        )
        .map((duplicate) => duplicate.canonicalIngredient);
      const incomplete =
        a.product.unresolvedIngredients.length > 0 ||
        b.product.unresolvedIngredients.length > 0;
      const status: RegistryInteractionPairStatus = incomplete
        ? "incomplete_composition"
        : findings.length > 0
          ? "verified_interaction"
          : duplicateIngredients.length > 0
            ? "same_ingredient"
            : "insufficient_evidence";

      pairs.push({
        productAId: a.product.productId,
        productAName: a.product.tradeName,
        productBId: b.product.productId,
        productBName: b.product.tradeName,
        status,
        message: pairMessage(status),
        findings,
        duplicateIngredients,
      });
    }
  }

  return {
    products: resolved.map((item) => item.product),
    pairs,
    coverage: {
      selectedCount: engineResult.coverage.selectedCount,
      resolvedIngredientCount: engineResult.coverage.resolvedIngredientCount,
      unresolvedIngredientCount:
        engineResult.coverage.unresolvedIngredientCount,
      evaluatedIngredientPairs: engineResult.coverage.evaluatedIngredientPairs,
      matchedApprovedPairs: engineResult.coverage.matchedApprovedPairs,
      status: engineResult.coverage.status,
      totalRules: audit.totalRules,
      runtimeEligibleRules: audit.runtimeEligibleCount,
      datasetVersion: audit.datasetVersion,
    },
    disclaimer: INTERACTION_DISCLAIMER,
  };
}
