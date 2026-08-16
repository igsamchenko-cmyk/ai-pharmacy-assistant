import {
  catalogInnSpecificity,
  isNonSpecificInn,
  normalizeCatalogIndexText,
  type CatalogClientIndexProduct,
} from "@workspace/catalog-index";

export { catalogInnSpecificity, isNonSpecificInn };

export interface RegistryAnalogBase {
  productId: string;
  inn: string;
  form: string;
  strength: string;
  /**
   * Composition identity used instead of the МНН when the registry stores a
   * non-specific placeholder. Empty when the МНН itself is usable.
   */
  compositionKey?: string;
}

export interface RegistryAnalogGroups {
  full: CatalogClientIndexProduct[];
  partial: CatalogClientIndexProduct[];
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
  const compositionKey = base.compositionKey ?? "";
  const form = comparableText(base.form);
  const strength = comparableText(base.strength);
  const seen = new Set<string>();
  const full: CatalogClientIndexProduct[] = [];
  const partial: CatalogClientIndexProduct[] = [];

  // A resolved composition always wins. Failing that, a placeholder МНН carries
  // no substance at all and may never be fallen back to; a partial-combination
  // МНН does name a substance, so it may still group — the caller is
  // responsible for labelling that as a class rather than as an analog set.
  const matchesBase = compositionKey
    ? (candidate: CatalogClientIndexProduct) =>
        candidate.compositionKey === compositionKey
    : !inn || catalogInnSpecificity(base.inn) === "placeholder"
      ? null
      : (candidate: CatalogClientIndexProduct) =>
          normalizeCatalogIndexText(candidate.inn) === inn;

  if (!matchesBase) return { full, partial };
  for (const candidate of candidates) {
    if (
      candidate.productId === base.productId ||
      seen.has(candidate.productId) ||
      !matchesBase(candidate)
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
