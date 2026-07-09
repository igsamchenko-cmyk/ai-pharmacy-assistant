import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { normalize } from "../../lib/text";
import { resolveDataFilePath } from "../../lib/dataPath";
import { parseCsv } from "../import/csv";
import type { ImportRow } from "../import/format";
import {
  hasCyrillic,
  ingredientIdForInn,
} from "./transliteration";

export const UKRAINE_REGISTRY_SOURCE_ID = "ukraine_state_drug_registry";

export interface RegistryParseOptions {
  fileName?: string;
  sourceId?: string;
  includeTradeNames?: boolean;
}

export interface RegistryRawRow {
  tradeName: string;
  inn: string;
  activeIngredient: string;
  atcCode: string;
  form: string;
  strength: string;
  manufacturer: string;
  country: string;
  registrationNumber: string;
  status: string;
  sourceId: string;
  rawIndex: number;
  warnings: string[];
}

export interface RegistryParseResult {
  version: "1.5-registry-preview";
  sourceId: string;
  fileName: string | null;
  rawRows: number;
  parsedRows: number;
  generatedCandidates: number;
  parseErrors: string[];
  warnings: string[];
  rows: RegistryRawRow[];
  candidates: ImportRow[];
}

const FIELD_ALIASES = {
  tradeName: [
    "trade_name",
    "tradename",
    "name",
    "brand_name",
    "product_name",
    "торгованазва",
    "назвалікарськогозасобу",
    "назва",
  ],
  inn: ["inn", "mnn", "internationalnonproprietaryname", "міжнароднанепатентовананазва", "мнн"],
  activeIngredient: ["active_ingredient", "activesubstance", "activeingredient", "діючаречовина", "склад"],
  atcCode: ["atc", "atc_code", "atccode", "атх", "кодатх"],
  form: ["form", "dosage_form", "лікарськаформа", "форма"],
  strength: ["strength", "dosage", "dose", "дозування"],
  manufacturer: ["manufacturer", "виробник"],
  country: ["country", "країна"],
  registrationNumber: ["registration_number", "reg_number", "certificate", "реєстраційненомер", "номерпосвідчення"],
  status: ["status", "стан", "статус"],
} as const;

type FieldName = keyof typeof FIELD_ALIASES;

function normalizeHeader(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_.:/\\()№"']/g, "");
}

function objectRowsFromJson(text: string): Record<string, string>[] {
  const parsed: unknown = JSON.parse(text);
  const list =
    Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { rows?: unknown }).rows)
        ? (parsed as { rows: unknown[] }).rows
        : null;
  if (!list) throw new Error("Registry JSON must be an array or { rows: [...] }.");
  return list.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Registry JSON rows must be objects.");
    }
    const row: Record<string, string> = {};
    for (const [key, value] of Object.entries(item)) {
      row[key] = value == null ? "" : String(value);
    }
    return row;
  });
}

function objectRowsFromDelimited(text: string): Record<string, string>[] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const matrix = firstLine.includes("\t")
    ? text
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => line.split("\t"))
    : parseCsv(text);
  if (matrix.length === 0) return [];
  const header = matrix[0].map((cell) => cell.trim());
  return matrix.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    header.forEach((column, idx) => {
      row[column] = cells[idx] ?? "";
    });
    return row;
  });
}

function pick(row: Record<string, string>, field: FieldName): string {
  const aliases = new Set(FIELD_ALIASES[field].map(normalizeHeader));
  for (const [key, value] of Object.entries(row)) {
    if (aliases.has(normalizeHeader(key))) return value.trim();
  }
  return "";
}

function cleanInn(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .trim();
}

function isInactiveStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return (
    normalized.includes("expired") ||
    normalized.includes("withdrawn") ||
    normalized.includes("ануль") ||
    normalized.includes("закінч")
  );
}

