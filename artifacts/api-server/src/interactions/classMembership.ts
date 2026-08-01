/**
 * Deliberately small, versioned bridge between instruction class phrases and
 * exact registry ATC codes. A match is candidate evidence only: it never
 * creates or enables a verified runtime interaction rule.
 */

export type InteractionClassMembershipBasis =
  | "official_atc_prefix"
  | "official_atc_and_oral_form";

export interface InteractionClassMembershipProduct {
  id: string;
  tradeName: string;
  atcCode: string | null;
  dosageForm: string;
}

export interface InteractionClassMembership {
  classId: string;
  className: string;
  matchedProductId: string;
  matchedProductName: string;
  atcCode: string;
  matchedAtcRule: string;
  basis: InteractionClassMembershipBasis;
  sourceLabel: string;
  sourceUrl: string;
  sourceVersion: string;
}

interface InteractionClassMembershipRule {
  classId: string;
  className: string;
  atcPrefixes: readonly string[];
  exactAtcCodes?: readonly string[];
  oralFormRequired?: boolean;
  sourceLabels: Readonly<Record<string, string>>;
}

const ATC_INDEX_BASE_URL = "https://atcddd.fhi.no/atc_ddd_index/";
const ATC_SOURCE_VERSION = "ATC/DDD Index 2026";

const CLASS_MEMBERSHIP_RULES: readonly InteractionClassMembershipRule[] = [
  {
    classId: "class:nsaids",
    className: "Non-steroidal anti-inflammatory drugs",
    atcPrefixes: ["M01A"],
    sourceLabels: {
      M01A: "M01A — anti-inflammatory and antirheumatic products, non-steroids",
    },
  },
  {
    classId: "class:vitamin-k-antagonists",
    className: "Vitamin K antagonists",
    atcPrefixes: ["B01AA"],
    sourceLabels: { B01AA: "B01AA — vitamin K antagonists" },
  },
  {
    classId: "class:direct-factor-xa-inhibitors",
    className: "Direct factor Xa inhibitors",
    atcPrefixes: ["B01AF"],
    sourceLabels: { B01AF: "B01AF — direct factor Xa inhibitors" },
  },
  {
    classId: "class:oral-anticoagulants",
    className: "Oral anticoagulants",
    atcPrefixes: ["B01AA", "B01AF"],
    exactAtcCodes: ["B01AE07"],
    oralFormRequired: true,
    sourceLabels: {
      B01AA: "B01AA — vitamin K antagonists",
      B01AF: "B01AF — direct factor Xa inhibitors",
      B01AE07: "B01AE07 — dabigatran etexilate",
    },
  },
  {
    classId: "class:potassium-sparing-diuretics",
    className: "Potassium-sparing diuretics",
    atcPrefixes: ["C03D", "C03E"],
    sourceLabels: {
      C03D: "C03D — potassium-sparing agents",
      C03E: "C03E — diuretics and potassium-sparing agents in combination",
    },
  },
] as const;

const ORAL_DOSAGE_FORM =
  /(?:таблет|капсул|драже|порошок\s+для\s+ораль|гранул\s+для\s+ораль|oral|tablet|capsule|caplet)/iu;

export function extractAtcCodes(value: string | null): string[] {
  if (!value) return [];
  return [
    ...new Set(value.toUpperCase().match(/[A-Z]\d{2}[A-Z]{2}\d{2}/gu) ?? []),
  ];
}

function matchingRuleCode(
  rule: InteractionClassMembershipRule,
  atcCode: string,
): string | null {
  if (rule.exactAtcCodes?.includes(atcCode)) return atcCode;
  return rule.atcPrefixes.find((prefix) => atcCode.startsWith(prefix)) ?? null;
}

export function resolveInteractionClassMembership(
  classId: string,
  product: InteractionClassMembershipProduct,
): InteractionClassMembership | null {
  const rule = CLASS_MEMBERSHIP_RULES.find((item) => item.classId === classId);
  if (!rule) return null;
  if (rule.oralFormRequired && !ORAL_DOSAGE_FORM.test(product.dosageForm)) {
    return null;
  }

  for (const atcCode of extractAtcCodes(product.atcCode)) {
    const matchedAtcRule = matchingRuleCode(rule, atcCode);
    if (!matchedAtcRule) continue;
    return {
      classId: rule.classId,
      className: rule.className,
      matchedProductId: product.id,
      matchedProductName: product.tradeName,
      atcCode,
      matchedAtcRule,
      basis: rule.oralFormRequired
        ? "official_atc_and_oral_form"
        : "official_atc_prefix",
      sourceLabel: rule.sourceLabels[matchedAtcRule] ?? `ATC ${matchedAtcRule}`,
      sourceUrl: `${ATC_INDEX_BASE_URL}?code=${encodeURIComponent(matchedAtcRule)}&showdescription=yes`,
      sourceVersion: ATC_SOURCE_VERSION,
    };
  }

  return null;
}

export const interactionClassMembershipPolicy = {
  version: "interaction-atc-class-membership-v1",
  supportedClassIds: CLASS_MEMBERSHIP_RULES.map((rule) => rule.classId),
  candidateOnly: true,
  changesRuntimeRules: false,
  unsupportedClassesAreNotInferred: true,
} as const;
