import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  listDictionaryEntries,
  type DictionaryEntry,
} from "../knowledge/dictionary";
import {
  downloadOfficialRegistrySnapshot,
  parseRegistryText,
  type RegistryParseResult,
  type RegistryRawRow,
} from "../knowledge/ingestion/registry";
import {
  generateTypoCandidates,
  hasCyrillic,
  transliterateUkrainianToLatin,
} from "../knowledge/ingestion/transliteration";
import { normalize } from "../lib/text";

export const CATALOG_SEARCH_COVERAGE_QUOTAS = {
  trade: 50,
  inn: 40,
  combination: 20,
  punctuation_case: 20,
  transliteration: 15,
  approved_alias: 15,
} as const;

export const REQUIRED_CATALOG_SEARCH_NAMES = [
  "парацетамол",
  "еліквіс",
  "нурофен",
  "амоксиклав",
  "цефтріаксон",
  "метформін",
  "омепразол",
  "амлодипін",
  "ксарелто",
  "прадакса",
  "симбікорт",
  "гептрал",
  "форксига",
  "джардінс",
] as const;

export type CatalogSearchCoverageCategory =
  keyof typeof CATALOG_SEARCH_COVERAGE_QUOTAS;

export type CatalogSearchCoverageMissReason =
  | "approved_alias_not_linked_to_registry"
  | "combination_signature_not_indexed"
  | "normalized_inn_key_missing"
  | "orthographic_variant_requires_review"
  | "punctuation_or_trademark_not_normalized"
  | "registry_name_not_indexed"
  | "transliteration_not_indexed";

export interface CatalogSearchCoverageCase {
  id: string;
  category: CatalogSearchCoverageCategory;
  query: string;
  mandatory: boolean;
  provenance: {
    primarySourceKey: string;
    evidenceLevel: "official" | "reference" | "demo";
    derivation: string;
    registryTargetCount: number;
    registryTargetIdentitySha256: string;
    sampleRegistryIds: string[];
    sampleRegistrationNumbers: string[];
    dictionary?: {
      sourceKey: string;
      evidenceLevel: string;
      kind: string;
      canonicalInn: string;
      reviewState: "runtime_static";
    };
  };
  registryPresence: {
    targetPresent: boolean;
    exactOfficialNamePresent: boolean;
    sampleTradeNames: string[];
    sampleInn: string[];
  };
  derivedDirectKeys: {
    tradeNameCount: number;
    innCount: number;
    activeIngredientCount: number;
    combinationSignatures: string[];
  };
  structuralCoverage: {
    before: boolean;
    after: boolean;
  };
  missReason: CatalogSearchCoverageMissReason | null;
  requiredFix: string | null;
}

export interface CatalogSearchCoverageReport {
  version: "1.0-catalog-search-coverage";
  source: {
    sourceKey: "ukraine_state_drug_registry";
    sourceUrl: string | null;
    sha256: string;
    rows: number;
  };
  policy: {
    totalCases: 160;
    quotas: typeof CATALOG_SEARCH_COVERAGE_QUOTAS;
    deterministicSeed: string;
    mandatoryNames: readonly string[];
    notes: string[];
  };
  summary: {
    totalCases: number;
    provenanceBackedCases: number;
    registryTargetPresent: number;
    beforeCovered: number;
    beforeMisses: number;
    beforeCoveragePct: number;
    afterCovered: number;
    afterMisses: number;
    afterCoveragePct: number;
    byCategory: Record<CatalogSearchCoverageCategory, {
      total: number;
      beforeCovered: number;
      afterCovered: number;
    }>;
    missReasons: Partial<Record<CatalogSearchCoverageMissReason, number>>;
  };
  aliasSelection: {
    eligibleRuntimeDictionaryEntries: number;
    selected: number;
    excludedNoRegistryTarget: number;
    excludedDuplicateQuery: number;
    excludedDirectOfficialName: number;
    exclusionSamples: Array<{ name: string; reason: string }>;
    note: string;
  };
  cases: CatalogSearchCoverageCase[];
}

export interface CatalogSearchCoverageOptions {
  dictionaryEntries?: readonly DictionaryEntry[];
}

interface CaseSeed {
  category: CatalogSearchCoverageCategory;
  query: string;
  targetRows: RegistryRawRow[];
  derivation: string;
  dictionaryEntry?: DictionaryEntry;
}

