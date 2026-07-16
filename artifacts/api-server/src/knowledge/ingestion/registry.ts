import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { normalize } from "../../lib/text";
import { resolveDataFilePath } from "../../lib/dataPath";
import { parseCsv } from "../import/csv";
import type { ImportRow, ReviewStatus } from "../import/format";
import { hasCyrillic, ingredientIdForInn } from "./transliteration";

export const UKRAINE_REGISTRY_SOURCE_ID = "ukraine_state_drug_registry";
export const OFFICIAL_UKRAINE_REGISTRY_CSV_URL =
  "http://www.drlz.com.ua/ibp/zvity.nsf/all/zvit/$file/reestr.csv";

export type RegistrySnapshotFormat = "csv" | "tsv" | "json" | "unknown";

export interface RegistrySnapshotMetadata {
  sourceUrl: string | null;
  downloadedAt: string | null;
  contentLength: number | null;
  sha256: string | null;
  encoding: string;
  format: RegistrySnapshotFormat;
  fileName: string | null;
}

export interface RegistryParseOptions {
  fileName?: string;
  sourceId?: string;
  includeTradeNames?: boolean;
  snapshot?: RegistrySnapshotMetadata | null;
}

export interface RegistryManufacturer {
  name: string;
  country: string;
}

export type RegistryParseConfidence = "high" | "medium" | "low";

export interface RegistryIngredientParse {
  rawIngredientExpression: string;
  parsedIngredients: string[];
  ingredientCount: number;
  combinationProduct: boolean;
  parseConfidence: RegistryParseConfidence;
  parseWarnings: string[];
  baseIngredientCandidates: string[];
  saltOrDerivativeFlags: string[];
}

export interface RegistryRawRow {
  registryId: string;
  tradeName: string;
  inn: string;
  activeIngredient: string;
  ingredientParse: RegistryIngredientParse;
  atcCode: string;
  form: string;
  strength: string;
  applicantName: string;
  applicantCountry: string;
  manufacturer: string;
  country: string;
  manufacturers: RegistryManufacturer[];
  registrationNumber: string;
  registrationStartDate: string;
  registrationEndDate: string;
  status: string;
  earlyTermination: string;
  instructionUrl: string;
  sourceId: string;
  rawIndex: number;
  warnings: string[];
}

export interface RegistryProductionSummary {
  source: RegistrySnapshotMetadata | null;
  rows: {
    raw: number;
    parsed: number;
    validProducts: number;
    invalidProducts: number;
    withInstructionUrl: number;
  };
  products: {
    total: number;
    uniqueTradeNames: number;
    uniqueRegistrationNumbers: number;
  };
  ingredients: {
    withImportableInn: number;
    uniqueInn: number;
    multiIngredientOrCombination: number;
    missingImportableInn: number;
  };
  mappings: {
    generatedCandidates: number;
    genericCandidates: number;
    brandCandidates: number;
    autoApprovedSafe: number;
    pending: number;
    needsReview: number;
    rejected: number;
    quarantined: number;
    duplicates: number;
    hardApprovedConflicts: number;
    reviewOnlyConflicts: number;
  };
  manufacturers: {
    declaredManufacturers: number;
    uniqueManufacturers: number;
    countries: number;
  };
  registrations: {
    uniqueNumbers: number;
    duplicateNumbers: number;
    earlyTerminated: number;
    unlimited: number;
  };
  review: {
    approved: number;
    pending: number;
    needs_review: number;
    rejected: number;
    quarantined: number;
  };
  readiness: {
    productSnapshotReady: boolean;
    approvedMappingsReady: boolean;
    reviewQueueReady: boolean;
    DBCommitReady: boolean;
  };
  warnings: string[];
}

export interface RegistryMappingStats {
  reviewDistribution?: Partial<Record<ReviewStatus | "quarantined", number>>;
  autoApprovedSafe?: number;
  duplicates?: number;
  hardApprovedConflicts?: number;
  reviewOnlyConflicts?: number;
  productSnapshotReady?: boolean;
  approvedMappingsReady?: boolean;
  reviewQueueReady?: boolean;
  DBCommitReady?: boolean;
}

