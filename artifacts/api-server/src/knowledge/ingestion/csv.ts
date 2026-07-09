import { IMPORT_COLUMNS, type ImportRow } from "../import/format";
import { toCsv } from "../import/csv";

export function importRowsToCsv(rows: readonly ImportRow[]): string {
  return toCsv([
    [...IMPORT_COLUMNS],
    ...rows.map((row) => [
      row.ingredientId,
      row.canonicalInn,
      row.name,
      row.locale,
      row.nameType,
      row.sourceId,
      row.confidence,
      row.atcCode ?? "",
      row.notes ?? "",
    ]),
  ]);
}