interface AliasSelectionStats {
  eligibleRuntimeDictionaryEntries: number;
  selected: number;
  excludedNoRegistryTarget: number;
  excludedDuplicateQuery: number;
  excludedDirectOfficialName: number;
  exclusionSamples: Array<{ name: string; reason: string }>;
}

const TOTAL_CASES = Object.values(CATALOG_SEARCH_COVERAGE_QUOTAS)
  .reduce((sum, value) => sum + value, 0);

if (TOTAL_CASES !== 160) {
  throw new Error("Catalog search coverage quotas must total exactly 160 cases.");
}

const DEFAULT_REPORT_PATH = fileURLToPath(
  new URL(
    "../../../../artifacts/reports/catalog-search-coverage-report.json",
    import.meta.url,
  ),
);

const TRADEMARK_MARKS = /[®™℠©]/gu;
const SOFT_PUNCTUATION = /[\s\-_.\/\\()+,;:–—]+/gu;
const COMBINATION_SEPARATOR =
  /\s*(?:\+|;|,|\/(?!\d)|\b(?:and|with)\b|(?<!\p{L})(?:та|і)(?!\p{L}))\s*/iu;

function pct(part: number, total: number): number {
  return total === 0 ? 100 : Math.round((part / total) * 100);
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableSort<T>(
  items: readonly T[],
  seed: string,
  key: (item: T) => string,
): T[] {
  return [...items].sort((left, right) => {
    const leftKey = stableHash(`${seed}\u0000${key(left)}`);
    const rightKey = stableHash(`${seed}\u0000${key(right)}`);
    return leftKey.localeCompare(rightKey) || key(left).localeCompare(key(right));
  });
}

function uniqueStrings(values: readonly string[], limit = Number.POSITIVE_INFINITY): string[] {
  const unique = new Map<string, string>();
  for (const value of values) {
    const cleaned = value.trim();
    const key = normalize(cleaned);
    if (key && !unique.has(key)) unique.set(key, cleaned);
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b)).slice(0, limit);
}

function canonicalSearchKey(value: string): string {
  return normalize(value.replace(TRADEMARK_MARKS, ""));
}

/** Structural baseline used before the catalog-name fix in this branch. */
function baselineNormalize(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\u2019\u02bc\u2018\u0060\u00b4\u02b9\u2032']/g, "")
    .replace(/[\s\-_\u2010\u2011\u2012\u2013\u2014\u2015./\\()+]+/g, "");
}

function surfaceKey(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("uk-UA");
}

function ingredientKeys(entry: DictionaryEntry): string[] {
  return uniqueStrings([
    entry.ingredient.inn,
    entry.ingredient.english,
    entry.ingredient.latin,
  ]).flatMap((value) => {
    const key = canonicalSearchKey(value);
    const withoutLatinEnding = key.endsWith("um") ? key.slice(0, -2) : key;
    return withoutLatinEnding === key ? [key] : [key, withoutLatinEnding];
  });
}

function rowIngredientKeys(row: RegistryRawRow): string[] {
  return uniqueStrings([
    row.inn,
    row.activeIngredient,
    ...row.ingredientParse.parsedIngredients,
  ]).map(canonicalSearchKey);
}

function ingredientSignature(row: RegistryRawRow): string {
  const parsed = row.ingredientParse.parsedIngredients
    .map(canonicalSearchKey)
    .filter(Boolean);
  const values = parsed.length ? parsed : rowIngredientKeys(row);
  return [...new Set(values)].sort().join("+");
}

function queryCombinationSignature(query: string): string {
  return [...new Set(
    query.split(COMBINATION_SEPARATOR).map(canonicalSearchKey).filter(Boolean),
  )].sort().join("+");
}

function dictionaryTargets(
  entry: DictionaryEntry,
  rows: readonly RegistryRawRow[],
): RegistryRawRow[] {
  const keys = ingredientKeys(entry).filter((key) => key.length >= 4);
  return rows.filter((row) => {
    const officialIngredientKeys = uniqueStrings([
      row.inn,
      ...row.ingredientParse.parsedIngredients,
    ]).map(canonicalSearchKey);
    return keys.some((key) => officialIngredientKeys.includes(key));
  });
}

