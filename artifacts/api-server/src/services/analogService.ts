import { getDrugById, getAllDrugs } from "./drugService";
import type { DrugRecord } from "../data/drugs";

export const ANALOG_DISCLAIMER =
  "Заміна препарату — рішення лікаря або фармацевта з урахуванням стану пацієнта. Терапевтичні альтернативи мають інший склад і не є прямою заміною.";

export interface AnalogResult {
  base: DrugRecord;
  full: DrugRecord[];
  partial: DrugRecord[];
  therapeutic: DrugRecord[];
  disclaimer: string;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

// Extract the first numeric strength (e.g. "200 мг" -> 200) so we can compare
// dosages even when the unit text differs slightly.
function dosageStrength(value: string): number | null {
  const match = value.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  return match ? Number.parseFloat(match[1]) : null;
}

// Reduce a form to its base dosage form, ignoring qualifiers after a comma
// (e.g. "Таблетки, вкриті оболонкою" -> "таблетки") so that a coating
// difference does not split otherwise-identical products.
function baseForm(value: string): string {
  return normalize(value.split(",")[0]);
}

// A full analog must share the active ingredient AND base dosage form, with the
// same or very close dosage strength (within 10%). Anything else with the same
// INN is a partial analog.
function isFullAnalog(base: DrugRecord, candidate: DrugRecord): boolean {
  if (baseForm(candidate.form) !== baseForm(base.form)) return false;

  if (normalize(candidate.dosage) === normalize(base.dosage)) return true;

  const baseStrength = dosageStrength(base.dosage);
  const candStrength = dosageStrength(candidate.dosage);
  if (baseStrength === null || candStrength === null || baseStrength === 0) {
    return false;
  }
  return Math.abs(candStrength - baseStrength) / baseStrength <= 0.1;
}

export function findAnalogs(id: string): AnalogResult | undefined {
  const base = getDrugById(id);
  if (!base) return undefined;

  const all = getAllDrugs().filter((d) => d.id !== base.id);
  const baseInn = normalize(base.inn);
  const baseGroup = normalize(base.pharmacologicalGroup);

  const full: DrugRecord[] = [];
  const partial: DrugRecord[] = [];
  const therapeutic: DrugRecord[] = [];

  for (const d of all) {
    const sameInn = normalize(d.inn) === baseInn;
    const sameGroup = normalize(d.pharmacologicalGroup) === baseGroup;

    if (sameInn && isFullAnalog(base, d)) {
      full.push(d);
    } else if (sameInn) {
      partial.push(d);
    } else if (sameGroup) {
      therapeutic.push(d);
    }
  }

  const byBrand = (a: DrugRecord, b: DrugRecord): number =>
    a.brandName.localeCompare(b.brandName, "uk");

  return {
    base,
    full: full.sort(byBrand),
    partial: partial.sort(byBrand),
    therapeutic: therapeutic.sort(byBrand),
    disclaimer: ANALOG_DISCLAIMER,
  };
}
