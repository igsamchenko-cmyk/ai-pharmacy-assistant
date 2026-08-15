import type { DrugRef } from "@/hooks/use-favorites";
import { drugRefHref } from "@/hooks/use-favorites";

export const QUICK_PRODUCT_CHIP_LIMIT = 5;

function isRegistryCard(drug: DrugRef): boolean {
  return drugRefHref(drug).startsWith("/products/");
}

export function buildQuickProductChips(
  favorites: readonly DrugRef[],
  recent: readonly DrugRef[],
  limit = QUICK_PRODUCT_CHIP_LIMIT,
): DrugRef[] {
  const seen = new Set<string>();
  const result: DrugRef[] = [];
  for (const drug of [...favorites, ...recent]) {
    if (!isRegistryCard(drug) || seen.has(drug.id)) continue;
    seen.add(drug.id);
    result.push(drug);
    if (result.length >= Math.max(0, limit)) break;
  }
  return result;
}

export function quickProductChipLabel(drug: DrugRef): string {
  return [drug.brandName, drug.dosage].filter(Boolean).join(" ");
}