export interface RegistryParseResult {
  version: "1.6-registry-production";
  sourceId: string;
  fileName: string | null;
  delimiter: string | null;
  snapshot: RegistrySnapshotMetadata | null;
  rawRows: number;
  parsedRows: number;
  generatedCandidates: number;
  parseErrors: string[];
  warnings: string[];
  rows: RegistryRawRow[];
  candidates: ImportRow[];
}

const FIELD_ALIASES = {
  registryId: ["id", "registry_id"],
  tradeName: [
    "trade_name",
    "tradename",
    "name",
    "brand_name",
    "product_name",
    "\u0422\u043e\u0440\u0433\u0456\u0432\u0435\u043b\u044c\u043d\u0435 \u043d\u0430\u0439\u043c\u0435\u043d\u0443\u0432\u0430\u043d\u043d\u044f",
    "\u0422\u043e\u0440\u0433\u043e\u0432\u0435 \u043d\u0430\u0439\u043c\u0435\u043d\u0443\u0432\u0430\u043d\u043d\u044f",
    "\u041d\u0430\u0437\u0432\u0430 \u043b\u0456\u043a\u0430\u0440\u0441\u044c\u043a\u043e\u0433\u043e \u0437\u0430\u0441\u043e\u0431\u0443",
    "\u043d\u0430\u0437\u0432\u0430",
  ],
  inn: [
    "inn",
    "mnn",
    "internationalnonproprietaryname",
    "\u041c\u0456\u0436\u043d\u0430\u0440\u043e\u0434\u043d\u0435 \u043d\u0435\u043f\u0430\u0442\u0435\u043d\u0442\u043e\u0432\u0430\u043d\u0435 \u043d\u0430\u0439\u043c\u0435\u043d\u0443\u0432\u0430\u043d\u043d\u044f",
    "\u041c\u041d\u041d",
  ],
  activeIngredient: [
    "active_ingredient",
    "activesubstance",
    "activeingredient",
    "\u0421\u043a\u043b\u0430\u0434 (\u0434\u0456\u044e\u0447\u0456)",
    "\u0414\u0456\u044e\u0447\u0430 \u0440\u0435\u0447\u043e\u0432\u0438\u043d\u0430",
    "\u0421\u043a\u043b\u0430\u0434",
  ],
  atcCode: [
    "atc",
    "atc_code",
    "atccode",
    "\u041a\u043e\u0434 \u0410\u0422\u0421 1",
    "\u041a\u043e\u0434 \u0410\u0422\u0421 2",
    "\u041a\u043e\u0434 \u0410\u0422\u0421 3",
    "\u041a\u043e\u0434 ATC 1",
    "\u041a\u043e\u0434 ATC 2",
    "\u041a\u043e\u0434 ATC 3",
    "\u0410\u0422\u0421",
  ],
  form: [
    "form",
    "dosage_form",
    "\u0424\u043e\u0440\u043c\u0430 \u0432\u0438\u043f\u0443\u0441\u043a\u0443",
    "\u041b\u0456\u043a\u0430\u0440\u0441\u044c\u043a\u0430 \u0444\u043e\u0440\u043c\u0430",
    "\u0424\u043e\u0440\u043c\u0430",
  ],
  strength: [
    "strength",
    "dosage",
    "dose",
    "\u0414\u043e\u0437\u0443\u0432\u0430\u043d\u043d\u044f",
  ],
  applicantName: [
    "applicant",
    "applicant_name",
    "\u0417\u0430\u044f\u0432\u043d\u0438\u043a: \u043d\u0430\u0437\u0432\u0430 \u0443\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u043e\u044e",
  ],
  applicantCountry: [
    "applicant_country",
    "\u0417\u0430\u044f\u0432\u043d\u0438\u043a: \u043a\u0440\u0430\u0457\u043d\u0430",
  ],
  manufacturer: [
    "manufacturer",
    "\u0412\u0438\u0440\u043e\u0431\u043d\u0438\u043a",
    "\u0412\u0438\u0440\u043e\u0431\u043d\u0438\u043a 1: \u043d\u0430\u0437\u0432\u0430 \u0443\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u043e\u044e",
  ],
  country: [
    "country",
    "\u041a\u0440\u0430\u0457\u043d\u0430",
    "\u0412\u0438\u0440\u043e\u0431\u043d\u0438\u043a 1: \u043a\u0440\u0430\u0457\u043d\u0430",
  ],
  registrationNumber: [
    "registration_number",
    "reg_number",
    "certificate",
    "\u041d\u043e\u043c\u0435\u0440 \u0420\u0435\u0454\u0441\u0442\u0440\u0430\u0446\u0456\u0439\u043d\u043e\u0433\u043e \u043f\u043e\u0441\u0432\u0456\u0434\u0447\u0435\u043d\u043d\u044f",
    "\u0420\u0435\u0454\u0441\u0442\u0440\u0430\u0446\u0456\u0439\u043d\u0438\u0439 \u043d\u043e\u043c\u0435\u0440",
  ],
  registrationStartDate: [
    "registration_start",
    "registration_start_date",
    "\u0414\u0430\u0442\u0430 \u043f\u043e\u0447\u0430\u0442\u043a\u0443 \u0434\u0456\u0457",
  ],
  registrationEndDate: [
    "registration_end",
    "registration_end_date",
    "\u0414\u0430\u0442\u0430 \u0437\u0430\u043a\u0456\u043d\u0447\u0435\u043d\u043d\u044f",
  ],
  status: [
    "status",
    "\u0421\u0442\u0430\u043d",
    "\u0421\u0442\u0430\u0442\u0443\u0441",
  ],
  earlyTermination: [
    "early_termination",
    "\u0414\u043e\u0441\u0442\u0440\u043e\u043a\u043e\u0432\u0435 \u043f\u0440\u0438\u043f\u0438\u043d\u0435\u043d\u043d\u044f",
  ],
  instructionUrl: [
    "instruction_url",
    "url",
    "\u0055\u0052\u004c \u0456\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0456\u0457",
  ],
} as const;

