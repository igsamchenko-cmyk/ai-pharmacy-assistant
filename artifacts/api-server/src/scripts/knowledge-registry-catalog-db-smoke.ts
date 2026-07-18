import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  listDictionaryEntries,
  normalizeQuery,
  type DictionaryEntry,
} from "../knowledge/dictionary";
import {
  hasCyrillic,
  transliterateUkrainianToLatin,
} from "../knowledge/ingestion/transliteration";
import { normalize } from "../lib/text";
import { performance } from "node:perf_hooks";
import { SearchCatalogQueryParams } from "@workspace/api-zod";
import {
  createPostgresRegistryCatalogStore,
  resetRegistrySearchCachesForTests,
  searchCatalog,
  type CatalogQueryMetric,
  type CatalogSearchInput,
} from "../services/catalogSearchService";
import {
  assertCatalogSmokeHasNoIdleTransactions,
  authorizeCatalogSmokeDatabase,
  closeCatalogSmokePool,
  configureCatalogSmokeReadOnlySession,
  createReadOnlyCatalogExecutor,
  verifyCatalogSmokeReadOnlySession,
} from "../knowledge/registryProductionSearchSmoke";

const GROUPED_QUERIES = [
  "Метформін",
  "Омепразол",
  "Амлодипін",
  "Ібупрофен",
  "Цефтріаксон",
  "Еліквіс",
] as const;

const PREFIX_QUERIES = ["Амло", "Метф", "Омеп"] as const;

const WARM_SAMPLES = 20;
const RESPONSE_SIZE_LIMIT_BYTES = 100_000;
const COVERAGE_REPORT_SIZE_LIMIT_BYTES = 100_000;
const TYPO_CASE_COUNT = 10;
const DEFAULT_COVERAGE_REPORT_PATH = fileURLToPath(
  new URL(
    "../../../../artifacts/reports/catalog-search-db-coverage-report.json",
    import.meta.url,
  ),
);

const COVERAGE_QUOTAS = {
  trade: 50,
  inn: 40,
  combination: 20,
  punctuation_case: 20,
  transliteration: 15,
  approved_alias: 15,
} as const;

const MANDATORY_QUERIES = [
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

type CoverageCategory =
  | "mandatory"
  | keyof typeof COVERAGE_QUOTAS
  | "unique_one_edit_typo";

interface CoverageRegistryRow {
  registry_id: string;
  trade_name: string;
  inn: string;
  active_ingredient: string;
  registration_number: string;
  source_key: string;
  import_batch_id: string | null;
  raw_hash: string;
}

interface CoverageFixture {
  id: string;
  category: CoverageCategory;
  query: string;
  expectedRows: CoverageRegistryRow[];
  ingredientKeys: string[];
  combinationTerms: string[];
  derivation: string;
  sourceKey: string;
  dictionarySourceKey: string | null;
  requireApprovedMapping: boolean;
  requireBrandFanout: boolean;
}

interface CoverageEvaluation {
  id: string;
  category: CoverageCategory;
  query: string;
  derivation: string;
  provenance: {
    sourceKey: string;
    dictionarySourceKey: string | null;
  };
  expectedTargetCount: number;
  resultCount: number;
  matched: {
    registryId: string;
    registrationNumber: string;
    tradeName: string;
    inn: string;
  } | null;
  unrelatedResultCount: number;
  unrelatedSample: {
    registryId: string;
    registrationNumber: string;
    tradeName: string;
    inn: string;
  } | null;
  responseBytes: number;
  durationMs: number;
  reusedResult: boolean;
  passed: boolean;
  failures: string[];
}

const REPRESENTATIVE_QUERIES = [
  "Цефтріаксон",
  "Амоксиклав",
  "Ібупрофен",
  "Еліквіс",
  "Ксарелто",
  "Метформін",
  "Омепразол",
  "Пантопразол",
  "Дексаметазон",
  "Ондансетрон",
  "Варфарин",
  "Амлодипін",
  "Енап",
] as const;

function input(overrides: Record<string, unknown> = {}): CatalogSearchInput {
  return SearchCatalogQueryParams.parse({
    type: "registry_products",
    ...overrides,
  });
}

function positiveIntArg(prefix: string, fallback: number): number {
  const raw = process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
  const value = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Catalog DB smoke received an invalid positive integer.");
  }
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function percentile(
  values: readonly number[],
  percentileValue: number,
): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1),
  );
  return sorted[index] ?? 0;
}

function timingSummary(values: readonly number[]) {
  return {
    samples: values.length,
    p50Ms: Number(percentile(values, 0.5).toFixed(1)),
    p95Ms: Number(percentile(values, 0.95).toFixed(1)),
    maxMs: Number(Math.max(...values).toFixed(1)),
  };
}

function summarizeQueryPlan(value: unknown) {
  const root = Array.isArray(value) ? value[0] : value;
  if (!root || typeof root !== "object") return null;
  const report = root as Record<string, unknown>;
  const plan =
    report.Plan && typeof report.Plan === "object"
      ? (report.Plan as Record<string, unknown>)
      : {};
  const scans: Array<{
    nodeType: string;
    relationName: string | null;
    indexName: string | null;
  }> = [];
  const visit = (node: Record<string, unknown>) => {
    const nodeType =
      typeof node["Node Type"] === "string" ? node["Node Type"] : "Unknown";
    if (nodeType.includes("Scan")) {
      scans.push({
        nodeType,
        relationName:
          typeof node["Relation Name"] === "string"
            ? node["Relation Name"]
            : null,
        indexName:
          typeof node["Index Name"] === "string" ? node["Index Name"] : null,
      });
    }
    const children = Array.isArray(node.Plans) ? node.Plans : [];
    for (const child of children) {
      if (child && typeof child === "object") {
        visit(child as Record<string, unknown>);
      }
    }
  };
  visit(plan);
  return {
    planningTimeMs: report["Planning Time"] ?? null,
    executionTimeMs: report["Execution Time"] ?? null,
    rootNodeType: plan["Node Type"] ?? null,
    actualRows: plan["Actual Rows"] ?? null,
    totalCost: plan["Total Cost"] ?? null,
    sharedHitBlocks: plan["Shared Hit Blocks"] ?? null,
    sharedReadBlocks: plan["Shared Read Blocks"] ?? null,
    scans,
  };
}

function safeMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Catalog DB smoke failed.";
  return error.message
    .replace(/postgres(?:ql)?:\/\/[^\s"'\`]+/gi, "[database-url]")
    .replace(/[A-Za-z]:\\[^\s"'\`]+/g, "[path]")
    .replace(/\/(?:opt|tmp|var|home|Users)\/[^\s"'\`]+/g, "[path]");
}

function argValue(prefix: string): string | null {
  return (
    process.argv
      .find((argument) => argument.startsWith(prefix))
      ?.slice(prefix.length) ?? null
  );
}

function optionalPositiveIntArg(prefix: string): number | null {
  const raw = argValue(prefix);
  if (raw === null) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      "Catalog DB smoke received an invalid exact product count.",
    );
  }
  return value;
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function uniqueRows(
  rows: readonly CoverageRegistryRow[],
): CoverageRegistryRow[] {
  return [
    ...new Map(rows.map((row) => [row.registry_id, row] as const)).values(),
  ];
}

function deterministicSample<T>(
  values: readonly T[],
  count: number,
  seed: string,
  key: (value: T) => string,
): T[] {
  return [...values]
    .sort((left, right) => {
      const leftHash = stableHash(`${seed}\u0000${key(left)}`);
      const rightHash = stableHash(`${seed}\u0000${key(right)}`);
      return (
        leftHash.localeCompare(rightHash) || key(left).localeCompare(key(right))
      );
    })
    .slice(0, count);
}

function normalizedRowFields(row: CoverageRegistryRow): string[] {
  return [row.trade_name, row.inn, row.active_ingredient]
    .map(normalize)
    .filter(Boolean);
}

function dictionaryIngredientKey(entry: DictionaryEntry): string {
  return normalize(entry.ingredient.inn);
}

function dictionaryKeysForIngredient(
  canonicalInn: string,
  dictionaryEntries: readonly DictionaryEntry[],
): string[] {
  const ingredientKey = normalize(canonicalInn);
  return [
    ...new Set(
      dictionaryEntries
        .filter((entry) => dictionaryIngredientKey(entry) === ingredientKey)
        .flatMap((entry) => [
          normalize(entry.name),
          normalize(entry.ingredient.inn),
          normalize(entry.ingredient.latin),
          normalize(entry.ingredient.english),
        ])
        .filter((key) => Array.from(key).length >= 3),
    ),
  ];
}

function rowMatchesIngredientKeys(
  row: CoverageRegistryRow,
  ingredientKeys: readonly string[],
): boolean {
  const fields = [normalize(row.inn), normalize(row.active_ingredient)].filter(
    Boolean,
  );
  return fields.some((field) =>
    ingredientKeys.some((key) => field === key || field.includes(key)),
  );
}

function rowsForIngredient(
  rows: readonly CoverageRegistryRow[],
  canonicalInn: string,
  dictionaryEntries: readonly DictionaryEntry[],
): { rows: CoverageRegistryRow[]; keys: string[] } {
  const keys = dictionaryKeysForIngredient(canonicalInn, dictionaryEntries);
  return {
    rows: rows.filter((row) => rowMatchesIngredientKeys(row, keys)),
    keys,
  };
}

function compositionParts(value: string): string[] {
  const parts = value
    .split(
      /\s*(?:\+|;|,|\/(?!\d)|\b(?:and|with)\b|(?<!\p{L})(?:та|і)(?!\p{L}))\s*/iu,
    )
    .map((part) => part.trim())
    .filter((part) => Array.from(normalize(part)).length >= 3);
  return parts.length >= 2 && parts.length <= 4 ? parts : [];
}

function compositionSignature(row: CoverageRegistryRow): string {
  const source = row.inn.trim() || row.active_ingredient.trim();
  const parts = compositionParts(source).map(normalize);
  return parts.length >= 2 ? [...new Set(parts)].sort().join("+") : "";
}

function punctuationVariant(value: string): string {
  const normalizedSeparators = value
    .replace(/[®™]/g, "")
    .replace(/[\u2010-\u2015_-]+/g, " ")
    .replace(/[./\\()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("uk-UA");
  return normalizedSeparators.includes(" ")
    ? normalizedSeparators.replace(/\s+/g, "-")
    : normalizedSeparators;
}

function singleEditCandidates(value: string): string[] {
  const key = normalize(value);
  const characters = Array.from(key);
  if (characters.length < 6) return [];
  const candidates = new Set<string>();
  for (let index = 1; index < characters.length - 1; index += 1) {
    if (characters[index] === characters[index + 1]) continue;
    const swapped = [...characters];
    [swapped[index], swapped[index + 1]] = [
      swapped[index + 1]!,
      swapped[index]!,
    ];
    candidates.add(swapped.join(""));
    break;
  }
  const middle = Math.floor(characters.length / 2);
  candidates.add(characters.filter((_, index) => index !== middle).join(""));
  return [...candidates].filter(Boolean);
}

function fixtureId(
  category: CoverageCategory,
  query: string,
  expectedRows: readonly CoverageRegistryRow[],
): string {
  return `${category}-${stableHash(
    `${normalize(query)}\u0000${expectedRows[0]?.registry_id ?? "missing"}`,
  ).slice(0, 12)}`;
}

function makeFixture(options: Omit<CoverageFixture, "id">): CoverageFixture {
  return {
    ...options,
    expectedRows: uniqueRows(options.expectedRows),
    ingredientKeys: [...new Set(options.ingredientKeys.filter(Boolean))],
    combinationTerms: [...new Set(options.combinationTerms.filter(Boolean))],
    id: fixtureId(options.category, options.query, options.expectedRows),
  };
}

function buildCoverageFixtures(
  rows: readonly CoverageRegistryRow[],
  approvedMappingByName: ReadonlyMap<string, string>,
  snapshotSeed: string,
): {
  mandatory: CoverageFixture[];
  deterministic: CoverageFixture[];
  typos: CoverageFixture[];
} {
  const dictionaryEntries = listDictionaryEntries();
  const byTradeKey = new Map<string, CoverageRegistryRow[]>();
  const byInnKey = new Map<string, CoverageRegistryRow[]>();
  const byComposition = new Map<string, CoverageRegistryRow[]>();

  for (const row of rows) {
    const tradeKey = normalize(row.trade_name);
    if (tradeKey) {
      const current = byTradeKey.get(tradeKey) ?? [];
      current.push(row);
      byTradeKey.set(tradeKey, current);
    }
    const innKey = normalize(row.inn.trim() || row.active_ingredient.trim());
    if (innKey) {
      const current = byInnKey.get(innKey) ?? [];
      current.push(row);
      byInnKey.set(innKey, current);
    }
    const signature = compositionSignature(row);
    if (signature) {
      const current = byComposition.get(signature) ?? [];
      current.push(row);
      byComposition.set(signature, current);
    }
  }

  const mandatory = MANDATORY_QUERIES.map((query) => {
    const queryKey = normalize(query);
    const directRows = rows.filter((row) =>
      normalizedRowFields(row).some((field) => field.includes(queryKey)),
    );
    const dictionary = normalizeQuery(query);
    const ingredient = dictionary
      ? rowsForIngredient(rows, dictionary.ingredient.inn, dictionaryEntries)
      : { rows: [] as CoverageRegistryRow[], keys: [] as string[] };
    const expectedRows = uniqueRows([...directRows, ...ingredient.rows]);
    assert(
      expectedRows.length > 0,
      `Mandatory coverage query has no official registry target: ${query}.`,
    );
    return makeFixture({
      category: "mandatory",
      query,
      expectedRows,
      ingredientKeys: ingredient.keys,
      combinationTerms: [],
      derivation:
        "mandatory query linked to official registry names and any reference-backed canonical ingredient",
      sourceKey: expectedRows[0]!.source_key,
      dictionarySourceKey: dictionary?.provenance.sourceKey ?? null,
      requireApprovedMapping: false,
      requireBrandFanout: dictionary?.kind === "inn",
    });
  });

  const tradeCandidates = [...byTradeKey.entries()]
    .map(([tradeKey, targetRows]) => {
      const productMappingKeys = new Set(
        normalizedRowFields(targetRows[0]!)
          .map((key) => approvedMappingByName.get(key))
          .filter((key): key is string => Boolean(key)),
      );
      if (
        Array.from(tradeKey).length < 3 ||
        !targetRows.some((row) => row.registration_number) ||
        productMappingKeys.size !== 1
      ) {
        return null;
      }
      const dictionary = normalizeQuery(targetRows[0]!.trade_name);
      const ingredient = dictionary
        ? dictionaryKeysForIngredient(
            dictionary.ingredient.inn,
            dictionaryEntries,
          )
        : normalizedRowFields(targetRows[0]!);
      return makeFixture({
        category: "trade",
        query: targetRows[0]!.trade_name,
        expectedRows: targetRows,
        ingredientKeys: ingredient,
        combinationTerms: [],
        derivation:
          "official trade name whose product has one approved INN mapping",
        sourceKey: targetRows[0]!.source_key,
        dictionarySourceKey: dictionary?.provenance.sourceKey ?? null,
        requireApprovedMapping: true,
        requireBrandFanout: false,
      });
    })
    .filter((item): item is CoverageFixture => Boolean(item));

  const innCandidates = [...byInnKey.entries()]
    .filter(
      ([key, targetRows]) =>
        Array.from(key).length >= 3 &&
        compositionParts(targetRows[0]!.inn || targetRows[0]!.active_ingredient)
          .length === 0 &&
        targetRows.some(
          (row) => normalize(row.trade_name) !== key && row.registration_number,
        ),
    )
    .map(([, targetRows]) => {
      const query =
        targetRows[0]!.inn.trim() || targetRows[0]!.active_ingredient.trim();
      const dictionary = normalizeQuery(query);
      return makeFixture({
        category: "inn",
        query,
        expectedRows: targetRows,
        ingredientKeys: dictionary
          ? dictionaryKeysForIngredient(
              dictionary.ingredient.inn,
              dictionaryEntries,
            )
          : [normalize(query)],
        combinationTerms: [],
        derivation:
          "official INN with at least one differently named registry brand",
        sourceKey: targetRows[0]!.source_key,
        dictionarySourceKey: dictionary?.provenance.sourceKey ?? null,
        requireApprovedMapping: false,
        requireBrandFanout: true,
      });
    });

  const combinationCandidates = [...byComposition.entries()].map(
    ([, targetRows]) => {
      const source =
        targetRows[0]!.inn.trim() || targetRows[0]!.active_ingredient.trim();
      const parts = compositionParts(source);
      return makeFixture({
        category: "combination",
        query: [...parts].reverse().join(" + "),
        expectedRows: targetRows,
        ingredientKeys: [],
        combinationTerms: parts.map(normalize),
        derivation:
          "reordered components derived from one official combination expression",
        sourceKey: targetRows[0]!.source_key,
        dictionarySourceKey: null,
        requireApprovedMapping: false,
        requireBrandFanout: false,
      });
    },
  );

  const punctuationCandidates = [...byTradeKey.values()]
    .map((targetRows) => {
      const query = punctuationVariant(targetRows[0]!.trade_name);
      if (
        !query ||
        query === targetRows[0]!.trade_name ||
        normalize(query) !== normalize(targetRows[0]!.trade_name)
      ) {
        return null;
      }
      const ingredientKeys = targetRows.flatMap((row) => {
        const ingredient = row.inn.trim() || row.active_ingredient.trim();
        if (!ingredient) return [];
        const resolved = normalizeQuery(ingredient);
        return resolved
          ? dictionaryKeysForIngredient(
              resolved.ingredient.inn,
              dictionaryEntries,
            )
          : [normalize(ingredient)];
      });
      return makeFixture({
        category: "punctuation_case",
        query,
        expectedRows: targetRows,
        ingredientKeys,
        combinationTerms: [],
        derivation:
          "case and separator/trademark variant derived from an official trade name",
        sourceKey: targetRows[0]!.source_key,
        dictionarySourceKey: null,
        requireApprovedMapping: false,
        requireBrandFanout: false,
      });
    })
    .filter((item): item is CoverageFixture => Boolean(item));

  const transliterationByQuery = new Map<string, CoverageFixture>();
  for (const entry of dictionaryEntries) {
    if (!hasCyrillic(entry.ingredient.inn)) continue;
    const query = transliterateUkrainianToLatin(entry.ingredient.inn);
    const resolved = normalizeQuery(query);
    if (
      !query ||
      !resolved ||
      dictionaryIngredientKey(resolved) !== dictionaryIngredientKey(entry)
    ) {
      continue;
    }
    const ingredient = rowsForIngredient(
      rows,
      entry.ingredient.inn,
      dictionaryEntries,
    );
    if (!ingredient.rows.length) continue;
    const key = normalize(query);
    if (transliterationByQuery.has(key)) continue;
    transliterationByQuery.set(
      key,
      makeFixture({
        category: "transliteration",
        query,
        expectedRows: ingredient.rows,
        ingredientKeys: ingredient.keys,
        combinationTerms: [],
        derivation:
          "collision-safe deterministic transliteration of a reference INN linked to official registry rows",
        sourceKey: ingredient.rows[0]!.source_key,
        dictionarySourceKey: resolved.provenance.sourceKey,
        requireApprovedMapping: false,
        requireBrandFanout: true,
      }),
    );
  }

  const approvedAliasByQuery = new Map<string, CoverageFixture>();
  for (const entry of dictionaryEntries) {
    if (
      entry.provenance.evidenceLevel === "demo" ||
      entry.kind === "inn" ||
      normalize(entry.name) === dictionaryIngredientKey(entry)
    ) {
      continue;
    }
    const ingredient = rowsForIngredient(
      rows,
      entry.ingredient.inn,
      dictionaryEntries,
    );
    if (!ingredient.rows.length) continue;
    const key = normalize(entry.name);
    if (!key || approvedAliasByQuery.has(key)) continue;
    approvedAliasByQuery.set(
      key,
      makeFixture({
        category: "approved_alias",
        query: entry.name,
        expectedRows: ingredient.rows,
        ingredientKeys: ingredient.keys,
        combinationTerms: [],
        derivation:
          "existing non-demo reference alias linked to its canonical ingredient and official registry products",
        sourceKey: ingredient.rows[0]!.source_key,
        dictionarySourceKey: entry.provenance.sourceKey,
        requireApprovedMapping: false,
        requireBrandFanout: true,
      }),
    );
  }

  const typoByQuery = new Map<string, CoverageFixture>();
  for (const entry of dictionaryEntries) {
    if (entry.provenance.evidenceLevel === "demo" || entry.kind === "brand") {
      continue;
    }
    const ingredient = rowsForIngredient(
      rows,
      entry.ingredient.inn,
      dictionaryEntries,
    );
    if (!ingredient.rows.length) continue;
    for (const query of singleEditCandidates(entry.name)) {
      const resolved = normalizeQuery(query);
      if (
        !resolved ||
        dictionaryIngredientKey(resolved) !== dictionaryIngredientKey(entry) ||
        rows.some((row) =>
          normalizedRowFields(row).some((field) => field === normalize(query)),
        )
      ) {
        continue;
      }
      const key = normalize(query);
      if (typoByQuery.has(key)) continue;
      typoByQuery.set(
        key,
        makeFixture({
          category: "unique_one_edit_typo",
          query,
          expectedRows: ingredient.rows,
          ingredientKeys: ingredient.keys,
          combinationTerms: [],
          derivation:
            "unique one-edit query derived at runtime from a non-demo reference name; no alias is persisted",
          sourceKey: ingredient.rows[0]!.source_key,
          dictionarySourceKey: entry.provenance.sourceKey,
          requireApprovedMapping: false,
          requireBrandFanout: true,
        }),
      );
      break;
    }
  }

  const selectedByCategory = {
    trade: deterministicSample(
      tradeCandidates,
      COVERAGE_QUOTAS.trade,
      `${snapshotSeed}:trade`,
      (item) => item.id,
    ),
    inn: deterministicSample(
      innCandidates,
      COVERAGE_QUOTAS.inn,
      `${snapshotSeed}:inn`,
      (item) => item.id,
    ),
    combination: deterministicSample(
      combinationCandidates,
      COVERAGE_QUOTAS.combination,
      `${snapshotSeed}:combination`,
      (item) => item.id,
    ),
    punctuation_case: deterministicSample(
      punctuationCandidates,
      COVERAGE_QUOTAS.punctuation_case,
      `${snapshotSeed}:punctuation`,
      (item) => item.id,
    ),
    transliteration: deterministicSample(
      [...transliterationByQuery.values()],
      COVERAGE_QUOTAS.transliteration,
      `${snapshotSeed}:transliteration`,
      (item) => item.id,
    ),
    approved_alias: deterministicSample(
      [...approvedAliasByQuery.values()],
      COVERAGE_QUOTAS.approved_alias,
      `${snapshotSeed}:approved-alias`,
      (item) => item.id,
    ),
  };

  for (const [category, quota] of Object.entries(COVERAGE_QUOTAS)) {
    assert(
      selectedByCategory[category as keyof typeof selectedByCategory].length ===
        quota,
      `Catalog DB coverage could not build ${quota} provenance-backed ${category} cases.`,
    );
  }
  const deterministic = Object.values(selectedByCategory).flat();
  assert(
    deterministic.length ===
      Object.values(COVERAGE_QUOTAS).reduce((sum, count) => sum + count, 0),
    "Catalog DB coverage deterministic quota total is inconsistent.",
  );
  const typos = deterministicSample(
    [...typoByQuery.values()],
    TYPO_CASE_COUNT,
    `${snapshotSeed}:unique-one-edit-typo`,
    (item) => item.id,
  );
  assert(
    typos.length === TYPO_CASE_COUNT,
    "Catalog DB coverage could not build ten unique one-edit typo cases.",
  );
  return { mandatory, deterministic, typos };
}

type CatalogStore = Awaited<
  ReturnType<typeof createPostgresRegistryCatalogStore>
>;
type CatalogProduct = Awaited<
  ReturnType<CatalogStore["searchProducts"]>
>["items"][number];

function productRelatedToFixture(
  product: CatalogProduct,
  fixture: CoverageFixture,
  expectedIds: ReadonlySet<string>,
): boolean {
  if (expectedIds.has(product.id)) return true;
  const normalizedTradeName = normalize(product.tradeName);
  if (
    normalizedTradeName &&
    fixture.ingredientKeys.some(
      (key) =>
        normalizedTradeName === key ||
        normalizedTradeName.startsWith(key) ||
        normalizedTradeName.endsWith(key),
    )
  ) {
    return true;
  }
  const ingredientFields = [
    normalize(product.inn),
    normalize(product.activeIngredient),
    normalize(product.approvedMapping?.inn ?? ""),
    normalize(product.approvedMapping?.latin ?? ""),
    normalize(product.approvedMapping?.english ?? ""),
  ].filter(Boolean);
  if (
    fixture.ingredientKeys.some((key) =>
      ingredientFields.some((field) => field === key || field.includes(key)),
    )
  ) {
    return true;
  }
  const composition = [
    normalize(product.inn),
    normalize(product.activeIngredient),
  ].join(" ");
  return (
    fixture.combinationTerms.length > 0 &&
    fixture.combinationTerms.every((term) => composition.includes(term))
  );
}

async function evaluateCoverage(
  store: CatalogStore,
  fixtures: readonly CoverageFixture[],
  expectedCatalogTotal: number,
  maxWarmMs: number,
): Promise<{
  evaluations: CoverageEvaluation[];
  uniqueSearches: number;
  latency: ReturnType<typeof timingSummary>;
}> {
  const resultCache = new Map<
    string,
    {
      result: Awaited<ReturnType<CatalogStore["searchProducts"]>>;
      durationMs: number;
      responseBytes: number;
    }
  >();
  const uniqueDurations: number[] = [];
  const evaluations: CoverageEvaluation[] = [];

  for (const fixture of fixtures) {
    const cacheKey = fixture.query.trim().toLocaleLowerCase("uk-UA");
    let cached = resultCache.get(cacheKey);
    const reusedResult = Boolean(cached);
    if (!cached) {
      const started = performance.now();
      const result = await store.searchProducts(
        input({
          q: fixture.query,
          view: "flat",
          pageSize: 25,
        }),
      );
      const durationMs = performance.now() - started;
      const responseBytes = Buffer.byteLength(JSON.stringify(result), "utf8");
      cached = { result, durationMs, responseBytes };
      resultCache.set(cacheKey, cached);
      uniqueDurations.push(durationMs);
    }

    const expectedById = new Map(
      fixture.expectedRows.map((row) => [row.registry_id, row] as const),
    );
    const expectedIds = new Set(expectedById.keys());
    const matchedProduct =
      cached.result.items.find((item) => expectedIds.has(item.id)) ?? null;
    const matchedExpected = matchedProduct
      ? (expectedById.get(matchedProduct.id) ?? null)
      : null;
    const unrelated = cached.result.items.filter(
      (item) => !productRelatedToFixture(item, fixture, expectedIds),
    );
    const failures: string[] = [];
    if (cached.result.catalogTotal !== expectedCatalogTotal) {
      failures.push("catalog_total_changed");
    }
    if (cached.responseBytes > RESPONSE_SIZE_LIMIT_BYTES) {
      failures.push("response_payload_exceeded_100kb");
    }
    if (cached.durationMs > maxWarmMs) {
      failures.push("latency_budget_exceeded");
    }
    if (!matchedProduct || !matchedExpected) {
      failures.push("expected_registry_identity_missing");
    } else if (
      matchedProduct.registration.number !== matchedExpected.registration_number
    ) {
      failures.push("registration_number_mismatch");
    }
    if (unrelated.length > 0) {
      failures.push("unrelated_results_detected");
    }
    if (
      fixture.requireApprovedMapping &&
      (matchedProduct?.mappingStatus !== "approved" ||
        !matchedProduct.approvedMapping)
    ) {
      failures.push("brand_to_inn_mapping_missing");
    }
    if (
      fixture.requireBrandFanout &&
      !cached.result.items.some(
        (item) =>
          productRelatedToFixture(item, fixture, expectedIds) &&
          normalize(item.tradeName) !==
            normalize(item.inn || item.activeIngredient),
      )
    ) {
      failures.push("inn_to_brand_fanout_missing");
    }

    evaluations.push({
      id: fixture.id,
      category: fixture.category,
      query: fixture.query,
      derivation: fixture.derivation,
      provenance: {
        sourceKey: fixture.sourceKey,
        dictionarySourceKey: fixture.dictionarySourceKey,
      },
      expectedTargetCount: fixture.expectedRows.length,
      resultCount: cached.result.filteredTotal,
      matched: matchedProduct
        ? {
            registryId: matchedProduct.id,
            registrationNumber: matchedProduct.registration.number,
            tradeName: matchedProduct.tradeName,
            inn: matchedProduct.inn,
          }
        : null,
      unrelatedResultCount: unrelated.length,
      unrelatedSample: unrelated[0]
        ? {
            registryId: unrelated[0].id,
            registrationNumber: unrelated[0].registration.number,
            tradeName: unrelated[0].tradeName.slice(0, 160),
            inn: unrelated[0].inn.slice(0, 160),
          }
        : null,
      responseBytes: cached.responseBytes,
      durationMs: Number(cached.durationMs.toFixed(1)),
      reusedResult,
      passed: failures.length === 0,
      failures,
    });
  }

  return {
    evaluations,
    uniqueSearches: resultCache.size,
    latency: timingSummary(uniqueDurations),
  };
}
async function main(): Promise<void> {
  const authorization = authorizeCatalogSmokeDatabase(
    process.env.DATABASE_URL,
    process.env,
  );
  configureCatalogSmokeReadOnlySession(process.env);
  const expectedProducts = positiveIntArg("--expect-min-products=", 16_000);
  const expectedExactProducts = optionalPositiveIntArg("--expect-products=");
  const coverageReportPath =
    argValue("--coverage-report=") ?? DEFAULT_COVERAGE_REPORT_PATH;
  const maxWarmMs = positiveIntArg("--max-warm-ms=", 2_000);
  const maxGroupedP95Ms = positiveIntArg("--max-grouped-p95-ms=", 900);
  const maxExactP50Ms = positiveIntArg("--max-exact-p50-ms=", 150);
  const maxPrefixP50Ms = positiveIntArg("--max-prefix-p50-ms=", 250);
  const maxNavigationP95Ms = positiveIntArg("--max-navigation-p95-ms=", 400);
  const queryMetrics: CatalogQueryMetric[] = [];
  const { pool } = await import("@workspace/db");
  const readOnlyExecutor = createReadOnlyCatalogExecutor({
    query: async (text, values) => {
      const result = await pool.query(text, values);
      return { rows: result.rows as Array<Record<string, unknown>> };
    },
  });
  const readOnlyQuery = async <T>(
    text: string,
    values: unknown[] = [],
  ): Promise<{ rows: T[] }> =>
    (await readOnlyExecutor.query(text, values)) as { rows: T[] };
  const store = await createPostgresRegistryCatalogStore({
    executor: readOnlyExecutor,
    onQuery: (metric) => queryMetrics.push(metric),
  });

  try {
    await verifyCatalogSmokeReadOnlySession(readOnlyExecutor);
    const first = await store.searchProducts(input());
    assert(
      first.catalogTotal >= expectedProducts,
      "Catalog total is below the isolated fixture expectation.",
    );
    if (expectedExactProducts !== null) {
      assert(
        first.catalogTotal === expectedExactProducts,
        `Catalog total differs from the exact isolated fixture expectation: ` +
          `${first.catalogTotal} !== ${expectedExactProducts}.`,
      );
    }
    assert(
      first.items.length === 25,
      "Default browse page is not bounded to 25.",
    );
    assert(
      first.filteredTotal === first.catalogTotal,
      "Browse total is inconsistent.",
    );

    const second = await store.searchProducts(input({ page: 2 }));
    assert(second.items.length === 25, "Second browse page is not available.");
    const firstIds = new Set(first.items.map((item) => item.id));
    assert(
      second.items.every((item) => !firstIds.has(item.id)),
      "Adjacent catalog pages contain duplicate registry IDs.",
    );

    const page50 = await store.searchProducts(input({ pageSize: 50 }));
    assert(page50.items.length === 50, "Page size 50 is not honored.");
    assert(
      new Set(page50.items.map((item) => item.id)).size === page50.items.length,
      "Catalog response contains duplicate registry IDs.",
    );

    const representative: Array<{
      query: string;
      total: number;
      firstTradeName: string;
      warmMs: number;
    }> = [];
    for (const query of REPRESENTATIVE_QUERIES) {
      const warmup = await store.searchProducts(input({ q: query }));
      assert(
        warmup.filteredTotal > 0,
        `Representative registry query returned zero rows: ${query}`,
      );
      const started = performance.now();
      const measured = await store.searchProducts(input({ q: query }));
      const warmMs = performance.now() - started;
      assert(
        measured.filteredTotal > 0,
        `Warmed registry query returned zero rows: ${query}`,
      );
      assert(
        measured.items.length <= 25,
        "A registry query exceeded its response bound.",
      );
      assert(
        warmMs <= maxWarmMs,
        `Warmed registry query exceeded the latency budget: ${query} ` +
          `(${warmMs.toFixed(1)} ms > ${maxWarmMs} ms).`,
      );
      representative.push({
        query,
        total: measured.filteredTotal,
        firstTradeName: measured.items[0]?.tradeName ?? "",
        warmMs: Number(warmMs.toFixed(1)),
      });
    }

    const groupedRepresentative: Array<{
      query: string;
      positions: number;
      groups: number;
      coldMs: number;
      coldSqlMs: number;
      backendMs: number;
      coldQueries: number;
      warm: ReturnType<typeof timingSummary>;
      responseBytes: number;
      serializationMs: number;
      navigation: ReturnType<typeof timingSummary>;
    }> = [];
    for (const query of GROUPED_QUERIES) {
      resetRegistrySearchCachesForTests();
      const groupedInput = input({ q: query, view: "grouped" });
      const metricStart = queryMetrics.length;
      const coldStarted = performance.now();
      const cold = await searchCatalog(groupedInput, store);
      const coldMs = performance.now() - coldStarted;
      const coldMetrics = queryMetrics.slice(metricStart);
      const coldSqlMs = coldMetrics.length
        ? Math.max(...coldMetrics.map((metric) => metric.finishedAtMs)) -
          Math.min(...coldMetrics.map((metric) => metric.startedAtMs))
        : 0;
      const groups = cold.registryGroups;
      assert(groups, "Grouped search returned no hierarchy: " + query);
      assert(groups.bounded, "Grouped search exceeded its row bound: " + query);
      assert(
        groups.summary.totalRegistryPositions > 0,
        "Grouped search returned zero positions: " + query,
      );
      assert(
        coldMetrics.length <= 5,
        "Grouped search exceeded the SQL query-count budget: " + query,
      );
      const serializationStarted = performance.now();
      const responseBytes = Buffer.byteLength(JSON.stringify(cold), "utf8");
      const serializationMs = performance.now() - serializationStarted;
      assert(
        responseBytes <= RESPONSE_SIZE_LIMIT_BYTES,
        "Grouped response exceeded 100 KB: " + query,
      );

      const warmTimings: number[] = [];
      const warmMetricStart = queryMetrics.length;
      for (let sampleIndex = 0; sampleIndex < WARM_SAMPLES; sampleIndex += 1) {
        const started = performance.now();
        const measured = await searchCatalog(groupedInput, store);
        warmTimings.push(performance.now() - started);
        assert(
          measured.registryGroups?.summary.totalRegistryPositions ===
            groups.summary.totalRegistryPositions,
          "Cached grouped totals changed: " + query,
        );
      }
      assert(
        queryMetrics.length === warmMetricStart,
        "Cached grouped search unexpectedly executed SQL: " + query,
      );
      const warm = timingSummary(warmTimings);
      assert(
        warm.p95Ms <= maxGroupedP95Ms,
        "Grouped p95 exceeded the warm latency budget: " +
          query +
          " (" +
          warm.p95Ms +
          " ms > " +
          maxGroupedP95Ms +
          " ms).",
      );
      assert(
        warm.maxMs <= 1_500,
        "A grouped warm query exceeded 1500 ms: " + query,
      );

      const firstGroup = groups.groups.items[0];
      const firstTrade = firstGroup?.tradeNames.items[0];
      assert(
        firstGroup && firstTrade,
        "Grouped hierarchy is incomplete: " + query,
      );
      const navigationInputs = [
        input({
          q: query,
          view: "grouped",
          groupPage: Math.min(2, groups.groups.totalPages),
        }),
        input({
          q: query,
          view: "grouped",
          groupKey: firstGroup.key,
          tradePage: Math.min(2, firstGroup.tradeNames.totalPages),
        }),
        input({
          q: query,
          view: "grouped",
          groupKey: firstGroup.key,
          tradeNameKey: firstTrade.key,
          variantPage: 1,
        }),
      ];
      const navigationTimings: number[] = [];
      for (let sampleIndex = 0; sampleIndex < WARM_SAMPLES; sampleIndex += 1) {
        for (const navigationInput of navigationInputs) {
          const started = performance.now();
          const navigation = await searchCatalog(navigationInput, store);
          navigationTimings.push(performance.now() - started);
          assert(
            navigation.registryGroups,
            "Grouped navigation returned no hierarchy.",
          );
          assert(
            Buffer.byteLength(JSON.stringify(navigation), "utf8") <=
              RESPONSE_SIZE_LIMIT_BYTES,
            "Grouped navigation response exceeded 100 KB.",
          );
        }
      }
      assert(
        queryMetrics.length === warmMetricStart,
        "Grouped navigation unexpectedly executed SQL: " + query,
      );
      const navigation = timingSummary(navigationTimings);
      assert(
        navigation.p95Ms <= maxNavigationP95Ms,
        "Grouped navigation p95 exceeded the latency budget: " +
          query +
          " (" +
          navigation.p95Ms +
          " ms > " +
          maxNavigationP95Ms +
          " ms).",
      );

      groupedRepresentative.push({
        query,
        positions: groups.summary.totalRegistryPositions,
        groups: groups.groups.total,
        coldMs: Number(coldMs.toFixed(1)),
        coldSqlMs: Number(coldSqlMs.toFixed(1)),
        backendMs: Number(Math.max(0, coldMs - coldSqlMs).toFixed(1)),
        coldQueries: coldMetrics.length,
        warm,
        responseBytes,
        serializationMs: Number(serializationMs.toFixed(1)),
        navigation,
      });
    }
    const prefixPerformance: Array<{
      query: string;
      coldMs: number;
      warm: ReturnType<typeof timingSummary>;
      responseBytes: number;
    }> = [];
    for (const query of PREFIX_QUERIES) {
      resetRegistrySearchCachesForTests();
      const prefixInput = input({ q: query, view: "grouped" });
      const coldStarted = performance.now();
      const cold = await searchCatalog(prefixInput, store);
      const coldMs = performance.now() - coldStarted;
      assert(
        cold.registryGroups,
        "Prefix search returned no grouped hierarchy.",
      );
      const responseBytes = Buffer.byteLength(JSON.stringify(cold), "utf8");
      assert(
        responseBytes <= RESPONSE_SIZE_LIMIT_BYTES,
        "Prefix response exceeded 100 KB.",
      );
      const timings: number[] = [];
      const metricStart = queryMetrics.length;
      for (let sampleIndex = 0; sampleIndex < WARM_SAMPLES; sampleIndex += 1) {
        const started = performance.now();
        const warm = await searchCatalog(prefixInput, store);
        timings.push(performance.now() - started);
        assert(
          warm.registryGroups,
          "Cached prefix search lost grouped hierarchy.",
        );
      }
      assert(
        queryMetrics.length === metricStart,
        "Cached prefix search unexpectedly executed SQL.",
      );
      const warm = timingSummary(timings);
      assert(
        warm.p50Ms <= maxPrefixP50Ms,
        "Prefix p50 exceeded the latency budget: " + query + ".",
      );
      prefixPerformance.push({
        query,
        coldMs: Number(coldMs.toFixed(1)),
        warm,
        responseBytes,
      });
    }
    const sample = first.items.find(
      (item) =>
        item.manufacturers[0]?.name &&
        item.registration.number &&
        item.inn &&
        item.dosageForm,
    );
    assert(sample, "Browse page has no complete registry sample.");

    const uniqueRegistration = await readOnlyQuery<{
      registration_number: string;
      registry_id: string;
    }>(
      `SELECT registration_number, MIN(registry_id) AS registry_id
       FROM knowledge_registry_products
       WHERE NULLIF(TRIM(registration_number), '') IS NOT NULL
       GROUP BY registration_number
       HAVING COUNT(*) = 1
       ORDER BY registration_number
       LIMIT 1`,
    );
    const exactFixture = uniqueRegistration.rows[0];
    assert(exactFixture, "Isolated fixture has no unique registration number.");
    resetRegistrySearchCachesForTests();
    const exactInput = input({
      q: exactFixture.registration_number,
      type: "registry_products",
      view: "grouped",
    });
    const exactMetricStart = queryMetrics.length;
    const exactColdStarted = performance.now();
    const exactCold = await searchCatalog(exactInput, store);
    const exactColdMs = performance.now() - exactColdStarted;
    const exactColdMetrics = queryMetrics.slice(exactMetricStart);
    assert(
      exactCold.view === "flat",
      "Unique registration did not use exact fast path.",
    );
    assert(
      exactCold.registryProducts.items[0]?.id === exactFixture.registry_id,
      "Exact registration returned a different product.",
    );
    assert(
      exactColdMetrics.length <= 4,
      "Exact fast path exceeded four SQL queries.",
    );
    const exactResponseBytes = Buffer.byteLength(
      JSON.stringify(exactCold),
      "utf8",
    );
    assert(
      exactResponseBytes <= RESPONSE_SIZE_LIMIT_BYTES,
      "Exact response exceeded 100 KB.",
    );
    const exactWarmTimings: number[] = [];
    const exactWarmMetricStart = queryMetrics.length;
    for (let sampleIndex = 0; sampleIndex < WARM_SAMPLES; sampleIndex += 1) {
      const started = performance.now();
      const result = await searchCatalog(exactInput, store);
      exactWarmTimings.push(performance.now() - started);
      assert(
        result.registryProducts.items[0]?.id === exactFixture.registry_id,
        "Cached exact result changed.",
      );
    }
    assert(
      queryMetrics.length === exactWarmMetricStart,
      "Cached exact search unexpectedly executed SQL.",
    );
    const exactWarm = timingSummary(exactWarmTimings);
    assert(
      exactWarm.p50Ms <= maxExactP50Ms,
      "Exact p50 exceeded the latency budget.",
    );

    const browseTimings: number[] = [];
    let browseResponseBytes = 0;
    for (let sampleIndex = 0; sampleIndex < WARM_SAMPLES; sampleIndex += 1) {
      const started = performance.now();
      const browse = await store.searchProducts(
        input({ page: (sampleIndex % 2) + 1 }),
      );
      browseTimings.push(performance.now() - started);
      browseResponseBytes = Math.max(
        browseResponseBytes,
        Buffer.byteLength(JSON.stringify(browse), "utf8"),
      );
    }
    const browseWarm = timingSummary(browseTimings);
    assert(
      browseWarm.p95Ms <= maxNavigationP95Ms,
      "Browse pagination p95 exceeded the latency budget.",
    );
    assert(
      browseResponseBytes <= RESPONSE_SIZE_LIMIT_BYTES,
      "Browse response exceeded 100 KB.",
    );

    const manufacturer = await store.searchProducts(
      input({ manufacturer: sample.manufacturers[0].name }),
    );
    assert(
      manufacturer.filteredTotal > 0,
      "Manufacturer filter returned zero rows.",
    );

    const registration = await store.searchProducts(
      input({ q: sample.registration.number }),
    );
    assert(
      registration.items.some((item) => item.id === sample.id),
      "Exact registration-number search did not return its product.",
    );

    const inn = await store.searchProducts(input({ q: sample.inn }));
    assert(
      inn.filteredTotal > 0,
      "Exact registry INN search returned zero rows.",
    );

    const form = await store.searchProducts(input({ q: sample.dosageForm }));
    assert(form.filteredTotal > 0, "Dosage-form search returned zero rows.");

    const mappedRow = await readOnlyQuery<{ trade_name: string }>(
      `SELECT p.trade_name
       FROM knowledge_registry_products p
       JOIN knowledge_ingredient_names n
         ON LOWER(n.name) = LOWER(p.inn)
        AND n.review_status = 'approved'
       ORDER BY p.trade_name
       LIMIT 1`,
    );
    assert(
      mappedRow.rows[0],
      "Isolated fixture has no approved registry INN mapping.",
    );
    const mapped = await store.searchProducts(
      input({ q: mappedRow.rows[0].trade_name }),
    );
    assert(
      mapped.items.some((item) => item.mappingStatus === "approved"),
      "Approved product mapping was not exposed as approved.",
    );

    const groupedStatement = queryMetrics.find(
      (metric) => metric.label === "registry-grouped-page",
    );
    assert(groupedStatement, "Grouped SQL statement was not observed.");
    const planResult = await readOnlyQuery<{ "QUERY PLAN": unknown }>(
      "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON, TIMING OFF) " +
        groupedStatement.statement,
      [...groupedStatement.values],
    );
    const queryPlan = summarizeQueryPlan(
      planResult.rows[0]?.["QUERY PLAN"] ?? null,
    );
    const exactStatement = queryMetrics.find(
      (metric) => metric.label === "registry-exact-product",
    );
    assert(exactStatement, "Exact SQL statement was not observed.");
    const exactPlanResult = await readOnlyQuery<{ "QUERY PLAN": unknown }>(
      "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON, TIMING OFF) " +
        exactStatement.statement,
      [...exactStatement.values],
    );
    const exactQueryPlan = summarizeQueryPlan(
      exactPlanResult.rows[0]?.["QUERY PLAN"] ?? null,
    );
    const exactPerformance = {
      coldMs: Number(exactColdMs.toFixed(1)),
      coldQueries: exactColdMetrics.length,
      warm: exactWarm,
      responseBytes: exactResponseBytes,
    };
    const browsePerformance = {
      warm: browseWarm,
      responseBytes: browseResponseBytes,
    };
    const [coverageRowsResult, approvedMappingsResult] = await Promise.all([
      readOnlyQuery<CoverageRegistryRow>(
        `SELECT registry_id,
                trade_name,
                inn,
                active_ingredient,
                registration_number,
                source_key,
                import_batch_id,
                raw_hash
         FROM knowledge_registry_products
         ORDER BY registry_id`,
      ),
      readOnlyQuery<{
        normalized: string;
        ingredient_inn_key: string;
      }>(
        `SELECT normalized, ingredient_inn_key
         FROM knowledge_ingredient_names
         WHERE review_status = 'approved'
         ORDER BY normalized`,
      ),
    ]);
    assert(
      coverageRowsResult.rows.length === first.catalogTotal,
      "Catalog coverage source row count differs from the runtime catalog total.",
    );
    const approvedMappingByName = new Map(
      approvedMappingsResult.rows.map(
        (row) =>
          [
            normalize(row.normalized),
            normalize(row.ingredient_inn_key),
          ] as const,
      ),
    );
    const fingerprintHash = createHash("sha256");
    for (const row of coverageRowsResult.rows) {
      fingerprintHash.update(row.registry_id);
      fingerprintHash.update("\u0000");
      fingerprintHash.update(row.raw_hash);
      fingerprintHash.update("\n");
    }
    const catalogFingerprintSha256 = fingerprintHash.digest("hex");
    const fixtureSets = buildCoverageFixtures(
      coverageRowsResult.rows,
      approvedMappingByName,
      catalogFingerprintSha256,
    );
    const coverageFixtures = [
      ...fixtureSets.mandatory,
      ...fixtureSets.deterministic,
      ...fixtureSets.typos,
    ];
    const expectedCoverageFixtureCount =
      MANDATORY_QUERIES.length +
      Object.values(COVERAGE_QUOTAS).reduce((sum, count) => sum + count, 0) +
      TYPO_CASE_COUNT;
    assert(
      coverageFixtures.length === expectedCoverageFixtureCount,
      "Catalog DB coverage fixture total is inconsistent.",
    );
    const coverage = await evaluateCoverage(
      store,
      coverageFixtures,
      expectedExactProducts ?? first.catalogTotal,
      maxWarmMs,
    );
    const coverageMisses = coverage.evaluations.filter((item) => !item.passed);
    const coverageSummary = {
      totalQueries: coverage.evaluations.length,
      passed: coverage.evaluations.length - coverageMisses.length,
      misses: coverageMisses.length,
      mandatoryMisses: coverageMisses.filter(
        (item) => item.category === "mandatory",
      ).length,
      deterministicMisses: coverageMisses.filter(
        (item) =>
          item.category !== "mandatory" &&
          item.category !== "unique_one_edit_typo",
      ).length,
      uniqueOneEditTypoMisses: coverageMisses.filter(
        (item) => item.category === "unique_one_edit_typo",
      ).length,
      uniqueSearches: coverage.uniqueSearches,
      latency: coverage.latency,
    };
    const coverageReportCases = coverage.evaluations.map((item) => ({
      id: item.id,
      category: item.category,
      query: item.query,
      provenance: item.provenance,
      expectedTargetCount: item.expectedTargetCount,
      resultCount: item.resultCount,
      matched: item.matched
        ? {
            registryId: item.matched.registryId,
            registrationNumber: item.matched.registrationNumber,
          }
        : null,
      unrelatedResultCount: item.unrelatedResultCount,
      unrelatedSample: item.unrelatedSample,
      responseBytes: item.responseBytes,
      durationMs: item.durationMs,
      passed: item.passed,
      failures: item.failures,
    }));
    const coverageReport = {
      version: "1.0-db-catalog-search-coverage",
      database: authorization.databaseLabel,
      catalogTotal: first.catalogTotal,
      catalogFingerprintSha256,
      policy: {
        mandatoryQueries: MANDATORY_QUERIES.length,
        deterministicQueries: fixtureSets.deterministic.length,
        uniqueOneEditQueries: fixtureSets.typos.length,
        exactCatalogTotal: expectedExactProducts ?? first.catalogTotal,
        categoryQuotas: COVERAGE_QUOTAS,
        responseSizeLimitBytes: RESPONSE_SIZE_LIMIT_BYTES,
        perQueryLatencyBudgetMs: maxWarmMs,
      },
      summary: coverageSummary,
      cases: coverageReportCases,
    };
    const coverageReportJson = `${JSON.stringify(coverageReport)}\n`;
    const coverageReportBytes = Buffer.byteLength(coverageReportJson, "utf8");
    assert(
      coverageReportBytes <= COVERAGE_REPORT_SIZE_LIMIT_BYTES,
      "Catalog DB coverage report exceeded its 100 KB bound.",
    );
    assert(
      !/DATABASE_URL|postgres(?:ql)?:\/\/|[A-Za-z]:\\/i.test(
        coverageReportJson,
      ),
      "Catalog DB coverage report leaks sensitive diagnostics.",
    );
    mkdirSync(dirname(coverageReportPath), { recursive: true });
    writeFileSync(coverageReportPath, coverageReportJson, "utf8");
    if (coverageMisses.length > 0) {
      console.error(
        JSON.stringify(
          {
            coverageMisses: coverageReportCases
              .filter((item) => !item.passed)
              .slice(0, 10),
          },
          null,
          2,
        ),
      );
    }
    assert(
      coverageMisses.length === 0,
      `Catalog DB coverage reported ${coverageMisses.length} misses.`,
    );
    const serialized = JSON.stringify({
      catalogTotal: first.catalogTotal,
      page25: first.items.length,
      page50: page50.items.length,
      representative,
      groupedRepresentative,
      prefixPerformance,
      queryPlan,
      exactPerformance,
      exactQueryPlan,
      browsePerformance,
      coverageSummary,
    });
    assert(
      serialized.length < 100_000,
      "Catalog smoke report is unexpectedly large.",
    );
    assert(
      !/DATABASE_URL|postgres(?:ql)?:\/\/|[A-Za-z]:\\/i.test(serialized),
      "Catalog smoke output leaks sensitive diagnostics.",
    );

    const idleTransactions =
      await assertCatalogSmokeHasNoIdleTransactions(readOnlyExecutor);
    console.log(
      JSON.stringify(
        {
          ok: true,
          database: authorization.databaseLabel,
          idleTransactions,
          catalogTotal: first.catalogTotal,
          page25: first.items.length,
          page50: page50.items.length,
          representative,
          groupedRepresentative,
          prefixPerformance,
          queryPlan,
          exactPerformance,
          exactQueryPlan,
          browsePerformance,
          coverage: {
            ...coverageSummary,
            report: "catalog-search-db-coverage-report.json",
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await closeCatalogSmokePool(pool);
  }
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exitCode = 1;
});
