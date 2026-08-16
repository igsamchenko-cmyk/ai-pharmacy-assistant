import {
  normalizeCatalogIndexText,
  type CatalogClientIndexProduct,
} from "@workspace/catalog-index";

export interface RegistryAnalogBase {
  productId: string;
  inn: string;
  form: string;
  strength: string;
}

export interface RegistryAnalogGroups {
  full: CatalogClientIndexProduct[];
  partial: CatalogClientIndexProduct[];
}

/**
 * The official registry does not always record a specific active-substance
 * name in the МНН/INN field. For combination products whose composition
 * isn't decomposed into one substance, it stores a generic placeholder
 * (e.g. "Comb drug") instead. Hundreds of otherwise unrelated products share
 * that exact literal string, so matching "same INN" against it would group
 * arbitrary drops, granules, tablets, and powders together as if they were
 * analogs. Treat these placeholders as "no specific INN" rather than as a
 * real substance identity.
 */
const NON_SPECIFIC_INN_KEYS = new Set([
  "combdrug",
  "combination",
  "combinations",
  "combined",
  "mono",
  "multiple",
  "other",
  "various",
]);

export function isNonSpecificInn(inn: string): boolean {
  const key = normalizeCatalogIndexText(inn);
  return key.length < 3 || NON_SPECIFIC_INN_KEYS.has(key);
}

function comparableText(value: string): string {
  return normalizeCatalogIndexText(value)
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function byTradeName(
  left: CatalogClientIndexProduct,
  right: CatalogClientIndexProduct,
): number {
  return left.tradeName.localeCompare(right.tradeName, "uk-UA");
}

export function classifyRegistryAnalogs(
  base: RegistryAnalogBase,
  candidates: readonly CatalogClientIndexProduct[],
): RegistryAnalogGroups {
  const inn = normalizeCatalogIndexText(base.inn);
  const form = comparableText(base.form);
  const strength = comparableText(base.strength);
  const seen = new Set<string>();
  const full: CatalogClientIndexProduct[] = [];
  const partial: CatalogClientIndexProduct[] = [];

  if (!inn || isNonSpecificInn(base.inn)) return { full, partial };
  for (const candidate of candidates) {
    if (
      candidate.productId === base.productId ||
      seen.has(candidate.productId) ||
      normalizeCatalogIndexText(candidate.inn) !== inn
    ) {
      continue;
    }
    seen.add(candidate.productId);
    const exactForm = comparableText(candidate.form) === form;
    const exactStrength = comparableText(candidate.strength) === strength;
    (exactForm && exactStrength ? full : partial).push(candidate);
  }

  return {
    full: full.sort(byTradeName),
    partial: partial.sort(byTradeName),
  };
}
