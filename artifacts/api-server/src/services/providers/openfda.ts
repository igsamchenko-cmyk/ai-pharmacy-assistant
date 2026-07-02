import { TtlCache } from "../../lib/cache";
import { logger } from "../../lib/logger";

/**
 * openFDA provider — public FDA drug label API (api.fda.gov). Works without a
 * key; an optional OPENFDA_API_KEY simply raises rate limits. All lookups are
 * cached and degrade to `null` on any network/parse error.
 *
 * Note: openFDA labels are US data in English — surfaced as supplementary
 * reference only, never as a source of Ukrainian prescribing information.
 */

export interface OpenFdaInfo {
  brandName: string | null;
  genericName: string | null;
  manufacturer: string | null;
  purpose: string | null;
  warnings: string | null;
}

const BASE_URL = "https://api.fda.gov/drug/label.json";
const TIMEOUT_MS = 6000;
const TTL_MS = 12 * 60 * 60 * 1000; // 12h.

const cache = new TtlCache<OpenFdaInfo | null>({ ttlMs: TTL_MS, maxEntries: 300 });

function firstString(value: unknown): string | null {
  if (Array.isArray(value)) {
    const first = value.find((v) => typeof v === "string" && v.trim() !== "");
    return typeof first === "string" ? first.trim() : null;
  }
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Escape a value so it is safe to embed inside a quoted openFDA/Lucene phrase.
 * Only backslash and double-quote can break out of a quoted phrase, so escaping
 * them keeps the caller-supplied name a literal search term.
 */
function escapeLucenePhrase(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function lookup(name: string): Promise<OpenFdaInfo | null> {
  const term = escapeLucenePhrase(name);
  const search = `openfda.generic_name:"${term}"+openfda.brand_name:"${term}"`;
  const params = new URLSearchParams({ search, limit: "1" });
  const apiKey = process.env.OPENFDA_API_KEY;
  if (apiKey && apiKey.trim() !== "") params.set("api_key", apiKey.trim());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    // 404 means "no matching label" — a normal miss, not an error.
    if (res.status === 404) return null;
    if (!res.ok) return null;

    const data = (await res.json()) as {
      results?: Array<{
        openfda?: {
          brand_name?: unknown;
          generic_name?: unknown;
          manufacturer_name?: unknown;
        };
        purpose?: unknown;
        warnings?: unknown;
      }>;
    };
    const result = data.results?.[0];
    if (!result) return null;

    return {
      brandName: firstString(result.openfda?.brand_name),
      genericName: firstString(result.openfda?.generic_name),
      manufacturer: firstString(result.openfda?.manufacturer_name),
      purpose: firstString(result.purpose),
      warnings: firstString(result.warnings),
    };
  } catch (err) {
    logger.warn({ err, name }, "openFDA request failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Look up an openFDA label for a drug name. Cached; null on miss/error. */
export async function searchOpenFda(name: string): Promise<OpenFdaInfo | null> {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  return cache.getOrSet(key, () => lookup(name.trim()));
}

/** Test helper — clears the module cache. */
export function __clearOpenFdaCache(): void {
  cache.clear();
}
