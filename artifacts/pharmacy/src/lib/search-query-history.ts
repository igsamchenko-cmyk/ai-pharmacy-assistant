export const SEARCH_QUERY_HISTORY_LIMIT = 5;
export const SEARCH_QUERY_HISTORY_KEY = "farmassist:search-query-history:v1";

export function normalizeSearchHistoryQuery(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 120);
}

export function updateSearchQueryHistory(
  current: readonly string[],
  value: string,
): string[] {
  const query = normalizeSearchHistoryQuery(value);
  if (query.length < 3)
    return [...current].slice(0, SEARCH_QUERY_HISTORY_LIMIT);
  const key = query.toLocaleLowerCase("uk-UA");
  return [
    query,
    ...current.filter(
      (item) =>
        normalizeSearchHistoryQuery(item).toLocaleLowerCase("uk-UA") !== key,
    ),
  ].slice(0, SEARCH_QUERY_HISTORY_LIMIT);
}

function parseStoredHistory(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map(normalizeSearchHistoryQuery)
      .filter((item) => item.length >= 3)
      .slice(0, SEARCH_QUERY_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function readSearchQueryHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return parseStoredHistory(
      window.localStorage.getItem(SEARCH_QUERY_HISTORY_KEY),
    );
  } catch {
    return [];
  }
}
export function recordSearchQuery(value: string): string[] {
  const next = updateSearchQueryHistory(readSearchQueryHistory(), value);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        SEARCH_QUERY_HISTORY_KEY,
        JSON.stringify(next),
      );
    } catch {
      // Search must remain usable if private browsing blocks localStorage.
    }
  }
  return next;
}