function rowToRegistryRawRow(
  row: Record<string, string>,
  rawIndex: number,
  sourceId: string,
): RegistryRawRow {
  const inn = cleanInn(pick(row, "inn"));
  const activeIngredient = cleanInn(pick(row, "activeIngredient"));
  const warnings: string[] = [];
  const canonical = inn || activeIngredient;

  if (!canonical) warnings.push("missing_active_ingredient");
  if (/[+;/]/.test(canonical)) warnings.push("combination_or_multi_ingredient");

  const status = pick(row, "status");
  if (status && isInactiveStatus(status)) warnings.push("inactive_registration");

  return {
    tradeName: pick(row, "tradeName"),
    inn,
    activeIngredient,
    atcCode: pick(row, "atcCode").toUpperCase(),
    form: pick(row, "form"),
    strength: pick(row, "strength"),
    manufacturer: pick(row, "manufacturer"),
    country: pick(row, "country"),
    registrationNumber: pick(row, "registrationNumber"),
    status,
    sourceId,
    rawIndex,
    warnings,
  };
}

function rowToImportRows(
  row: RegistryRawRow,
  includeTradeNames: boolean,
): ImportRow[] {
  const canonicalInn = row.inn || row.activeIngredient;
  if (!canonicalInn || row.warnings.includes("combination_or_multi_ingredient")) {
    return [];
  }

  const ingredientId = ingredientIdForInn(canonicalInn);
  const notes = [
    "v1.5 registry import candidate",
    row.registrationNumber ? `registration:${row.registrationNumber}` : "",
    row.warnings.join("|"),
  ]
    .filter(Boolean)
    .join("; ");

  const rows: ImportRow[] = [
    {
      ingredientId,
      canonicalInn,
      name: canonicalInn,
      locale: hasCyrillic(canonicalInn) ? "uk" : "en",
      nameType: hasCyrillic(canonicalInn) ? "ukrainian" : "english",
      sourceId: row.sourceId,
      confidence: row.warnings.length > 0 ? "medium" : "high",
      ...(row.atcCode ? { atcCode: row.atcCode } : {}),
      notes,
    },
  ];

  if (
    includeTradeNames &&
    row.tradeName &&
    normalize(row.tradeName) !== normalize(canonicalInn)
  ) {
    rows.push({
      ingredientId,
      canonicalInn,
      name: row.tradeName,
      locale: hasCyrillic(row.tradeName) ? "uk" : "en",
      nameType: "brand",
      sourceId: row.sourceId,
      confidence: "medium",
      ...(row.atcCode ? { atcCode: row.atcCode } : {}),
      notes: `${notes}; trade-name requires admin review`,
    });
  }

  return rows;
}

export function parseRegistryText(
  text: string,
  options: RegistryParseOptions = {},
): RegistryParseResult {
  const sourceId = options.sourceId ?? UKRAINE_REGISTRY_SOURCE_ID;
  const fileName = options.fileName ?? null;
  const includeTradeNames = options.includeTradeNames ?? true;
  const parseErrors: string[] = [];
  const warnings: string[] = [];

  let objectRows: Record<string, string>[] = [];
  try {
    const ext = fileName ? extname(fileName).toLowerCase() : "";
    objectRows = ext === ".json"
      ? objectRowsFromJson(text)
      : objectRowsFromDelimited(text);
  } catch (error) {
    parseErrors.push(
      error instanceof Error ? error.message : "Registry parse failed.",
    );
  }

  if (fileName?.toLowerCase().endsWith(".xlsx")) {
    parseErrors.push("XLSX files must be exported to CSV/TSV before import.");
  }

  const rows = objectRows.map((row, idx) =>
    rowToRegistryRawRow(row, idx + 1, sourceId),
  );
  const candidates = rows.flatMap((row) =>
    rowToImportRows(row, includeTradeNames),
  );
  const missingCanonical = rows.filter((row) =>
    row.warnings.includes("missing_active_ingredient"),
  ).length;
  if (missingCanonical > 0) {
    warnings.push(`${missingCanonical} registry rows lacked an INN/active ingredient.`);
  }

  return {
    version: "1.5-registry-preview",
    sourceId,
    fileName,
    rawRows: objectRows.length,
    parsedRows: rows.length,
    generatedCandidates: candidates.length,
    parseErrors,
    warnings,
    rows,
    candidates,
  };
}

export function parseRegistryFile(
  filePath: string,
  options: Omit<RegistryParseOptions, "fileName"> = {},
): RegistryParseResult {
  const resolvedPath = resolveDataFilePath(filePath, { moduleUrl: import.meta.url });
  const text = readFileSync(resolvedPath, "utf8");
  return parseRegistryText(text, {
    ...options,
    fileName: resolvedPath.split(/[\\/]/).pop() ?? undefined,
  });
}
