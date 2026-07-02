import { drugs, type DrugRecord } from "../data/drugs";
import { normalize } from "../lib/text";

export type SearchField = "all" | "brand" | "inn" | "atc" | "form" | "dosage";

// The catalog is static, so build lookup structures once at module load.
const byId: ReadonlyMap<string, DrugRecord> = new Map(
  drugs.map((d) => [d.id, d]),
);

const byBrand = (a: DrugRecord, b: DrugRecord): number =>
  a.brandName.localeCompare(b.brandName, "uk");

const sortedByBrand: readonly DrugRecord[] = [...drugs].sort(byBrand);

export function getAllDrugs(): readonly DrugRecord[] {
  return drugs;
}

export function getDrugById(id: string): DrugRecord | undefined {
  return byId.get(id);
}

export function getDrugsByIds(ids: string[]): DrugRecord[] {
  return ids
    .map((id) => byId.get(id))
    .filter((d): d is DrugRecord => d !== undefined);
}

function fieldMatcher(q: string, field: string): (d: DrugRecord) => boolean {
  const inField = (value: string | null): boolean =>
    value != null && value.toLowerCase().includes(q);

  switch (field) {
    case "brand":
      return (d) => inField(d.brandName);
    case "inn":
      return (d) => inField(d.inn);
    case "atc":
      return (d) => inField(d.atcCode);
    case "form":
      return (d) => inField(d.form);
    case "dosage":
      return (d) => inField(d.dosage);
    case "all":
    default:
      return (d) =>
        inField(d.brandName) ||
        inField(d.inn) ||
        inField(d.atcCode) ||
        inField(d.form) ||
        inField(d.dosage) ||
        inField(d.pharmacologicalGroup);
  }
}

export function searchDrugs(
  query: string,
  field: string = "all",
): DrugRecord[] {
  const q = normalize(query);
  if (q === "") {
    return [...sortedByBrand];
  }
  return drugs.filter(fieldMatcher(q, field)).sort(byBrand);
}

/**
 * Find catalog drugs whose brand name or INN appears in free text (e.g. OCR
 * output). Returns unique matches in catalog order plus the first detected name.
 */
export function findDrugsInText(text: string): {
  detectedName: string | null;
  matches: DrugRecord[];
} {
  const haystack = normalize(text);
  const matches = drugs.filter(
    (d) =>
      haystack.includes(d.brandName.toLowerCase()) ||
      haystack.includes(d.inn.toLowerCase()),
  );
  return { detectedName: matches[0]?.brandName ?? null, matches };
}

export interface DrugStats {
  totalDrugs: number;
  totalGroups: number;
  groups: { group: string; count: number }[];
}

// Stats never change at runtime, so compute them once.
const stats: DrugStats = (() => {
  const counts = new Map<string, number>();
  for (const d of drugs) {
    counts.set(
      d.pharmacologicalGroup,
      (counts.get(d.pharmacologicalGroup) ?? 0) + 1,
    );
  }
  const groups = [...counts.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group, "uk"));
  return { totalDrugs: drugs.length, totalGroups: groups.length, groups };
})();

export function getStats(): DrugStats {
  return stats;
}
