import { getDrugsByIds } from "../../services/drugService";
import {
  checkInteractions,
  type InteractionResult,
} from "../../services/interactionService";
import type { DrugRecord } from "../../data/drugs";
import { getAtcInfo, type AtcInfo } from "../atc";
import { GLOBAL_DISCLAIMER } from "../../services/safety";

/** A single drug enriched with its ATC classification for the compare view. */
export interface ComparedDrug {
  drug: DrugRecord;
  atc: AtcInfo | null;
}

/** Field-by-field comparison row (one attribute across all selected drugs). */
export interface CompareRow {
  label: string;
  values: (string | null)[];
}

export interface CompareResult {
  drugs: ComparedDrug[];
  rows: CompareRow[];
  interactions: InteractionResult;
  disclaimer: string;
}

const FIELDS: { label: string; get: (d: DrugRecord) => string | null }[] = [
  { label: "Торгова назва", get: (d) => d.brandName },
  { label: "Діюча речовина (INN)", get: (d) => d.inn },
  { label: "ATC-код", get: (d) => d.atcCode },
  { label: "Фармакологічна група", get: (d) => d.pharmacologicalGroup },
  { label: "Форма випуску", get: (d) => d.form },
  { label: "Дозування", get: (d) => d.dosage },
  { label: "Показання", get: (d) => d.indications },
  { label: "Протипоказання", get: (d) => d.contraindications },
];

/**
 * Compare 2+ drugs side by side: aligned attribute rows plus a full pairwise
 * interaction check between them. Reference information only.
 */
export function compareDrugs(ids: string[]): CompareResult {
  const drugs = getDrugsByIds(ids);
  const compared: ComparedDrug[] = drugs.map((drug) => ({
    drug,
    atc: getAtcInfo(drug.atcCode),
  }));

  const rows: CompareRow[] = FIELDS.map((f) => ({
    label: f.label,
    values: drugs.map((d) => f.get(d)),
  }));

  const interactions = checkInteractions(drugs.map((d) => d.id));

  return { drugs: compared, rows, interactions, disclaimer: GLOBAL_DISCLAIMER };
}
