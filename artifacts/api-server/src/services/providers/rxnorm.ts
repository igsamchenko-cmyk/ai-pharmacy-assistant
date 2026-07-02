import { TtlCache } from "../../lib/cache";
import { logger } from "../../lib/logger";

/**
 * RxNorm provider — public NIH/NLM drug terminology API (rxnav.nlm.nih.gov).
 * No API key required. All lookups are cached and degrade to `null` on any
 * network/parse error so callers never crash.
 */

export interface RxNormInfo {
  rxcui: string;
  name: string;
  /** Ingredient concepts (tty=IN). */
  ingredients: string[];
  /** Brand-name concepts (tty=BN). */
  brands: string[];
}

const BASE_URL = "https://rxnav.nlm.nih.gov/REST";
const TIMEOUT_MS = 6000;
const TTL_MS = 24 * 60 * 60 * 1000; // 24h — terminology data is stable.

const cache = new TtlCache<RxNormInfo | null>({ ttlMs: TTL_MS, maxEntries: 300 });

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch (err) {
    logger.warn({ err, url }, "RxNorm request failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractConceptNames(
  related: unknown,
  tty: string,
): string[] {
  const groups =
    (related as { allRelatedGroup?: { conceptGroup?: unknown[] } })
      ?.allRelatedGroup?.conceptGroup ?? [];
  const names: string[] = [];
  for (const group of groups as Array<{
    tty?: string;
    conceptProperties?: Array<{ name?: string }>;
  }>) {
    if (group?.tty !== tty) continue;
    for (const prop of group.conceptProperties ?? []) {
      if (prop?.name) names.push(prop.name);
    }
  }
  // De-duplicate while preserving order.
  return [...new Set(names)];
}

async function lookup(name: string): Promise<RxNormInfo | null> {
  const idData = await fetchJson(
    `${BASE_URL}/rxcui.json?name=${encodeURIComponent(name)}&search=2`,
  );
  const rxcui = (
    idData as { idGroup?: { rxnormId?: string[] } }
  )?.idGroup?.rxnormId?.[0];
  if (!rxcui) return null;

  const related = await fetchJson(`${BASE_URL}/rxcui/${rxcui}/allrelated.json`);

  return {
    rxcui,
    name,
    ingredients: related ? extractConceptNames(related, "IN") : [],
    brands: related ? extractConceptNames(related, "BN") : [],
  };
}

/** Look up RxNorm data for a drug name (brand or INN). Cached; null on miss. */
export async function searchRxNorm(name: string): Promise<RxNormInfo | null> {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  return cache.getOrSet(key, () => lookup(name.trim()));
}

/** Test helper — clears the module cache. */
export function __clearRxNormCache(): void {
  cache.clear();
}
