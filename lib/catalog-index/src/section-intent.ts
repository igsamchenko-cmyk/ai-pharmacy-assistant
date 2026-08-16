import { normalizeCatalogSearchTokenText } from "./index";

/**
 * Section-navigation intent keys, per FarmAssist spec "Інструкції v4" H.2.
 *
 * The spec's original dictionary (H.2.1) enumerates 9 groups against a
 * 19-key section model, including "children"/"Діти". This repository's
 * instruction pipeline (PR-G, reconciled) ships a 9-key section model
 * (`indications, contraindications, adverseReactions, interactions,
 * specialWarnings, pregnancyAndLactation, administration, overdose,
 * storage` -- see `INSTRUCTION_SECTION_LABELS` in
 * `artifacts/pharmacy/src/pages/drug-instruction.tsx`) that has no
 * "children" section at all. The "діти|дитяч|дітям" keyword group is
 * therefore intentionally omitted here: there is no section for it to land
 * on. The remaining 8 groups map onto 7 of the 9 existing keys 1:1
 * (nothing maps onto `specialWarnings`, which the spec's dictionary never
 * mentioned either).
 */
export type CatalogSectionIntentKey =
  | "indications"
  | "contraindications"
  | "adverseReactions"
  | "interactions"
  | "pregnancyAndLactation"
  | "administration"
  | "overdose"
  | "storage";

export interface CatalogSectionIntentGroup {
  readonly sectionKey: CatalogSectionIntentKey;
  /** A token matches this group when it STARTS WITH any of these prefixes. */
  readonly prefixes: readonly string[];
}

/**
 * Section keyword dictionary, kept as a standalone data file with its own
 * tests per spec rule 4 ("Правила для агента"): "Словники ... тільки
 * окремими файлами даних з тестами; не хардкодити в логіці."
 *
 * Prefixes are short Ukrainian roots (not full example words) so a single
 * entry matches multiple inflected forms via `token.startsWith(prefix)`,
 * consistent with H.2.1's "збіг за префіксом токена."
 */
export const CATALOG_SECTION_INTENT_DICTIONARY: readonly CatalogSectionIntentGroup[] =
  [
    { sectionKey: "indications", prefixes: ["показ"] },
    { sectionKey: "administration", prefixes: ["доз", "прийма"] },
    {
      sectionKey: "pregnancyAndLactation",
      prefixes: ["вагітн", "лактац", "годуван"],
    },
    { sectionKey: "contraindications", prefixes: ["протипоказ"] },
    { sectionKey: "adverseReactions", prefixes: ["побічн"] },
    { sectionKey: "interactions", prefixes: ["взаємод", "сумісн"] },
    { sectionKey: "storage", prefixes: ["зберіга"] },
    { sectionKey: "overdose", prefixes: ["передозув"] },
  ];

export interface CatalogSectionIntentExtraction {
  /** Query to run through the unmodified name-matching pipeline. */
  query: string;
  sectionIntent?: CatalogSectionIntentKey;
}

function sectionKeyForToken(token: string): CatalogSectionIntentKey | null {
  for (const group of CATALOG_SECTION_INTENT_DICTIONARY) {
    if (group.prefixes.some((prefix) => token.startsWith(prefix))) {
      return group.sectionKey;
    }
  }
  return null;
}

/**
 * Extracts a section-navigation intent from a catalog search query.
 *
 * Tokens matching a section keyword are removed from the query so the
 * remaining tokens run through the unmodified v2 name-matching pipeline --
 * per the H.2.4 safety invariant, section intent NEVER affects product
 * ranking or which candidates are found; it only changes the landing point
 * after an explicit click.
 *
 * If stripping matched tokens would leave nothing to search a product name
 * by (the query IS the section keyword, e.g. "показання" alone), no intent
 * is extracted and the original query passes through completely untouched
 * -- there is no product identity to land on (H.4: "Запит лише з
 * секційного слова ... → звичайний пошук без інтенту").
 *
 * A query with fewer than two tokens can never split into "name" + "section
 * keyword", so it short-circuits immediately and is guaranteed byte-for-byte
 * identical to the original query -- this keeps every existing single-word
 * search (the overwhelming majority) provably unaffected.
 */
export function extractCatalogSectionIntent(
  rawQuery: string,
): CatalogSectionIntentExtraction {
  const tokens = normalizeCatalogSearchTokenText(rawQuery)
    .split(" ")
    .filter(Boolean);
  if (tokens.length < 2) return { query: rawQuery };

  let sectionIntent: CatalogSectionIntentKey | undefined;
  const remaining: string[] = [];
  for (const token of tokens) {
    const matched = sectionKeyForToken(token);
    if (matched) {
      if (!sectionIntent) sectionIntent = matched;
      continue;
    }
    remaining.push(token);
  }
  if (!sectionIntent || !remaining.length) return { query: rawQuery };
  return { query: remaining.join(" "), sectionIntent };
}
