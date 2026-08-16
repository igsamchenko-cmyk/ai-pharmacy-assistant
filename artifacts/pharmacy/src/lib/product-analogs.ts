import {
  isNonSpecificInn,
  normalizeCatalogIndexText,
  type CatalogClientIndexProduct,
} from "@workspace/catalog-index";

export { isNonSpecificInn };

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

  // A placeholder МНН is not an identity, so it may only be replaced by a real
  // composition — never fallen back to. Without either, nothing is an analog.
  const matchesBase = compositionKey
    ? (candidate: CatalogClientIndexProduct) =>
        candidate.compositionKey === compositionKey
    : !inn || isNonSpecificInn(base.inn)
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
