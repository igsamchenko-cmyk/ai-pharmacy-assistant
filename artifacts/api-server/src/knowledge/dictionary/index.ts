import { normalize } from "../../lib/text";
import { ingredientSeeds, type IngredientSeed } from "./ingredients";
import type { NameKind } from "./kinds";
import { provenanceForNameKind, type Provenance } from "../provenance";

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

function collectNames(seed: IngredientSeed): { name: string; kind: NameKind }[] {
  const out: { name: string; kind: NameKind }[] = [
    { name: seed.inn, kind: "inn" },
    { name: seed.latin, kind: "latin" },
    { name: seed.english, kind: "english" },
  ];
  for (const b of seed.brands) out.push({ name: b.trim(), kind: "brand" });
  for (const s of seed.synonyms ?? []) out.push({ name: s.trim(), kind: "synonym" });
  return out;
}

// Build the flattened name → entry index once at module load. Keys are
// normalized (trimmed + lowercased). Later duplicates for the same normalized
// name are ignored so the earliest (most canonical) mapping wins.
const entries: DictionaryEntry[] = [];
const byName = new Map<string, DictionaryEntry>();

for (const seed of ingredientSeeds) {
  const ingredient = toCanonical(seed);
  for (const { name, kind } of collectNames(seed)) {
    if (name === "") continue;
    const key = normalize(name);
    if (key === "" || byName.has(key)) continue;
    const entry: DictionaryEntry = {
      name,
      kind,
      ingredient,
      provenance: provenanceForNameKind(kind),
    };
    byName.set(key, entry);
    entries.push(entry);
  }
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
  return null;
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
  const ingredients = new Set(ingredientSeeds.map((s) => normalize(s.inn))).size;
  return { ingredients, mappings: entries.length, byKind };
})();

export function getDictionaryStats(): DictionaryStats {
  return stats;
}

export type { IngredientSeed } from "./ingredients";
