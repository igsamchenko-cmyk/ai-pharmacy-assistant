import { getDrugById, getAllDrugs } from "./drugService";
import type { DrugRecord } from "../data/drugs";
import { normalize } from "../lib/text";

export const ANALOG_DISCLAIMER =
  "Цей список не підтверджує взаємозамінність. Навіть за однакового МНН звірте склад, форму, дозування, шлях введення, допоміжні речовини, інструкцію та умови рецепта.";

export interface AnalogResult {
  base: DrugRecord;
  full: DrugRecord[];
  partial: DrugRecord[];
  therapeutic: DrugRecord[];
  disclaimer: string;
}

// A full match is intentionally strict. Similar base forms or close numeric
// strengths are not enough to imply pharmaceutical interchangeability.
function isFullAnalog(base: DrugRecord, candidate: DrugRecord): boolean {
  return (
    normalize(candidate.form) === normalize(base.form) &&
    normalize(candidate.dosage) === normalize(base.dosage)
  );
}

export function findAnalogs(id: string): AnalogResult | undefined {
  const base = getDrugById(id);
  if (!base) return undefined;

  const all = getAllDrugs().filter((d) => d.id !== base.id);
  const baseInn = normalize(base.inn);

  const full: DrugRecord[] = [];
  const partial: DrugRecord[] = [];

  for (const d of all) {
    const sameInn = normalize(d.inn) === baseInn;

    if (sameInn && isFullAnalog(base, d)) {
      full.push(d);
    } else if (sameInn) {
      partial.push(d);
    }
  }

  const byBrand = (a: DrugRecord, b: DrugRecord): number =>
    a.brandName.localeCompare(b.brandName, "uk");

  return {
    base,
    full: full.sort(byBrand),
    partial: partial.sort(byBrand),
    // Kept in the API response for backwards compatibility. Suggesting a
    // different INN from a broad pharmacological group is not safe here.
    therapeutic: [],
    disclaimer: ANALOG_DISCLAIMER,
  };
}
