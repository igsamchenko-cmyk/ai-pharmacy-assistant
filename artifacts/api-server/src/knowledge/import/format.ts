/**
 * Canonical dictionary import format (v0.4).
 *
 * A single, auditable row format shared by CSV and JSON imports. One row is one
 * name → ingredient mapping candidate, carrying its locale, how the name is used
 * (`name_type`), the source it comes from and a confidence level. Everything is
 * plain data so parsing, validation and preview stay pure and testable — no DB,
 * no fs, no network.
 *
 * This format is intentionally strict: imports feed the medical knowledge base,
 * so unknown fields, unknown enums and missing provenance are rejected rather
 * than silently coerced.
 */

/** How an imported name is used. Superset of the runtime dictionary NameKind. */
export const NAME_TYPES = [
  "brand",
  "generic",
  "synonym",
  "transliteration",
  "typo",
  "latin",
  "english",
  "ukrainian",
] as const;
export type NameType = (typeof NAME_TYPES)[number];

/** Confidence an import row carries. `verified` is the only auto-approvable level. */
export const CONFIDENCE_LEVELS = ["low", "medium", "high", "verified"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/** Review lifecycle for an imported row. Suspicious rows are never auto-approved. */
export const REVIEW_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "needs_review",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/**
 * A fully-parsed, well-typed import row. `atcCode` and `notes` are optional;
 * everything else is required. Field names are camelCase in code; the on-disk
 * CSV/JSON uses the snake_case column names in {@link IMPORT_COLUMNS}.
 */
export interface ImportRow {
  ingredientId: string;
  canonicalInn: string;
  name: string;
  locale: string;
  nameType: NameType;
  sourceId: string;
  confidence: ConfidenceLevel;
  atcCode?: string;
  notes?: string;
}

/** Canonical CSV column order / JSON key names (snake_case on disk). */
export const IMPORT_COLUMNS = [
  "ingredient_id",
  "canonical_inn",
  "name",
  "locale",
  "name_type",
  "source_id",
  "confidence",
  "atc_code",
  "notes",
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** Columns that must be present and non-empty on every row. */
export const REQUIRED_COLUMNS: readonly ImportColumn[] = [
  "ingredient_id",
  "canonical_inn",
  "name",
  "locale",
  "name_type",
  "source_id",
  "confidence",
];

export function isNameType(v: string): v is NameType {
  return (NAME_TYPES as readonly string[]).includes(v);
}

export function isConfidenceLevel(v: string): v is ConfidenceLevel {
  return (CONFIDENCE_LEVELS as readonly string[]).includes(v);
}

/** Map an import `name_type` to the runtime dictionary NameKind for merging. */
export function nameTypeToKind(
  t: NameType,
): "inn" | "latin" | "english" | "brand" | "synonym" {
  switch (t) {
    case "brand":
      return "brand";
    case "latin":
      return "latin";
    case "english":
      return "english";
    case "ukrainian":
    case "generic":
      return "inn";
    case "synonym":
    case "transliteration":
    case "typo":
      return "synonym";
  }
}
