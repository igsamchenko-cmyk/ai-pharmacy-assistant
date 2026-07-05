import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalize } from "../../lib/text";
import { parseImportCsv, type ImportRowError } from "./parse";
import {
  CONFIDENCE_LEVELS,
  type ConfidenceLevel,
  type ImportRow,
  type ReviewStatus,
} from "./format";
import {
  analyzeImport,
  liveKnowledgeView,
  type ImportPreview,
} from "./analyze";
import { emptyReviewDistribution } from "./review";

export const DICTIONARY_BATCHES_DIR = "data/dictionary-batches";

export interface DictionaryBatchFile {
  fileName: string;
  path: string;
  category: string;
}

export interface DictionaryBatchFileSummary {
  fileName: string;
  category: string;
  rowsParsed: number;
  parseErrors: number;
  newIngredients: number;
  newMappings: number;
  duplicates: number;
  conflicts: number;
  missingSources: number;
  invalidAtc: number;
  copyrightViolations: number;
  wouldSucceed: boolean;
}

export interface DictionaryBatchQualitySummary {
  files: number;
  totalRows: number;
  totalNewIngredients: number;
  totalNewMappings: number;
  duplicates: number;
  conflicts: number;
  parseErrors: number;
  missingSources: number;
  invalidAtc: number;
  copyrightViolations: number;
  ukrainianRows: number;
  englishRows: number;
  latinRows: number;
  transliterationRows: number;
  atcRows: number;
  sourceCoveragePct: number;
  ukrainianCoveragePct: number;
  atcCoveragePct: number;
  suspiciousBrandLikeRows: number;
  ambiguousAbbreviationRows: number;
  normalizationConflictRows: number;
  byCategory: Record<string, number>;
  byConfidence: Record<ConfidenceLevel, number>;
  byReviewStatus: Record<ReviewStatus, number>;
  bySource: Record<string, number>;
  fileSummaries: DictionaryBatchFileSummary[];
  wouldSucceed: boolean;
}

function candidateDirs(): string[] {
  const cwd = process.cwd();
  let fileDir = cwd;
  try {
    fileDir = dirname(fileURLToPath(import.meta.url));
  } catch {
    // cwd candidates cover test and bundled execution.
  }
  return [
    resolve(cwd, DICTIONARY_BATCHES_DIR),
    resolve(cwd, "../../", DICTIONARY_BATCHES_DIR),
    resolve(cwd, "../../../", DICTIONARY_BATCHES_DIR),
    resolve(fileDir, "../../../../", DICTIONARY_BATCHES_DIR),
    resolve(fileDir, "../../../../../", DICTIONARY_BATCHES_DIR),
  ];
}

let cachedDir: string | null | undefined;

export function findDictionaryBatchesDir(): string | null {
  if (cachedDir !== undefined) return cachedDir;
  cachedDir = candidateDirs().find((dir) => existsSync(dir)) ?? null;
  return cachedDir;
}

function categoryFromFileName(fileName: string): string {
  return fileName
    .replace(/\.csv$/i, "")
    .replace(/^\d+-/, "")
    .replace(/-/g, " ");
}

export function listDictionaryBatchFiles(): DictionaryBatchFile[] {
  const dir = findDictionaryBatchesDir();
  if (!dir) return [];
  return readdirSync(dir)
    .filter((fileName) => /^\d+-.+\.csv$/i.test(fileName))
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => ({
      fileName,
      path: resolve(dir, fileName),
      category: categoryFromFileName(fileName),
    }));
}

export function readDictionaryBatchFile(file: DictionaryBatchFile): string {
  return readFileSync(file.path, "utf8");
}

export function parseDictionaryBatchFile(file: DictionaryBatchFile): {
  rows: ImportRow[];
  errors: ImportRowError[];
  preview: ImportPreview;
} {
  const parsed = parseImportCsv(readDictionaryBatchFile(file));
  const preview = analyzeImport(
    parsed.rows,
    liveKnowledgeView(),
    parsed.errors,
  );
  return { ...parsed, preview };
}