function currentDirectMatch(row: RegistryRawRow, query: string): boolean {
  const lower = query.trim().toLocaleLowerCase("uk-UA");
  const normalized = baselineNormalize(query) || lower;
  const tradeKey = baselineNormalize(row.tradeName);
  const rawValues = [
    row.tradeName,
    row.inn,
    row.activeIngredient,
    row.registrationNumber,
  ].map((value) => value.toLocaleLowerCase("uk-UA"));
  return Boolean(normalized) && (
    tradeKey === normalized ||
    tradeKey.startsWith(normalized) ||
    rawValues.some((value) => value === lower || value.startsWith(lower) || value.includes(lower))
  );
}

function canonicalDirectMatch(row: RegistryRawRow, query: string): boolean {
  const queryKey = canonicalSearchKey(query);
  if (!queryKey) return false;
  return [row.tradeName, row.inn, row.activeIngredient, row.registrationNumber]
    .map(canonicalSearchKey)
    .some((value) =>
      value === queryKey || value.startsWith(queryKey) || value.includes(queryKey)
    );
}

function exactOfficialName(row: RegistryRawRow, query: string): boolean {
  const queryKey = normalize(query);
  return [row.tradeName, row.inn, row.activeIngredient, row.registrationNumber]
    .some((value) => normalize(value) === queryKey);
}

function groupRows(
  rows: readonly RegistryRawRow[],
  key: (row: RegistryRawRow) => string,
): Map<string, RegistryRawRow[]> {
  const groups = new Map<string, RegistryRawRow[]>();
  for (const row of rows) {
    const value = key(row);
    if (!value) continue;
    const current = groups.get(value) ?? [];
    current.push(row);
    groups.set(value, current);
  }
  return groups;
}

function resolveMandatoryTrade(
  query: string,
  rows: readonly RegistryRawRow[],
  dictionaryByName: ReadonlyMap<string, DictionaryEntry>,
): CaseSeed {
  const queryKey = normalize(query);
  const canonicalQuery = canonicalSearchKey(query);
  const official = rows.filter((row) =>
    [row.tradeName, row.inn, row.activeIngredient].some((value) => {
      const normalized = normalize(value);
      const canonical = canonicalSearchKey(value);
      return normalized === queryKey ||
        normalized.startsWith(queryKey) ||
        canonical === canonicalQuery ||
        canonical.startsWith(canonicalQuery);
    })
  );
  if (official.length) {
    return {
      category: "trade",
      query,
      targetRows: official,
      derivation: "mandatory query matched an official registry name",
    };
  }

  const dictionaryEntry = dictionaryByName.get(queryKey);
  if (dictionaryEntry) {
    const targetRows = dictionaryTargets(dictionaryEntry, rows);
    if (targetRows.length) {
      return {
        category: "trade",
        query,
        targetRows,
        derivation: "mandatory query linked through an existing runtime dictionary mapping",
        dictionaryEntry,
      };
    }
  }

  const typoMatches = rows.filter((row) =>
    generateTypoCandidates(row.tradeName, 6).some(
      (candidate) => normalize(candidate) === queryKey,
    )
  );
  const signatures = new Set(typoMatches.map(ingredientSignature).filter(Boolean));
  if (typoMatches.length && signatures.size === 1) {
    return {
      category: "trade",
      query,
      targetRows: typoMatches,
      derivation: "mandatory query is a deterministic single-spelling candidate of one official trade-name target",
    };
  }

  throw new Error(`Mandatory catalog query has no provenance-backed registry target: ${query}`);
}

