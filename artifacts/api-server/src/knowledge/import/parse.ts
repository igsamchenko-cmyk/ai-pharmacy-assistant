/**
 * Parse import files (CSV or JSON) into typed {@link ImportRow}s.
 *
 * Parsing is strict and pure: unknown enum values, missing required fields and
 * malformed structures become row-level errors rather than throwing or coercing.
 * The result always separates the rows that parsed cleanly from the ones that
 * did not, so callers (preview, validate, import) can decide what to do.
 */
import { parseCsv } from "./csv";
import {
  IMPORT_COLUMNS,
  REQUIRED_COLUMNS,
  isConfidenceLevel,
  isNameType,
  type ImportColumn,
  type ImportRow,
} from "./format";

export interface ImportRowError {
  /** 1-based row number as it appears in the source file (excludes header). */
  row: number;
  field: string;
  message: string;
}

export interface ParseResult {
  rows: ImportRow[];
  errors: ImportRowError[];
}

function trimOrEmpty(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Build a typed row from a plain record of string columns. */
function buildRow(
  record: Record<string, string>,
  rowNum: number,
  errors: ImportRowError[],
): ImportRow | null {
  const missing = REQUIRED_COLUMNS.filter(
    (c) => trimOrEmpty(record[c]) === "",
  );
  if (missing.length > 0) {
    for (const field of missing) {
      errors.push({
        row: rowNum,
        field,
        message: `Відсутнє обовʼязкове поле «${field}».`,
      });
    }
    return null;
  }

  const nameType = trimOrEmpty(record.name_type);
  if (!isNameType(nameType)) {
    errors.push({
      row: rowNum,
      field: "name_type",
      message: `Невідомий тип назви «${nameType}».`,
    });
    return null;
  }

  const confidence = trimOrEmpty(record.confidence);
  if (!isConfidenceLevel(confidence)) {
    errors.push({
      row: rowNum,
      field: "confidence",
      message: `Невідомий рівень довіри «${confidence}».`,
    });
    return null;
  }

  const atcCode = trimOrEmpty(record.atc_code);
  const notes = trimOrEmpty(record.notes);

  return {
    ingredientId: trimOrEmpty(record.ingredient_id),
    canonicalInn: trimOrEmpty(record.canonical_inn),
    name: trimOrEmpty(record.name),
    locale: trimOrEmpty(record.locale),
    nameType,
    sourceId: trimOrEmpty(record.source_id),
    confidence,
    ...(atcCode ? { atcCode } : {}),
    ...(notes ? { notes } : {}),
  };
}

/** Parse canonical import CSV text. First line must be the header. */
export function parseImportCsv(text: string): ParseResult {
  const rows: ImportRow[] = [];
  const errors: ImportRowError[] = [];
  const matrix = parseCsv(text);

  if (matrix.length === 0) {
    return { rows, errors };
  }

  const header = matrix[0].map((h) => h.trim());
  const known = new Set<string>(IMPORT_COLUMNS);
  const unknown = header.filter((h) => !known.has(h));
  if (unknown.length > 0) {
    errors.push({
      row: 0,
      field: unknown.join(","),
      message: `Невідомі колонки у заголовку: ${unknown.join(", ")}.`,
    });
  }
  const missingHeader = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missingHeader.length > 0) {
    errors.push({
      row: 0,
      field: missingHeader.join(","),
      message: `У заголовку відсутні колонки: ${missingHeader.join(", ")}.`,
    });
    return { rows, errors };
  }

  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i];
    const record: Record<string, string> = {};
    header.forEach((col, idx) => {
      if ((known.has(col))) record[col] = cells[idx] ?? "";
    });
    const built = buildRow(record, i, errors);
    if (built) rows.push(built);
  }

  return { rows, errors };
}

/** Parse canonical import JSON text. Accepts an array or `{ rows: [...] }`. */
export function parseImportJson(text: string): ParseResult {
  const rows: ImportRow[] = [];
  const errors: ImportRowError[] = [];

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    errors.push({ row: 0, field: "*", message: "Некоректний JSON." });
    return { rows, errors };
  }

  const list: unknown = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { rows?: unknown }).rows)
      ? (data as { rows: unknown[] }).rows
      : null;

  if (!list) {
    errors.push({
      row: 0,
      field: "*",
      message: "Очікується масив рядків або обʼєкт із полем «rows».",
    });
    return { rows, errors };
  }

  (list as unknown[]).forEach((item, idx) => {
    const rowNum = idx + 1;
    if (!item || typeof item !== "object") {
      errors.push({ row: rowNum, field: "*", message: "Рядок не є обʼєктом." });
      return;
    }
    const obj = item as Record<string, unknown>;
    const known = new Set<string>(IMPORT_COLUMNS);
    const unknown = Object.keys(obj).filter((k) => !known.has(k));
    if (unknown.length > 0) {
      errors.push({
        row: rowNum,
        field: unknown.join(","),
        message: `Невідомі поля: ${unknown.join(", ")}.`,
      });
      return;
    }
    const record: Record<string, string> = {};
    for (const col of IMPORT_COLUMNS as readonly ImportColumn[]) {
      const v = obj[col];
      record[col] = typeof v === "string" ? v : v == null ? "" : String(v);
    }
    const built = buildRow(record, rowNum, errors);
    if (built) rows.push(built);
  });

  return { rows, errors };
}
