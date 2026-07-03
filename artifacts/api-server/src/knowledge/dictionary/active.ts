/**
 * Active dictionary provider entrypoint.
 *
 * Runtime dictionary lookups go through this seam instead of importing the
 * static functions directly, so the `KNOWLEDGE_DB_RUNTIME` flag is actually
 * effective. `selectDictionaryProvider()` returns the static provider by default
 * (and whenever the flag is on but no DB entries are wired), guaranteeing the
 * default runtime stays static. A future DB-backed runtime only has to supply
 * `dbEntries` here to take over.
 */
import type { DictionaryEntry } from "./index";
import { selectDictionaryProvider } from "./provider";

/** Resolve the active provider (reads KNOWLEDGE_DB_RUNTIME; default static). */
export function activeDictionaryProvider() {
  return selectDictionaryProvider();
}

/** Runtime name→ingredient lookup through the active provider. */
export function resolveName(query: string): DictionaryEntry | null {
  return activeDictionaryProvider().normalizeQuery(query);
}