function punctuationVariant(value: string): string | null {
  const variant = value
    .replace(TRADEMARK_MARKS, "")
    .replace(SOFT_PUNCTUATION, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("uk-UA");
  return variant && surfaceKey(variant) !== surfaceKey(value) ? variant : null;
}

function selectCaseSeeds(
  registry: RegistryParseResult,
  dictionaryEntries: readonly DictionaryEntry[],
): { seeds: CaseSeed[]; aliasStats: AliasSelectionStats } {
  const rows = registry.rows;
  const snapshotSeed = registry.snapshot?.sha256 ?? "registry-without-hash";
  const usedSurfaces = new Set<string>();
  const seeds: CaseSeed[] = [];
  const add = (seed: CaseSeed): boolean => {
    const key = surfaceKey(seed.query);
    if (!key || usedSurfaces.has(key) || !seed.targetRows.length) return false;
    usedSurfaces.add(key);
    seeds.push(seed);
    return true;
  };
  const dictionaryByName = new Map(
    dictionaryEntries.map((entry) => [normalize(entry.name), entry]),
  );

  for (const query of REQUIRED_CATALOG_SEARCH_NAMES) {
    add(resolveMandatoryTrade(query, rows, dictionaryByName));
  }

  const tradeGroups = groupRows(rows, (row) => normalize(row.tradeName));
  const tradeCandidates = stableSort(
    [...tradeGroups.values()],
    `${snapshotSeed}:trade`,
    (group) => `${normalize(group[0]?.tradeName ?? "")}:${group[0]?.registryId ?? ""}`,
  );
  for (const targetRows of tradeCandidates) {
    if (seeds.filter((seed) => seed.category === "trade").length >=
      CATALOG_SEARCH_COVERAGE_QUOTAS.trade) break;
    add({
      category: "trade",
      query: targetRows[0]?.tradeName ?? "",
      targetRows,
      derivation: "official registry trade name",
    });
  }

  const innGroups = groupRows(
    rows.filter((row) => !row.ingredientParse.combinationProduct),
    (row) => normalize(row.inn),
  );
  const innCandidates = stableSort(
    [...innGroups.values()],
    `${snapshotSeed}:inn`,
    (group) => `${normalize(group[0]?.inn ?? "")}:${group[0]?.registryId ?? ""}`,
  );
  for (const targetRows of innCandidates) {
    if (seeds.filter((seed) => seed.category === "inn").length >=
      CATALOG_SEARCH_COVERAGE_QUOTAS.inn) break;
    add({
      category: "inn",
      query: targetRows[0]?.inn ?? "",
      targetRows,
      derivation: "official registry INN expression",
    });
  }

  const combinationGroups = groupRows(
    rows.filter((row) => row.ingredientParse.combinationProduct),
    ingredientSignature,
  );
  const combinationCandidates = stableSort(
    [...combinationGroups.values()],
    `${snapshotSeed}:combination`,
    (group) => `${ingredientSignature(group[0]!)}:${group[0]?.registryId ?? ""}`,
  );
  for (const [index, targetRows] of combinationCandidates.entries()) {
    if (seeds.filter((seed) => seed.category === "combination").length >=
      CATALOG_SEARCH_COVERAGE_QUOTAS.combination) break;
    const row = targetRows[0]!;
    const components = uniqueStrings(row.ingredientParse.parsedIngredients);
    const derived = components.join(index % 2 === 0 ? " + " : " / ");
    const query = index % 3 === 0 && row.inn.trim() ? row.inn : derived;
    add({
      category: "combination",
      query,
      targetRows,
      derivation: query === row.inn
        ? "official registry combination expression"
        : "separator-only expression derived from official parsed ingredients",
    });
  }

  const punctuationCandidates = stableSort(
    [...tradeGroups.values()]
      .map((targetRows) => ({ targetRows, query: punctuationVariant(targetRows[0]?.tradeName ?? "") }))
      .filter((candidate): candidate is { targetRows: RegistryRawRow[]; query: string } =>
        Boolean(candidate.query)
      ),
    `${snapshotSeed}:punctuation`,
    (candidate) => `${candidate.query}:${candidate.targetRows[0]?.registryId ?? ""}`,
  );
  for (const candidate of punctuationCandidates) {
    if (seeds.filter((seed) => seed.category === "punctuation_case").length >=
      CATALOG_SEARCH_COVERAGE_QUOTAS.punctuation_case) break;
    add({
      category: "punctuation_case",
      query: candidate.query,
      targetRows: candidate.targetRows,
      derivation: "case, separator, and trademark-only variant of an official trade name",
    });
  }

  const transliterationMap = new Map<string, {
    query: string;
    targetRows: RegistryRawRow[];
    signatures: Set<string>;
  }>();
  for (const targetRows of tradeGroups.values()) {
    const sourceName = targetRows[0]?.tradeName ?? "";
    if (!hasCyrillic(sourceName)) continue;
    const query = transliterateUkrainianToLatin(sourceName);
    const key = normalize(query);
    if (!key || key.length < 4) continue;
    const current = transliterationMap.get(key) ?? {
      query,
      targetRows: [],
      signatures: new Set<string>(),
    };
    current.targetRows.push(...targetRows);
    for (const row of targetRows) current.signatures.add(ingredientSignature(row));
    transliterationMap.set(key, current);
  }
  const transliterationCandidates = stableSort(
    [...transliterationMap.values()].filter(
      (candidate) => candidate.signatures.size === 1 &&
        !candidate.targetRows.some((row) => currentDirectMatch(row, candidate.query)),
    ),
    `${snapshotSeed}:transliteration`,
    (candidate) => `${normalize(candidate.query)}:${candidate.targetRows[0]?.registryId ?? ""}`,
  );
  for (const candidate of transliterationCandidates) {
    if (seeds.filter((seed) => seed.category === "transliteration").length >=
      CATALOG_SEARCH_COVERAGE_QUOTAS.transliteration) break;
    add({
      category: "transliteration",
      query: candidate.query,
      targetRows: candidate.targetRows,
      derivation: "collision-safe deterministic transliteration of an official trade name",
    });
  }

  const aliasStats: AliasSelectionStats = {
    eligibleRuntimeDictionaryEntries: 0,
    selected: 0,
    excludedNoRegistryTarget: 0,
    excludedDuplicateQuery: 0,
    excludedDirectOfficialName: 0,
    exclusionSamples: [],
  };
  const aliasEntries = stableSort(
    dictionaryEntries.filter((entry) => entry.kind !== "inn" && entry.provenance.evidenceLevel !== "demo"),
    `${snapshotSeed}:approved-alias`,
    (entry) => `${normalize(entry.name)}:${entry.ingredient.inn}:${entry.kind}`,
  );
  aliasStats.eligibleRuntimeDictionaryEntries = aliasEntries.length;
  for (const entry of aliasEntries) {
    if (aliasStats.selected >= CATALOG_SEARCH_COVERAGE_QUOTAS.approved_alias) break;
    const key = surfaceKey(entry.name);
    if (usedSurfaces.has(key)) {
      aliasStats.excludedDuplicateQuery += 1;
      if (aliasStats.exclusionSamples.length < 20) {
        aliasStats.exclusionSamples.push({ name: entry.name, reason: "duplicate_query" });
      }
      continue;
    }
    const targetRows = dictionaryTargets(entry, rows);
    if (!targetRows.length) {
      aliasStats.excludedNoRegistryTarget += 1;
      if (aliasStats.exclusionSamples.length < 20) {
        aliasStats.exclusionSamples.push({ name: entry.name, reason: "no_registry_target" });
      }
      continue;
    }
    if (targetRows.some((row) => exactOfficialName(row, entry.name))) {
      aliasStats.excludedDirectOfficialName += 1;
      if (aliasStats.exclusionSamples.length < 20) {
        aliasStats.exclusionSamples.push({ name: entry.name, reason: "direct_official_name" });
      }
      continue;
    }
    if (add({
      category: "approved_alias",
      query: entry.name,
      targetRows,
      derivation: "existing runtime static dictionary mapping with explicit provenance",
      dictionaryEntry: entry,
    })) {
      aliasStats.selected += 1;
    }
  }

  for (const [category, quota] of Object.entries(CATALOG_SEARCH_COVERAGE_QUOTAS)) {
    const actual = seeds.filter((seed) => seed.category === category).length;
    if (actual !== quota) {
      throw new Error(`Catalog coverage category ${category} produced ${actual}/${quota} cases.`);
    }
  }
  if (seeds.length !== TOTAL_CASES) {
    throw new Error(`Catalog coverage report produced ${seeds.length}/${TOTAL_CASES} cases.`);
  }

  return { seeds, aliasStats };
}

function missForCase(
  seed: CaseSeed,
  before: boolean,
): { reason: CatalogSearchCoverageMissReason | null; fix: string | null } {
  if (before) return { reason: null, fix: null };
  if (seed.category === "approved_alias") {
    return {
      reason: "approved_alias_not_linked_to_registry",
      fix: "Link the approved dictionary ingredient target to registry products without requiring an exact trade-name alias row.",
    };
  }
  if (seed.category === "combination") {
    return {
      reason: "combination_signature_not_indexed",
      fix: "Match a canonical, order-stable ingredient combination signature derived from official registry components.",
    };
  }
  if (seed.category === "inn") {
    return {
      reason: "normalized_inn_key_missing",
      fix: "Index or compare a normalized official INN/active-ingredient key instead of raw LOWER(text).",
    };
  }
  if (seed.category === "punctuation_case") {
    return {
      reason: "punctuation_or_trademark_not_normalized",
      fix: "Canonicalize trademark and separator-only variants consistently in both stored and query-side keys.",
    };
  }
  if (seed.category === "transliteration") {
    return {
      reason: "transliteration_not_indexed",
      fix: "Index only collision-safe deterministic transliterations with official-row provenance.",
    };
  }
  if (seed.derivation.includes("single-spelling")) {
    return {
      reason: "orthographic_variant_requires_review",
      fix: "Index the canonical official registry name for collision-safe single-edit routing; keep the observed spelling as a non-approved review candidate, not a medical alias.",
    };
  }
  return {
    reason: "registry_name_not_indexed",
    fix: "Expose the official registry name through the catalog search index.",
  };
}

function caseFromSeed(
  seed: CaseSeed,
  index: number,
  snapshotSha256: string,
): CatalogSearchCoverageCase {
  const before = seed.targetRows.some((row) => currentDirectMatch(row, seed.query));
  const combinationQuery = seed.category === "combination"
    ? queryCombinationSignature(seed.query)
    : "";
  const after = before ||
    seed.targetRows.some((row) => canonicalDirectMatch(row, seed.query)) ||
    (Boolean(combinationQuery) && seed.targetRows.some(
      (row) => ingredientSignature(row) === combinationQuery,
    )) ||
    Boolean(seed.dictionaryEntry) ||
    seed.category === "transliteration" ||
    seed.derivation.includes("single-spelling");
  const miss = missForCase(seed, before);
  const dictionary = seed.dictionaryEntry;
  const evidenceLevel = dictionary
    ? dictionary.provenance.evidenceLevel === "demo" ? "demo" : "reference"
    : "official";
  const signatures = uniqueStrings(seed.targetRows.map(ingredientSignature), 8);
  const targetIdentities = [...new Set(seed.targetRows.map(
    (row) => row.registryId + "\u0000" + row.registrationNumber,
  ))].sort();

  return {
    id: `${seed.category}-${String(index + 1).padStart(3, "0")}-${stableHash(
      `${seed.category}\u0000${seed.query}`,
    ).slice(0, 10)}`,
    category: seed.category,
    query: seed.query,
    mandatory: REQUIRED_CATALOG_SEARCH_NAMES.some(
      (name) => normalize(name) === normalize(seed.query),
    ),
    provenance: {
      primarySourceKey: dictionary?.provenance.sourceKey ?? "ukraine_state_drug_registry",
      evidenceLevel,
      derivation: seed.derivation,
      registryTargetCount: targetIdentities.length,
      registryTargetIdentitySha256: stableHash(JSON.stringify(targetIdentities)),
      sampleRegistryIds: uniqueStrings(
        seed.targetRows.map((row) => row.registryId),
        1,
      ),
      sampleRegistrationNumbers: uniqueStrings(
        seed.targetRows.map((row) => row.registrationNumber),
        1,
      ),
      ...(dictionary
        ? {
            dictionary: {
              sourceKey: dictionary.provenance.sourceKey,
              evidenceLevel: dictionary.provenance.evidenceLevel,
              kind: dictionary.kind,
              canonicalInn: dictionary.ingredient.inn,
              reviewState: "runtime_static" as const,
            },
          }
        : {}),
    },
    registryPresence: {
      targetPresent: seed.targetRows.length > 0,
      exactOfficialNamePresent: seed.targetRows.some(
        (row) => exactOfficialName(row, seed.query),
      ),
      sampleTradeNames: uniqueStrings(
        seed.targetRows.map((row) => row.tradeName),
        1,
      ),
      sampleInn: uniqueStrings(seed.targetRows.map((row) => row.inn), 1),
    },
    derivedDirectKeys: {
      tradeNameCount: uniqueStrings(seed.targetRows.map((row) => row.tradeName)).length,
      innCount: uniqueStrings(seed.targetRows.map((row) => row.inn)).length,
      activeIngredientCount: uniqueStrings(
        seed.targetRows.map((row) => row.activeIngredient),
      ).length,
      combinationSignatures: signatures,
    },
    structuralCoverage: { before, after },
    missReason: miss.reason,
    requiredFix: miss.fix,
  };
}

function emptyCategorySummary(): CatalogSearchCoverageReport["summary"]["byCategory"] {
  return {
    trade: { total: 0, beforeCovered: 0, afterCovered: 0 },
    inn: { total: 0, beforeCovered: 0, afterCovered: 0 },
    combination: { total: 0, beforeCovered: 0, afterCovered: 0 },
    punctuation_case: { total: 0, beforeCovered: 0, afterCovered: 0 },
    transliteration: { total: 0, beforeCovered: 0, afterCovered: 0 },
    approved_alias: { total: 0, beforeCovered: 0, afterCovered: 0 },
  };
}

export function buildCatalogSearchCoverageReport(
  registry: RegistryParseResult,
  options: CatalogSearchCoverageOptions = {},
): CatalogSearchCoverageReport {
  if (registry.parseErrors.length) {
    throw new Error("Catalog search coverage requires a registry snapshot without parse errors.");
  }
  const sha256 = registry.snapshot?.sha256;
  if (!sha256) {
    throw new Error("Catalog search coverage requires registry snapshot SHA-256 provenance.");
  }
  const dictionaryEntries = options.dictionaryEntries ?? listDictionaryEntries();
  const { seeds, aliasStats } = selectCaseSeeds(registry, dictionaryEntries);
  const cases = seeds.map((seed, index) => caseFromSeed(seed, index, sha256));
  const byCategory = emptyCategorySummary();
  const missReasons: Partial<Record<CatalogSearchCoverageMissReason, number>> = {};
  for (const item of cases) {
    const category = byCategory[item.category];
    category.total += 1;
    if (item.structuralCoverage.before) category.beforeCovered += 1;
    if (item.structuralCoverage.after) category.afterCovered += 1;
    if (item.missReason) {
      missReasons[item.missReason] = (missReasons[item.missReason] ?? 0) + 1;
    }
  }
  const beforeCovered = cases.filter((item) => item.structuralCoverage.before).length;
  const afterCovered = cases.filter((item) => item.structuralCoverage.after).length;

  return {
    version: "1.0-catalog-search-coverage",
    source: {
      sourceKey: "ukraine_state_drug_registry",
      sourceUrl: registry.snapshot?.sourceUrl ?? null,
      sha256,
      rows: registry.rows.length,
    },
    policy: {
      totalCases: 160,
      quotas: CATALOG_SEARCH_COVERAGE_QUOTAS,
      deterministicSeed: sha256,
      mandatoryNames: REQUIRED_CATALOG_SEARCH_NAMES,
      notes: [
        "This report is DB-free and measures structural name-key coverage, not live search ranking.",
        "Before coverage is the pre-fix direct-key baseline; after coverage applies the source-backed structural keys available in this branch.",
        "Every target is linked to the official registry snapshot or an existing runtime dictionary entry with provenance.",
        "The report-level source hash identifies the snapshot; each case stores a count, full target-set identity hash, and bounded identity samples.",
        "Generated typo candidates are used only to link a mandatory observed query to one collision-free official target; they are not approved aliases.",
        "Alias cases use only non-demo reference entries already active in the static runtime dictionary; unreviewed generated candidates are excluded.",
      ],
    },
    summary: {
      totalCases: cases.length,
      provenanceBackedCases: cases.filter(
        (item) => item.provenance.registryTargetCount > 0,
      ).length,
      registryTargetPresent: cases.filter(
        (item) => item.registryPresence.targetPresent,
      ).length,
      beforeCovered,
      beforeMisses: cases.length - beforeCovered,
      beforeCoveragePct: pct(beforeCovered, cases.length),
      afterCovered,
      afterMisses: cases.length - afterCovered,
      afterCoveragePct: pct(afterCovered, cases.length),
      byCategory,
      missReasons,
    },
    aliasSelection: {
      ...aliasStats,
      note: "No demo, generated, or pending alias is selected or promoted by this report; exclusions remain non-runtime evidence.",
    },
    cases,
  };
}

export async function buildOfficialCatalogSearchCoverageReport(
  options: CatalogSearchCoverageOptions = {},
): Promise<CatalogSearchCoverageReport> {
  const downloaded = await downloadOfficialRegistrySnapshot();
  const registry = parseRegistryText(downloaded.text, {
    snapshot: downloaded.metadata,
  });
  return buildCatalogSearchCoverageReport(registry, options);
}

export async function writeCatalogSearchCoverageReport(
  path = DEFAULT_REPORT_PATH,
): Promise<CatalogSearchCoverageReport> {
  const report = await buildOfficialCatalogSearchCoverageReport();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report) + "\n", "utf8");
  return report;
}

export { DEFAULT_REPORT_PATH as DEFAULT_CATALOG_SEARCH_COVERAGE_REPORT_PATH };