type FieldName = keyof typeof FIELD_ALIASES;

function normalizeHeader(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_.:/\\()\u2116"']/g, "");
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function formatFromFileName(
  fileName: string | null | undefined,
): RegistrySnapshotFormat {
  const ext = fileName ? extname(fileName).toLowerCase() : "";
  if (ext === ".csv") return "csv";
  if (ext === ".tsv") return "tsv";
  if (ext === ".json") return "json";
  return "unknown";
}

export function decodeRegistryBuffer(
  bytes: Buffer,
  preferredEncoding: "auto" | "utf-8" | "windows-1251" = "auto",
): { text: string; encoding: string } {
  if (preferredEncoding !== "auto") {
    const text = new TextDecoder(preferredEncoding).decode(bytes);
    return { text, encoding: preferredEncoding };
  }

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return {
      text: new TextDecoder("utf-8").decode(bytes.subarray(3)),
      encoding: "utf-8",
    };
  }

  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: "utf-8",
    };
  } catch {
    return {
      text: new TextDecoder("windows-1251").decode(bytes),
      encoding: "windows-1251",
    };
  }
}

export async function downloadOfficialRegistrySnapshot(
  options: {
    url?: string;
    now?: Date;
  } = {},
): Promise<{ text: string; metadata: RegistrySnapshotMetadata }> {
  const url = options.url ?? OFFICIAL_UKRAINE_REGISTRY_CSV_URL;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Official registry download failed with HTTP ${response.status}.`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const decoded = decodeRegistryBuffer(bytes);
  return {
    text: decoded.text,
    metadata: {
      sourceUrl: url,
      downloadedAt: (options.now ?? new Date()).toISOString(),
      contentLength: bytes.length,
      sha256: sha256(bytes),
      encoding: decoded.encoding,
      format: "csv",
      fileName: "reestr.csv",
    },
  };
}

function objectRowsFromJson(text: string): Record<string, string>[] {
  const parsed: unknown = JSON.parse(text);
  const list = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { rows?: unknown }).rows)
      ? (parsed as { rows: unknown[] }).rows
      : null;
  if (!list)
    throw new Error("Registry JSON must be an array or { rows: [...] }.");
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

function countChar(text: string, char: string): number {
  return [...text].filter((value) => value === char).length;
}

function sniffDelimiter(firstLine: string): string {
  if (countChar(firstLine, "\t") > 0) return "\t";
  const semicolons = countChar(firstLine, ";");
  const commas = countChar(firstLine, ",");
  return semicolons > commas ? ";" : ",";
}

function objectRowsFromDelimited(text: string): {
  rows: Record<string, string>[];
  delimiter: string;
} {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = sniffDelimiter(firstLine);
  const matrix = parseCsv(text, delimiter);
  if (matrix.length === 0) return { rows: [], delimiter };
  const header = matrix[0].map((cell) => cell.trim());
  return {
    delimiter,
    rows: matrix.slice(1).map((cells) => {
      const row: Record<string, string> = {};
      header.forEach((column, idx) => {
        row[column] = cells[idx] ?? "";
      });
      return row;
    }),
  };
}

function pick(row: Record<string, string>, field: FieldName): string {
  const aliases = new Set(FIELD_ALIASES[field].map(normalizeHeader));
  for (const [key, value] of Object.entries(row)) {
    if (aliases.has(normalizeHeader(key))) return value.trim();
  }
  return "";
}

function pickByAliases(
  row: Record<string, string>,
  aliases: readonly string[],
): string {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.has(normalizeHeader(key))) return value.trim();
  }
  return "";
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanInn(value: string): string {
  return cleanText(value.replace(/\s*\([^)]*\)\s*/g, " "));
}

function isPlaceholderInn(value: string): boolean {
  const normalized = normalize(value);
  return (
    !normalized ||
    normalized === "mono" ||
    normalized === "monо" ||
    normalized === "\u043c\u043e\u043d\u043e" ||
    normalized === "n/a" ||
    normalized === "na"
  );
}

const SALT_OR_DERIVATIVE_TERMS = [
  "hydrochloride",
  "sodium",
  "potassium",
  "hydrate",
  "acetate",
  "succinate",
  "ester",
  "esters",
  "complex",
  "complexes",
] as const;

const COMBINATION_WORDS = [
  "and",
  "with",
  "combination",
  "combinations",
  "comb drug",
  "combined",
  "\u0442\u0430",
  "\u0456",
  "\u043a\u043e\u043c\u0431\u0456\u043d\u0430\u0446\u0456\u044f",
  "\u043a\u043e\u043c\u0431\u0456\u043d\u043e\u0432\u0430\u043d\u0438\u0439",
  "\u0443 \u043a\u043e\u043c\u0431\u0456\u043d\u0430\u0446\u0456\u0457",
] as const;

const COMBINATION_WORD_PATTERN = new RegExp(
  `(?:^|\\s)(?:${COMBINATION_WORDS.join("|")})(?:\\s|$)`,
  "i",
);

const INGREDIENT_SPLIT_PATTERN = new RegExp(
  `\\s*(?:[+;/,]|(?:\\b(?:and|with)\\b)|(?:^|\\s)(?:\\u0442\\u0430|\\u0456)(?:\\s|$))\\s*`,
  "i",
);

const SALT_OR_DERIVATIVE_PATTERN = new RegExp(
  `\\b(?:${SALT_OR_DERIVATIVE_TERMS.join("|")})\\b`,
  "gi",
);

function saltOrDerivativeFlags(value: string): string[] {
  const flags = new Set<string>();
  for (const term of value.matchAll(SALT_OR_DERIVATIVE_PATTERN)) {
    flags.add(term[0].toLowerCase());
  }
  return [...flags].sort();
}

function cleanIngredientToken(value: string): string {
  return cleanText(
    value
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|iu|%)\b/gi, " ")
      .replace(/\b\d+(?:[.,]\d+)?\b/g, " ")
      .replace(/[.:]/g, " "),
  );
}

function baseIngredientCandidate(value: string): string {
  return cleanText(
    cleanIngredientToken(value).replace(SALT_OR_DERIVATIVE_PATTERN, " "),
  );
}

export function parseIngredientExpression(
  value: string,
): RegistryIngredientParse {
  const rawIngredientExpression = cleanText(value);
  const parseWarnings: string[] = [];
  const saltFlags = saltOrDerivativeFlags(rawIngredientExpression);

  if (!rawIngredientExpression) {
    return {
      rawIngredientExpression,
      parsedIngredients: [],
      ingredientCount: 0,
      combinationProduct: false,
      parseConfidence: "low",
      parseWarnings: ["missing_ingredient_expression"],
      baseIngredientCandidates: [],
      saltOrDerivativeFlags: [],
    };
  }

  const hasExplicitSeparator = /[+;/,]/.test(rawIngredientExpression);
  const hasCombinationMarker = COMBINATION_WORD_PATTERN.test(
    rawIngredientExpression,
  );
  const splitTokens = rawIngredientExpression
    .split(INGREDIENT_SPLIT_PATTERN)
    .map(cleanIngredientToken)
    .filter(Boolean);
  const parsedIngredients =
    splitTokens.length > 0
      ? [...new Set(splitTokens)]
      : [cleanIngredientToken(rawIngredientExpression)].filter(Boolean);

  if (hasCombinationMarker) parseWarnings.push("combination_marker");
  if (hasExplicitSeparator && parsedIngredients.length <= 1) {
    parseWarnings.push("unparsed_combination_expression");
  }
  if (saltFlags.length > 0) parseWarnings.push("salt_or_derivative_ambiguity");
  if (/\d|%/.test(rawIngredientExpression))
    parseWarnings.push("quantity_or_strength_in_expression");

  const combinationProduct =
    parsedIngredients.length > 1 ||
    hasExplicitSeparator ||
    hasCombinationMarker;
  const ingredientCount = combinationProduct
    ? Math.max(2, parsedIngredients.length)
    : parsedIngredients.length;
  const baseIngredientCandidates = [
    ...new Set(
      parsedIngredients
        .map(baseIngredientCandidate)
        .filter(
          (candidate) =>
            candidate &&
            normalize(candidate) !== normalize(rawIngredientExpression),
        ),
    ),
  ];

  return {
    rawIngredientExpression,
    parsedIngredients,
    ingredientCount,
    combinationProduct,
    parseConfidence:
      parsedIngredients.length === 0 || combinationProduct
        ? "low"
        : saltFlags.length > 0 || parseWarnings.length > 0
          ? "medium"
          : "high",
    parseWarnings,
    baseIngredientCandidates,
    saltOrDerivativeFlags: saltFlags,
  };
}

function isMultiIngredient(value: string): boolean {
  return parseIngredientExpression(value).combinationProduct;
}

function isImportableInn(value: string): boolean {
  const cleaned = cleanInn(value);
  const parsed = parseIngredientExpression(cleaned);
  return (
    cleaned.length > 1 &&
    cleaned.length <= 120 &&
    !isPlaceholderInn(cleaned) &&
    parsed.ingredientCount === 1 &&
    !parsed.combinationProduct &&
    !/\d|%/.test(cleaned)
  );
}

function isInactiveStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return (
    normalized.includes("expired") ||
    normalized.includes("withdrawn") ||
    normalized.includes("\u0430\u043d\u0443\u043b") ||
    normalized.includes("\u0437\u0430\u043a\u0456\u043d\u0447") ||
    normalized === "\u0442\u0430\u043a"
  );
}

function manufacturerAliases(
  index: number,
  suffix: "name" | "country",
): string[] {
  const label =
    suffix === "name"
      ? "\u043d\u0430\u0437\u0432\u0430 \u0443\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u043e\u044e"
      : "\u043a\u0440\u0430\u0457\u043d\u0430";
  return [
    `manufacturer_${index}_${suffix}`,
    `\u0412\u0438\u0440\u043e\u0431\u043d\u0438\u043a ${index}: ${label}`,
  ];
}

function extractManufacturers(
  row: Record<string, string>,
): RegistryManufacturer[] {
  const manufacturers: RegistryManufacturer[] = [];
  for (let index = 1; index <= 5; index += 1) {
    const name = cleanText(
      pickByAliases(row, manufacturerAliases(index, "name")),
    );
    const country = cleanText(
      pickByAliases(row, manufacturerAliases(index, "country")),
    );
    if (name || country) manufacturers.push({ name, country });
  }
  return manufacturers;
}

function rowToRegistryRawRow(
  row: Record<string, string>,
  rawIndex: number,
  sourceId: string,
): RegistryRawRow {
  const inn = cleanInn(pick(row, "inn"));
  const activeIngredient = cleanText(pick(row, "activeIngredient"));
  const ingredientParse = parseIngredientExpression(inn || activeIngredient);
  const warnings: string[] = [];

  if (!isImportableInn(inn)) warnings.push("missing_importable_inn");
  if (inn && (isPlaceholderInn(inn) || /\d|%/.test(inn))) {
    warnings.push("non_importable_inn_value");
  }
  if (ingredientParse.combinationProduct || (inn && isMultiIngredient(inn))) {
    warnings.push("combination_or_multi_ingredient");
  }
  if (ingredientParse.saltOrDerivativeFlags.length > 0) {
    warnings.push("salt_or_derivative_ambiguity");
  }
  if (
    ingredientParse.parseConfidence !== "high" ||
    ingredientParse.parseWarnings.length > 0
  ) {
    warnings.push("ingredient_parse_review_required");
  }
  if (!inn && activeIngredient)
    warnings.push("composition_not_imported_as_inn");

  const status = cleanText(pick(row, "status"));
  const earlyTermination = cleanText(pick(row, "earlyTermination"));
  if (
    (status && isInactiveStatus(status)) ||
    (earlyTermination && isInactiveStatus(earlyTermination))
  ) {
    warnings.push("inactive_registration");
  }

  const manufacturers = extractManufacturers(row);
  const firstManufacturer = manufacturers[0] ?? {
    name: pick(row, "manufacturer"),
    country: pick(row, "country"),
  };

  return {
    registryId: cleanText(pick(row, "registryId")),
    tradeName: cleanText(pick(row, "tradeName")),
    inn,
    activeIngredient,
    ingredientParse,
    atcCode: cleanText(pick(row, "atcCode")).toUpperCase(),
    form: cleanText(pick(row, "form")),
    strength: cleanText(pick(row, "strength")),
    applicantName: cleanText(pick(row, "applicantName")),
    applicantCountry: cleanText(pick(row, "applicantCountry")),
    manufacturer: cleanText(firstManufacturer.name),
    country: cleanText(firstManufacturer.country),
    manufacturers,
    registrationNumber: cleanText(pick(row, "registrationNumber")),
    registrationStartDate: cleanText(pick(row, "registrationStartDate")),
    registrationEndDate: cleanText(pick(row, "registrationEndDate")),
    status,
    earlyTermination,
    instructionUrl: cleanText(pick(row, "instructionUrl")),
    sourceId,
    rawIndex,
    warnings,
  };
}

function rowToImportRows(
  row: RegistryRawRow,
  includeTradeNames: boolean,
): ImportRow[] {
  const canonicalInn = isImportableInn(row.inn) ? row.inn : "";
  if (!canonicalInn) return [];

  const ingredientId = ingredientIdForInn(canonicalInn);
  const notes = [
    "v1.6 official Ukrainian registry import candidate",
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
      confidence:
        row.ingredientParse.saltOrDerivativeFlags.length > 0 ||
        row.ingredientParse.parseWarnings.length > 0
          ? "low"
          : row.warnings.length > 0
            ? "medium"
            : "high",
      ...(row.atcCode ? { atcCode: row.atcCode } : {}),
      notes,
    },
  ];

  if (
    includeTradeNames &&
    row.tradeName &&
    row.tradeName.length <= 180 &&
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
  const fileName = options.fileName ?? options.snapshot?.fileName ?? null;
  const includeTradeNames = options.includeTradeNames ?? true;
  const parseErrors: string[] = [];
  const warnings: string[] = [];
  let delimiter: string | null = null;

  let objectRows: Record<string, string>[] = [];
  try {
    const ext = fileName ? extname(fileName).toLowerCase() : "";
    if (ext === ".json") {
      objectRows = objectRowsFromJson(text);
    } else {
      const parsed = objectRowsFromDelimited(text);
      objectRows = parsed.rows;
      delimiter = parsed.delimiter;
    }
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
    row.warnings.includes("missing_importable_inn"),
  ).length;
  if (missingCanonical > 0) {
    warnings.push(
      `${missingCanonical} registry rows lacked an importable single INN.`,
    );
  }

  return {
    version: "1.6-registry-production",
    sourceId,
    fileName,
    delimiter,
    snapshot: options.snapshot ?? null,
    rawRows: objectRows.length,
    parsedRows: rows.length,
    generatedCandidates: candidates.length,
    parseErrors,
    warnings,
    rows,
    candidates,
  };
}

export function parseRegistryBuffer(
  bytes: Buffer,
  options: Omit<RegistryParseOptions, "snapshot"> & {
    sourceUrl?: string | null;
    downloadedAt?: string | null;
    encoding?: "auto" | "utf-8" | "windows-1251";
  } = {},
): RegistryParseResult {
  const decoded = decodeRegistryBuffer(bytes, options.encoding ?? "auto");
  const fileName = options.fileName ?? null;
  const snapshot: RegistrySnapshotMetadata = {
    sourceUrl: options.sourceUrl ?? null,
    downloadedAt: options.downloadedAt ?? null,
    contentLength: bytes.length,
    sha256: sha256(bytes),
    encoding: decoded.encoding,
    format: formatFromFileName(fileName),
    fileName,
  };
  return parseRegistryText(decoded.text, {
    ...options,
    fileName: fileName ?? undefined,
    snapshot,
  });
}

export function parseRegistryFile(
  filePath: string,
  options: Omit<RegistryParseOptions, "fileName" | "snapshot"> = {},
): RegistryParseResult {
  const resolvedPath = resolveDataFilePath(filePath, {
    moduleUrl: import.meta.url,
  });
  const bytes = readFileSync(resolvedPath);
  return parseRegistryBuffer(bytes, {
    ...options,
    fileName: basename(resolvedPath),
  });
}

export function registryRowHash(row: RegistryRawRow): string {
  const manufacturers = row.manufacturers
    .map(
      (manufacturer) =>
        `${manufacturer.name.trim()}\u001f${manufacturer.country.trim()}`,
    )
    .sort((a, b) => a.localeCompare(b))
    .join("\u001e");
  return createHash("sha256")
    .update(
      [
        row.registryId,
        row.tradeName,
        normalize(row.tradeName),
        row.inn,
        row.activeIngredient,
        row.atcCode,
        row.form,
        row.strength,
        row.applicantName,
        row.applicantCountry,
        manufacturers,
        row.registrationNumber,
        row.registrationStartDate,
        row.registrationEndDate,
        row.status,
        row.earlyTermination,
        row.instructionUrl,
      ].join("\u001f"),
    )
    .digest("hex");
}

export function buildRegistryProductionSummary(
  registry: RegistryParseResult,
  stats: RegistryMappingStats = {},
): RegistryProductionSummary {
  const rows = registry.rows;
  const validProducts = rows.filter(
    (row) => row.tradeName || row.registrationNumber,
  ).length;
  const importableInnRows = rows.filter((row) => isImportableInn(row.inn));
  const reviewDistribution = stats.reviewDistribution ?? {};
  const registrationNumbers = rows
    .map((row) => row.registrationNumber)
    .filter(Boolean);
  const uniqueRegistrationNumbers = new Set(registrationNumbers.map(normalize));
  const manufacturerEntries = rows.flatMap((row) => row.manufacturers);
  const uniqueManufacturerNames = new Set(
    manufacturerEntries.map((item) => normalize(item.name)).filter(Boolean),
  );
  const manufacturerCountries = new Set(
    manufacturerEntries.map((item) => normalize(item.country)).filter(Boolean),
  );
  const warnings = [
    ...registry.warnings,
    ...registry.parseErrors.map(() => "Registry parse errors are blocking."),
  ];

  return {
    source: registry.snapshot,
    rows: {
      raw: registry.rawRows,
      parsed: registry.parsedRows,
      validProducts,
      invalidProducts: Math.max(0, registry.parsedRows - validProducts),
      withInstructionUrl: rows.filter((row) => row.instructionUrl).length,
    },
    products: {
      total: rows.length,
      uniqueTradeNames: new Set(
        rows.map((row) => normalize(row.tradeName)).filter(Boolean),
      ).size,
      uniqueRegistrationNumbers: uniqueRegistrationNumbers.size,
    },
    ingredients: {
      withImportableInn: importableInnRows.length,
      uniqueInn: new Set(importableInnRows.map((row) => normalize(row.inn)))
        .size,
      multiIngredientOrCombination: rows.filter((row) =>
        row.warnings.includes("combination_or_multi_ingredient"),
      ).length,
      missingImportableInn: rows.filter((row) =>
        row.warnings.includes("missing_importable_inn"),
      ).length,
    },
    mappings: {
      generatedCandidates: registry.generatedCandidates,
      genericCandidates: registry.candidates.filter(
        (row) => row.nameType !== "brand",
      ).length,
      brandCandidates: registry.candidates.filter(
        (row) => row.nameType === "brand",
      ).length,
      autoApprovedSafe:
        stats.autoApprovedSafe ?? reviewDistribution.approved ?? 0,
      pending: reviewDistribution.pending ?? 0,
      needsReview: reviewDistribution.needs_review ?? 0,
      rejected: reviewDistribution.rejected ?? 0,
      quarantined: reviewDistribution.quarantined ?? 0,
      duplicates: stats.duplicates ?? 0,
      hardApprovedConflicts: stats.hardApprovedConflicts ?? 0,
      reviewOnlyConflicts: stats.reviewOnlyConflicts ?? 0,
    },
    manufacturers: {
      declaredManufacturers: manufacturerEntries.length,
      uniqueManufacturers: uniqueManufacturerNames.size,
      countries: manufacturerCountries.size,
    },
    registrations: {
      uniqueNumbers: uniqueRegistrationNumbers.size,
      duplicateNumbers:
        registrationNumbers.length - uniqueRegistrationNumbers.size,
      earlyTerminated: rows.filter((row) =>
        row.warnings.includes("inactive_registration"),
      ).length,
      unlimited: rows.filter((row) =>
        normalize(row.registrationEndDate).includes(
          "\u043d\u0435\u043e\u0431\u043c\u0435\u0436",
        ),
      ).length,
    },
    review: {
      approved: reviewDistribution.approved ?? 0,
      pending: reviewDistribution.pending ?? 0,
      needs_review: reviewDistribution.needs_review ?? 0,
      rejected: reviewDistribution.rejected ?? 0,
      quarantined: reviewDistribution.quarantined ?? 0,
    },
    readiness: {
      productSnapshotReady:
        stats.productSnapshotReady ??
        (registry.parseErrors.length === 0 &&
          registry.rawRows === registry.parsedRows &&
          validProducts === registry.parsedRows),
      approvedMappingsReady:
        stats.approvedMappingsReady ?? (stats.hardApprovedConflicts ?? 0) === 0,
      reviewQueueReady:
        stats.reviewQueueReady ?? registry.parseErrors.length === 0,
      DBCommitReady:
        stats.DBCommitReady ??
        (registry.parseErrors.length === 0 &&
          (stats.hardApprovedConflicts ?? 0) === 0),
    },
    warnings,
  };
}
