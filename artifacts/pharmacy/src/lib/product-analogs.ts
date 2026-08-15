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

  if (!inn) return { full, partial };
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
