/**
 * Import analysis — the dry-run "preview" of a dictionary import.
 *
 * Given parsed rows, this computes everything a reviewer needs before anything
 * touches the knowledge base: how many rows parsed, what is genuinely new, what
 * duplicates or conflicts exist, which sources/ATC codes are invalid, how
 * confidence and review status are distributed, and whether the import would
 * succeed. It is pure — existing knowledge is read via injected lookups so it
 * stays DB-free and unit-testable.
 */
import { normalize } from "../../lib/text";
import { listDictionaryEntries } from "../dictionary";
import { getAtcInfo } from "../atc";
import { isKnownSource } from "../provenance";
import { deriveReviewStatus, emptyReviewDistribution, type ReviewDistribution } from "./review";
import { findCopyrightedSources, type GuardViolation } from "./guard";
import type { ImportRowError } from "./parse";
import {
  CONFIDENCE_LEVELS,
  type ConfidenceLevel,
  type ImportRow,
  type ReviewStatus,
} from "./format";

export type ConflictType =
  | "name_multiple_ingredients"
  | "brand_conflicting_inn"
  | "ingredient_duplicate_name"
  | "atc_unknown_class"
  | "low_confidence_review";

export interface ImportConflict {
  type: ConflictType;
  subject: string;
  detail: string;
}

export type ConfidenceDistribution = Record<ConfidenceLevel, number>;

export interface ImportPreview {
  rowsParsed: number;
  parseErrors: number;
  newIngredients: number;
  newMappings: number;
  duplicates: number;
  conflicts: ImportConflict[];
  missingSources: number;
  invalidAtc: number;
  confidenceDistribution: ConfidenceDistribution;
  reviewDistribution: ReviewDistribution;
  copyrightViolations: number;
  wouldSucceed: boolean;
}

/** Injected view of existing knowledge, so analysis needs no DB. */
export interface KnowledgeView {
  /** normalized existing INNs (canonical ingredients). */
  existingInnKeys: Set<string>;
  /** normalized existing name → normalized INN. */
  existingNameToInn: Map<string, string>;
  /** Is a source key registered? */
  isKnownSource: (key: string) => boolean;
  /** Resolve an ATC code (null when unknown). */
  resolveAtc: (code: string) => boolean;
}

/** Build a KnowledgeView from the live static dictionary/provenance/atc. */
export function liveKnowledgeView(): KnowledgeView {
  const existingInnKeys = new Set<string>();
  const existingNameToInn = new Map<string, string>();
  for (const e of listDictionaryEntries()) {
    const innKey = normalize(e.ingredient.inn);
    existingInnKeys.add(innKey);
    existingNameToInn.set(normalize(e.name), innKey);
  }
  return {
    existingInnKeys,
    existingNameToInn,
    isKnownSource,
    resolveAtc: (code) => getAtcInfo(code) !== null,
  };
}

function emptyConfidenceDistribution(): ConfidenceDistribution {
  const d = {} as ConfidenceDistribution;
  for (const c of CONFIDENCE_LEVELS) d[c] = 0;
  return d;
}

/**
 * Analyze parsed import rows against an existing-knowledge view.
 *
 * `wouldSucceed` is true only when there are no blocking problems: no parse
 * errors, no copyrighted sources, no missing sources, no invalid ATC codes and
 * no hard conflicts (a name pointing at multiple ingredients, or a brand whose
 * INN contradicts known data). Duplicates and low-confidence rows are flagged
 * but do not block — they route through the review queue instead.
 */
export function analyzeImport(
  rows: readonly ImportRow[],
  view: KnowledgeView,
  parseErrors: readonly ImportRowError[] = [],
): ImportPreview {
  const conflicts: ImportConflict[] = [];
  const confidenceDistribution = emptyConfidenceDistribution();
  const reviewDistribution = emptyReviewDistribution();

  const copyrightViolations: GuardViolation[] = findCopyrightedSources(rows);

  // Track what the import itself introduces so "new" is relative to both the
  // existing base and earlier import rows.
  const importInnKeys = new Set<string>();
  const importNameToInn = new Map<string, string>();
  const seenIngredientName = new Set<string>();

  let newIngredients = 0;
  let newMappings = 0;
  let duplicates = 0;
  let missingSources = 0;
  let invalidAtc = 0;

  for (const row of rows) {
    confidenceDistribution[row.confidence]++;

    const innKey = normalize(row.canonicalInn);
    const nameKey = normalize(row.name);

    // New ingredient?
    if (!view.existingInnKeys.has(innKey) && !importInnKeys.has(innKey)) {
      newIngredients++;
    }
    importInnKeys.add(innKey);

    // Source known?
    const unknownSource = !view.isKnownSource(row.sourceId);
    if (unknownSource) missingSources++;

    // Invalid ATC (optional field): provided but unknown class.
    if (row.atcCode && !view.resolveAtc(row.atcCode)) {
      invalidAtc++;
      conflicts.push({
        type: "atc_unknown_class",
        subject: row.atcCode,
        detail: `ATC-код «${row.atcCode}» не належить до відомого класу (${row.name}).`,
      });
    }

    // Conflict: same name → different ingredient (existing or within import).
    const priorInn =
      view.existingNameToInn.get(nameKey) ?? importNameToInn.get(nameKey);
    let hasConflict = false;
    if (priorInn !== undefined && priorInn !== innKey) {
      hasConflict = true;
      conflicts.push({
        type: "name_multiple_ingredients",
        subject: row.name,
        detail: `Назва «${row.name}» вказує на різні діючі речовини.`,
      });
      if (row.nameType === "brand") {
        conflicts.push({
          type: "brand_conflicting_inn",
          subject: row.name,
          detail: `Торгова назва «${row.name}» суперечить відомій діючій речовині.`,
        });
      }
    }

    // Duplicate mapping (same normalized name already known / seen).
    const isDuplicate =
      view.existingNameToInn.has(nameKey) || importNameToInn.has(nameKey);
    if (isDuplicate && !hasConflict) {
      duplicates++;
    } else if (!isDuplicate) {
      newMappings++;
      importNameToInn.set(nameKey, innKey);
    }

    // Duplicate name within the same ingredient (same INN + same name twice).
    const ingName = `${innKey}::${nameKey}`;
    if (seenIngredientName.has(ingName)) {
      conflicts.push({
        type: "ingredient_duplicate_name",
        subject: row.name,
        detail: `Дубльована назва «${row.name}» для «${row.canonicalInn}».`,
      });
    } else {
      seenIngredientName.add(ingName);
    }

    // Low-confidence entries require review.
    if (row.confidence === "low") {
      conflicts.push({
        type: "low_confidence_review",
        subject: row.name,
        detail: `Низька довіра для «${row.name}» — потрібна перевірка.`,
      });
    }

    const status: ReviewStatus = deriveReviewStatus(row, {
      unknownSource,
      hasConflict,
    });
    reviewDistribution[status]++;
  }

  const hardConflicts = conflicts.filter(
    (c) =>
      c.type === "name_multiple_ingredients" ||
      c.type === "brand_conflicting_inn",
  ).length;

  const wouldSucceed =
    parseErrors.length === 0 &&
    copyrightViolations.length === 0 &&
    missingSources === 0 &&
    invalidAtc === 0 &&
    hardConflicts === 0;

  return {
    rowsParsed: rows.length,
    parseErrors: parseErrors.length,
    newIngredients,
    newMappings,
    duplicates,
    conflicts,
    missingSources,
    invalidAtc,
    confidenceDistribution,
    reviewDistribution,
    copyrightViolations: copyrightViolations.length,
    wouldSucceed,
  };
}
