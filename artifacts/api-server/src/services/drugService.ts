import { drugs, type DrugRecord } from "../data/drugs";

export type SearchField = "all" | "brand" | "inn" | "atc" | "form" | "dosage";

export function getAllDrugs(): DrugRecord[] {
  return drugs;
}

export function getDrugById(id: string): DrugRecord | undefined {
  return drugs.find((d) => d.id === id);
}

export function getDrugsByIds(ids: string[]): DrugRecord[] {
  return ids
    .map((id) => getDrugById(id))
    .filter((d): d is DrugRecord => d !== undefined);
}

export function searchDrugs(query: string, field: SearchField = "all"): DrugRecord[] {
  const q = query.trim().toLowerCase();
  if (q === "") {
    return [...drugs].sort((a, b) => a.brandName.localeCompare(b.brandName, "uk"));
  }

  const matches = (d: DrugRecord): boolean => {
    const inField = (value: string | null): boolean =>
      value != null && value.toLowerCase().includes(q);

    switch (field) {
      case "brand":
        return inField(d.brandName);
      case "inn":
        return inField(d.inn);
      case "atc":
        return inField(d.atcCode);
      case "form":
        return inField(d.form);
      case "dosage":
        return inField(d.dosage);
      case "all":
      default:
        return (
          inField(d.brandName) ||
          inField(d.inn) ||
          inField(d.atcCode) ||
          inField(d.form) ||
          inField(d.dosage) ||
          inField(d.pharmacologicalGroup)
        );
    }
  };

  return drugs
    .filter(matches)
    .sort((a, b) => a.brandName.localeCompare(b.brandName, "uk"));
}

export function getStats(): {
  totalDrugs: number;
  totalGroups: number;
  groups: { group: string; count: number }[];
} {
  const counts = new Map<string, number>();
  for (const d of drugs) {
    counts.set(d.pharmacologicalGroup, (counts.get(d.pharmacologicalGroup) ?? 0) + 1);
  }
  const groups = [...counts.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group, "uk"));

  return {
    totalDrugs: drugs.length,
    totalGroups: groups.length,
    groups,
  };
}
