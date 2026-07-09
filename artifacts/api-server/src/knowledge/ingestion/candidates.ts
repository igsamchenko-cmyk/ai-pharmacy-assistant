import { normalize } from "../../lib/text";
import type { ImportRow } from "../import/format";
import {
  generateTypoCandidates,
  hasCyrillic,
  ingredientIdForInn,
  transliterateUkrainianToLatin,
} from "./transliteration";

export const GENERATED_TRANSLITERATION_SOURCE_ID =
  "project_generated_transliteration";
export const GENERATED_TYPO_SOURCE_ID = "project_generated_typo_candidate";
export const SEARCH_MISS_SOURCE_ID = "project_search_miss_feedback";

export interface CandidateGenerationOptions {
  includeTransliterations?: boolean;
  includeTypos?: boolean;
  typoLimitPerName?: number;
}

export interface CandidateGenerationResult {
  inputRows: number;
  generatedRows: number;
  duplicatesSkipped: number;
  rows: ImportRow[];
  warnings: string[];
}

export interface SearchMissCandidateInput {
  query: string;
  canonicalInn?: string;
  atcCode?: string;
  reason?: string;
}

function dedupeKey(row: ImportRow): string {
  return `${normalize(row.canonicalInn)}::${normalize(row.name)}`;
}

function cloneRow(row: ImportRow, overrides: Partial<ImportRow>): ImportRow {
  return {
    ...row,
    ...overrides,
    atcCode: overrides.atcCode ?? row.atcCode,
    notes: [row.notes, overrides.notes].filter(Boolean).join("; "),
  };
}

export function generateImportCandidates(
  seedRows: readonly ImportRow[],
  options: CandidateGenerationOptions = {},
): CandidateGenerationResult {
  const includeTransliterations = options.includeTransliterations ?? true;
  const includeTypos = options.includeTypos ?? true;
  const typoLimitPerName = options.typoLimitPerName ?? 2;
  const rows: ImportRow[] = [];
  const seen = new Set(seedRows.map(dedupeKey));
  let duplicatesSkipped = 0;

  function push(row: ImportRow) {
    const key = dedupeKey(row);
    if (seen.has(key)) {
      duplicatesSkipped++;
      return;
    }
    seen.add(key);
    rows.push(row);
  }

  for (const row of seedRows) {
    if (includeTransliterations && hasCyrillic(row.name)) {
      const transliteration = transliterateUkrainianToLatin(row.name);
      if (transliteration) {
        push(
          cloneRow(row, {
            name: transliteration,
            locale: "uk-Latn",
            nameType: "transliteration",
            sourceId: GENERATED_TRANSLITERATION_SOURCE_ID,
            confidence: "high",
            notes: "v1.5 deterministic transliteration candidate",
          }),
        );
      }
    }

    if (includeTypos) {
      for (const typo of generateTypoCandidates(row.name, typoLimitPerName)) {
        push(
          cloneRow(row, {
            name: typo,
            locale: hasCyrillic(typo) ? "uk" : row.locale,
            nameType: "typo",
            sourceId: GENERATED_TYPO_SOURCE_ID,
            confidence: "low",
            notes: "v1.5 generated typo candidate; review required",
          }),
        );
      }
    }
  }

  return {
    inputRows: seedRows.length,
    generatedRows: rows.length,
    duplicatesSkipped,
    rows,
    warnings: [
      "Generated typo candidates are never auto-approved by review policy.",
    ],
  };
}

export function searchMissesToImportRows(
  misses: readonly SearchMissCandidateInput[],
): ImportRow[] {
  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  for (const miss of misses) {
    const query = miss.query.trim();
    const canonicalInn = (miss.canonicalInn ?? query).trim();
    if (!query || !canonicalInn) continue;
    const row: ImportRow = {
      ingredientId: ingredientIdForInn(canonicalInn),
      canonicalInn,
      name: query,
      locale: hasCyrillic(query) ? "uk" : "uk-Latn",
      nameType: "typo",
      sourceId: SEARCH_MISS_SOURCE_ID,
      confidence: "low",
      ...(miss.atcCode ? { atcCode: miss.atcCode } : {}),
      notes: `v1.5 search miss candidate; review required${miss.reason ? `; ${miss.reason}` : ""}`,
    };
    const key = dedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows;
}
