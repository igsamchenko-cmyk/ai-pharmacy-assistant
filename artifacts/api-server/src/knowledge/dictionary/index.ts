import { normalize } from "../../lib/text";
import { ingredientSeeds, type IngredientSeed } from "./ingredients";
import type { NameKind } from "./kinds";
import {
  getSource,
  provenanceForNameKind,
  type Provenance,
} from "../provenance";

/**
 * A canonical ingredient resolved from any of its names. This is what query
 * normalization returns — the pharmacist's typed term (brand, INN, Latin,
 * English) mapped to a single canonical active ingredient.
 */
export interface CanonicalIngredient {
  inn: string;
  latin: string;
  english: string;
  atc: string;
  group: string;
}

export type { NameKind };

export interface DictionaryEntry {
  name: string;
  kind: NameKind;
  ingredient: CanonicalIngredient;
  /** Where this name mapping comes from (v0.3 provenance). */
  provenance: Provenance;
}

function toCanonical(seed: IngredientSeed): CanonicalIngredient {
  return {
    inn: seed.inn,
    latin: seed.latin,
    english: seed.english,
    atc: seed.atc,
    group: seed.group,
  };
}

function collectNames(
  seed: IngredientSeed,
): { name: string; kind: NameKind; provenance?: Provenance }[] {
  const sourced = (name: string) => seed.nameProvenance?.[name];
  const out: { name: string; kind: NameKind; provenance?: Provenance }[] = [
    { name: seed.inn, kind: "inn", provenance: sourced(seed.inn) },
    { name: seed.latin, kind: "latin", provenance: sourced(seed.latin) },
    { name: seed.english, kind: "english", provenance: sourced(seed.english) },
  ];
  for (const brand of seed.brands) {
    const name = brand.trim();
    out.push({ name, kind: "brand", provenance: sourced(name) });
  }
  for (const synonym of seed.synonyms ?? []) {
    const name = synonym.trim();
    out.push({ name, kind: "synonym", provenance: sourced(name) });
  }
  return out;
}

// Build the flattened name → entry index once at module load. Keys are
// normalized (trimmed + lowercased). Later duplicates for the same normalized
// name are ignored so the earliest (most canonical) mapping wins.
const entries: DictionaryEntry[] = [];
const byName = new Map<string, DictionaryEntry>();

for (const seed of ingredientSeeds) {
  const ingredient = toCanonical(seed);
  for (const { name, kind, provenance } of collectNames(seed)) {
    if (name === "") continue;
    const key = normalize(name);
    if (key === "" || byName.has(key)) continue;
    const entry: DictionaryEntry = {
      name,
      kind,
      ingredient,
      provenance: provenance ?? provenanceForNameKind(kind),
    };
    byName.set(key, entry);
    entries.push(entry);
  }
}

const MIN_FUZZY_QUERY_LENGTH = 6;

function isSingleEditOrAdjacentTransposition(
  left: string,
  right: string,
): boolean {
  const a = Array.from(left);
  const b = Array.from(right);
  if (Math.abs(a.length - b.length) > 1 || left === right) return false;

  if (a.length === b.length) {
    const differences: number[] = [];
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) differences.push(index);
      if (differences.length > 2) return false;
    }
    if (differences.length === 1) return true;
    if (differences.length !== 2) return false;
    const [first, second] = differences;
    return (
      second === first + 1 && a[first] === b[second] && a[second] === b[first]
    );
  }

  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  let shortIndex = 0;
  let longIndex = 0;
  let skipped = false;
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    longIndex += 1;
  }
  return true;
}

/**
 * Resolve only one-edit queries whose candidates all identify the same
 * canonical ingredient. No typo is stored or promoted to an approved alias.
 */
export function findUniqueSingleEditDictionaryMatch(
  normalizedQuery: string,
  candidates: Iterable<readonly [string, DictionaryEntry]>,
): DictionaryEntry | null {
  if (Array.from(normalizedQuery).length < MIN_FUZZY_QUERY_LENGTH) return null;
  const matches: DictionaryEntry[] = [];
  for (const [candidateName, entry] of candidates) {
    if (
      Array.from(candidateName).length >= MIN_FUZZY_QUERY_LENGTH &&
      isSingleEditOrAdjacentTransposition(normalizedQuery, candidateName)
    ) {
      matches.push(entry);
    }
  }
  const ingredientKeys = new Set(
    matches.map((entry) => normalize(entry.ingredient.inn)),
  );
  return ingredientKeys.size === 1 ? (matches[0] ?? null) : null;
}

function isSourceBackedEntry(entry: DictionaryEntry): boolean {
  const source = getSource(entry.provenance.sourceKey);
  return Boolean(
    source &&
    source.type !== "demo" &&
    source.reliability !== "low" &&
    (entry.provenance.evidenceLevel === "established" ||
      entry.provenance.evidenceLevel === "reference"),
  );
}

/**
 * Resolve a catalog alias only from source-backed dictionary entries. Unlike
 * normalizeQuery, this deliberately skips substring matching and demo data so
 * an unrelated word containing a short brand cannot expand into a medicine.
 */
export function resolveSourceBackedDictionaryQuery(
  query: string,
): DictionaryEntry | null {
  const key = normalize(query);
  if (key === "") return null;
  const exact = byName.get(key);
  if (exact && isSourceBackedEntry(exact)) return exact;
  return findUniqueSingleEditDictionaryMatch(
    key,
    [...byName].filter(
      ([, entry]) =>
        entry.kind !== "synonym" && isSourceBackedEntry(entry),
    ),
  );
}

/**
 * Normalize a free-text query to its canonical ingredient. Tries an exact
 * (normalized) match first, then a substring match so partial brand names still
 * resolve. Returns null when nothing matches.
 */
export function normalizeQuery(query: string): DictionaryEntry | null {
  const key = normalize(query);
  if (key === "") return null;
  const exact = byName.get(key);
  if (exact) return exact;
  // Fall back to substring: the query contains a known name, or a known name
  // contains the query (min 3 chars to avoid noise).
  if (key.length >= 3) {
    for (const [name, entry] of byName) {
      if (key.includes(name) || name.includes(key)) return entry;
    }
  }
  return findUniqueSingleEditDictionaryMatch(
    key,
    [...byName].filter(([, entry]) => entry.kind !== "synonym"),
  );
}

/** All dictionary entries (name mappings). */
export function listDictionaryEntries(): readonly DictionaryEntry[] {
  return entries;
}

export interface DictionaryStats {
  ingredients: number;
  mappings: number;
  byKind: Record<NameKind, number>;
}

const stats: DictionaryStats = (() => {
  const byKind: Record<NameKind, number> = {
    inn: 0,
    latin: 0,
    english: 0,
    brand: 0,
    synonym: 0,
  };
  for (const e of entries) byKind[e.kind]++;
  const ingredients = new Set(ingredientSeeds.map((s) => normalize(s.inn)))
    .size;
  return { ingredients, mappings: entries.length, byKind };
})();

export function getDictionaryStats(): DictionaryStats {
  return stats;
}

export type { IngredientSeed } from "./ingredients";
