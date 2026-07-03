import { searchDrugs } from "../../services/drugService";
import { getExternalReference } from "../../services/externalDataService";
import type { DrugRecord } from "../../data/drugs";
import type { ExternalDrugReference } from "../../services/externalDataService";
import { type CanonicalIngredient } from "../dictionary";
import {
  resolveRuntimeName,
  type RuntimeKnowledgeSource,
  type RuntimeProvenance,
  type RuntimeConfidence,
  type RuntimeDbStore,
} from "../dbRuntime";
import { getAtcInfo, type AtcInfo } from "../atc";
import { TtlCache } from "./cache";

/**
 * The ordered stages the query passes through. The first stage that yields a
 * usable answer is reported as `resolvedStage`. "ai" means nothing resolved it
 * and the caller should offer the AI reference as a fallback.
 */
export type SearchStage =
  | "cache"
  | "dictionary"
  | "catalog"
  | "rxnorm"
  | "openfda"
  | "ai";

export interface KnowledgeSearchResult {
  query: string;
  /** Stage that produced the primary answer. */
  resolvedStage: SearchStage;
  /** Runtime source that produced the normalized answer or fallback. */
  source: RuntimeKnowledgeSource;
  fromCache: boolean;
  /** Canonical ingredient if the dictionary recognised the query. */
  normalized: CanonicalIngredient | null;
  confidence: RuntimeConfidence | null;
  provenance: RuntimeProvenance | null;
  /** ATC classification derived from the dictionary/catalog match. */
  atc: AtcInfo | null;
  /** Matching drugs from the local catalog. */
  catalogMatches: DrugRecord[];
  /** External references (RxNorm/openFDA); null fields when unavailable. */
  external: ExternalDrugReference | null;
  /** True when only the AI stage can help (offer AI reference in the UI). */
  suggestAi: boolean;
}

export interface SearchOptions {
  /** Skip network providers (RxNorm/openFDA). Used by tests and offline mode. */
  skipExternal?: boolean;
  /** Test/admin injection point; production uses the default DB store. */
  runtimeStore?: RuntimeDbStore;
}

const cache = new TtlCache<KnowledgeSearchResult>();

/** The English/Latin bridge name to feed US-centric external databases. */
function externalLookupName(
  normalized: CanonicalIngredient | null,
  catalogMatches: DrugRecord[],
  query: string,
): string {
  if (normalized) return normalized.english || normalized.latin;
  if (catalogMatches[0]) return catalogMatches[0].inn || catalogMatches[0].brandName;
  return query;
}

/**
 * Multi-stage search tuned for Ukrainian queries:
 * cache → dictionary (UA→Latin/English) → local catalog → RxNorm → openFDA → AI.
 * Every stage degrades gracefully; a missing OpenAI/Gemini key or a failing
 * provider never throws — the result simply reports what it could resolve.
 */
export async function knowledgeSearch(
  rawQuery: string,
  options: SearchOptions = {},
): Promise<KnowledgeSearchResult> {
  const query = rawQuery.trim();
  if (query === "") {
    return {
      query,
      resolvedStage: "ai",
      source: "fallback",
      fromCache: false,
      normalized: null,
      confidence: null,
      provenance: null,
      atc: null,
      catalogMatches: [],
      external: null,
      suggestAi: false,
    };
  }

  const cacheKey = `${query.toLowerCase()}::${options.skipExternal ? "local" : "full"}::${options.runtimeStore ? "store" : "default"}`;
  const cached = cache.get(cacheKey);
  if (cached) return { ...cached, fromCache: true };

  const resolved = await resolveRuntimeName(query, options.runtimeStore);
  const entry = resolved.entry;
  const normalized = entry?.ingredient ?? null;
  const atc = getAtcInfo(normalized?.atc);

  // Catalog: search the raw query and, if the dictionary resolved an INN, also
  // by that INN so brand-name queries still find catalog rows.
  const catalogMatches = dedupeById([
    ...searchDrugs(query),
    ...(normalized ? searchDrugs(normalized.inn, "inn") : []),
  ]);

  let external: ExternalDrugReference | null = null;
  if (!options.skipExternal) {
    const lookup = externalLookupName(normalized, catalogMatches, query);
    external = await getExternalReference({ name: lookup });
  }

  const resolvedStage: SearchStage = normalized
    ? "dictionary"
    : catalogMatches.length > 0
      ? "catalog"
      : external?.rxnorm
        ? "rxnorm"
        : external?.openfda
          ? "openfda"
          : "ai";

  const result: KnowledgeSearchResult = {
    query,
    resolvedStage,
    source: entry?.runtimeSource ?? resolved.source,
    fromCache: false,
    normalized,
    confidence: entry?.confidence ?? null,
    provenance: entry?.provenance ?? null,
    atc,
    catalogMatches,
    external,
    suggestAi: resolvedStage === "ai",
  };

  cache.set(cacheKey, result);
  return result;
}

function dedupeById(records: DrugRecord[]): DrugRecord[] {
  const seen = new Set<string>();
  const out: DrugRecord[] = [];
  for (const r of records) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

/** Exposed for tests and diagnostics. */
export function clearSearchCache(): void {
  cache.clear();
}

export { TtlCache } from "./cache";
