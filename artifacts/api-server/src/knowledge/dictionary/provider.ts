/**
 * Dictionary provider bridge (v0.4).
 *
 * A seam between the runtime and the source of dictionary data. The static
 * provider (the default) delegates to the in-memory dictionary built from the
 * seed modules. A DB provider can be constructed from rows fetched elsewhere
 * (kept pure — rows are injected, no DB import here) and is only selected when
 * the `KNOWLEDGE_DB_RUNTIME` flag is on. This lets a DB-backed runtime be built
 * and tested without switching default behavior.
 */
import { normalize } from "../../lib/text";
import { isDbRuntimeEnabled } from "../runtime";
import {
  listDictionaryEntries,
  normalizeQuery as staticNormalizeQuery,
  type DictionaryEntry,
} from "./index";

export interface DictionaryProvider {
  readonly id: string;
  normalizeQuery(query: string): DictionaryEntry | null;
  listEntries(): readonly DictionaryEntry[];
}

/** Default provider: the static, seed-built dictionary. */
export const staticDictionaryProvider: DictionaryProvider = {
  id: "static",
  normalizeQuery: staticNormalizeQuery,
  listEntries: listDictionaryEntries,
};

/**
 * Build a provider from a fixed set of entries (e.g. rows loaded from the DB).
 * Pure: the caller fetches rows; this only indexes and serves them, mirroring
 * the static provider's exact + substring lookup semantics.
 */
export function createDbDictionaryProvider(
  entries: readonly DictionaryEntry[],
): DictionaryProvider {
  const byName = new Map<string, DictionaryEntry>();
  for (const e of entries) {
    const key = normalize(e.name);
    if (key && !byName.has(key)) byName.set(key, e);
  }
  return {
    id: "db",
    listEntries: () => entries,
    normalizeQuery(query: string): DictionaryEntry | null {
      const key = normalize(query);
      if (key === "") return null;
      const exact = byName.get(key);
      if (exact) return exact;
      if (key.length >= 3) {
        for (const [name, entry] of byName) {
          if (key.includes(name) || name.includes(key)) return entry;
        }
      }
      return null;
    },
  };
}

export interface ProviderSelection {
  /** Override the flag (defaults to reading KNOWLEDGE_DB_RUNTIME). */
  dbRuntime?: boolean;
  /** Entries for the DB provider; required to actually use it. */
  dbEntries?: readonly DictionaryEntry[];
  env?: NodeJS.ProcessEnv;
}

/**
 * Choose the active provider. Returns the DB provider only when the flag is on
 * AND entries are supplied; otherwise the static provider. This guarantees the
 * default runtime stays static even if the flag is set but no DB data is wired.
 */
export function selectDictionaryProvider(
  opts: ProviderSelection = {},
): DictionaryProvider {
  const flag = opts.dbRuntime ?? isDbRuntimeEnabled(opts.env);
  if (flag && opts.dbEntries && opts.dbEntries.length > 0) {
    return createDbDictionaryProvider(opts.dbEntries);
  }
  return staticDictionaryProvider;
}