function emptyConfidenceDistribution(): Record<ConfidenceLevel, number> {
  const out = {} as Record<ConfidenceLevel, number>;
  for (const confidence of CONFIDENCE_LEVELS) out[confidence] = 0;
  return out;
}

function pct(part: number, total: number): number {
  return total === 0 ? 100 : Math.round((part / total) * 100);
}

function isAmbiguousAbbreviation(name: string): boolean {
  const compact = normalize(name);
  return compact.length > 0 && compact.length <= 3;
}

export function buildDictionaryBatchSummary(
  files = listDictionaryBatchFiles(),
): DictionaryBatchQualitySummary {
  const byCategory: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byConfidence = emptyConfidenceDistribution();
  const rowsWithCategory: { row: ImportRow; category: string }[] = [];
  const allErrors: ImportRowError[] = [];
  const fileSummaries: DictionaryBatchFileSummary[] = [];

  for (const file of files) {
    const { rows, errors, preview } = parseDictionaryBatchFile(file);
    allErrors.push(...errors);
    fileSummaries.push({
      fileName: file.fileName,
      category: file.category,
      rowsParsed: preview.rowsParsed,
      parseErrors: preview.parseErrors,
      newIngredients: preview.newIngredients,
      newMappings: preview.newMappings,
      duplicates: preview.duplicates,
      conflicts: preview.conflicts.length,
      missingSources: preview.missingSources,
      invalidAtc: preview.invalidAtc,
      copyrightViolations: preview.copyrightViolations,
      wouldSucceed: preview.wouldSucceed,
    });
    for (const row of rows)
      rowsWithCategory.push({ row, category: file.category });
  }

  const rows = rowsWithCategory.map((item) => item.row);
  const combined = analyzeImport(rows, liveKnowledgeView(), allErrors);

  let ukrainianRows = 0;
  let englishRows = 0;
  let latinRows = 0;
  let transliterationRows = 0;
  let atcRows = 0;
  let suspiciousBrandLikeRows = 0;
  let ambiguousAbbreviationRows = 0;

  for (const { row, category } of rowsWithCategory) {
    byCategory[category] = (byCategory[category] ?? 0) + 1;
    bySource[row.sourceId] = (bySource[row.sourceId] ?? 0) + 1;
    byConfidence[row.confidence]++;
    if (
      row.locale.toLowerCase().startsWith("uk") ||
      row.nameType === "ukrainian"
    ) {
      ukrainianRows++;
    }
    if (row.nameType === "english") englishRows++;
    if (row.nameType === "latin") latinRows++;
    if (row.nameType === "transliteration") transliterationRows++;
    if (row.atcCode) atcRows++;
    if (row.nameType === "brand") suspiciousBrandLikeRows++;
    if (isAmbiguousAbbreviation(row.name)) ambiguousAbbreviationRows++;
  }

  const byReviewStatus = emptyReviewDistribution();
  for (const status of Object.keys(byReviewStatus) as ReviewStatus[]) {
    byReviewStatus[status] = combined.reviewDistribution[status];
  }

  return {
    files: files.length,
    totalRows: combined.rowsParsed,
    totalNewIngredients: combined.newIngredients,
    totalNewMappings: combined.newMappings,
    duplicates: combined.duplicates,
    conflicts: combined.conflicts.length,
    parseErrors: combined.parseErrors,
    missingSources: combined.missingSources,
    invalidAtc: combined.invalidAtc,
    copyrightViolations: combined.copyrightViolations,
    ukrainianRows,
    englishRows,
    latinRows,
    transliterationRows,
    atcRows,
    sourceCoveragePct: pct(
      combined.rowsParsed - combined.missingSources,
      combined.rowsParsed,
    ),
    ukrainianCoveragePct: pct(ukrainianRows, combined.rowsParsed),
    atcCoveragePct: pct(atcRows, combined.rowsParsed),
    suspiciousBrandLikeRows,
    ambiguousAbbreviationRows,
    normalizationConflictRows: combined.conflicts.filter(
      (conflict) => conflict.type === "name_multiple_ingredients",
    ).length,
    byCategory,
    byConfidence,
    byReviewStatus,
    bySource,
    fileSummaries,
    wouldSucceed: combined.wouldSucceed,
  };
}
