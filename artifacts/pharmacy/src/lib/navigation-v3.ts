export const SEARCH_URL_SYNC_DEBOUNCE_MS = 300;

export type ProductCardTab = "profile" | "analogs" | "instruction";
export type SavedTab = "history" | "favorites";

function normalizedSearch(search: string): string {
  if (!search) return "";
  return search.startsWith("?") ? search : `?${search}`;
}

export function searchAliasTarget(search: string): string {
  return `/${normalizedSearch(search)}`;
}

export function productCardTabFromSearch(search: string): ProductCardTab {
  const tab = new URLSearchParams(search).get("tab");
  return tab === "analogs" || tab === "instruction" ? tab : "profile";
}

export function productCardTabTarget(
  currentHref: string,
  productId: string,
  tab: ProductCardTab,
): string {
  const url = new URL(currentHref, "https://farmassist.local");
  url.searchParams.set("tab", tab);
  const hash = tab === "instruction" ? "#instruction" : "";
  return `/products/${encodeURIComponent(productId)}${url.search}${hash}`;
}

export function savedTabFromSearch(search: string): SavedTab {
  return new URLSearchParams(search).get("tab") === "favorites"
    ? "favorites"
    : "history";
}

export function favoritesAliasTarget(search: string): string {
  const params = new URLSearchParams(search);
  params.set("tab", "favorites");
  return `/history?${params.toString()}`;
}

export function instructionAliasTarget(
  productId: string,
  search: string,
  hash = "",
): string {
  const params = new URLSearchParams(search);
  if (!params.has("tab")) params.set("tab", "instruction");
  const targetHash = hash || "#instruction";
  return `/products/${encodeURIComponent(productId)}?${params.toString()}${targetHash}`;
}

export function legacyDrugSearchTarget(name?: string | null): string {
  const normalizedName = name?.trim();
  return normalizedName
    ? `/search?q=${encodeURIComponent(normalizedName)}`
    : "/search";
}

export function searchUrlWithQuery(currentHref: string, query: string): string {
  const url = new URL(currentHref, "https://farmassist.local");
  const normalizedQuery = query.trim();
  if (normalizedQuery) url.searchParams.set("q", normalizedQuery);
  else url.searchParams.delete("q");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function scanOpenFromSearch(search: string): boolean {
  return new URLSearchParams(search).get("scan") === "1";
}

export function searchUrlWithScan(currentHref: string, open: boolean): string {
  const url = new URL(currentHref, "https://farmassist.local");
  if (open) url.searchParams.set("scan", "1");
  else url.searchParams.delete("scan");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function ocrSearchText(result: {
  detectedName?: string | null;
  text?: string | null;
}): string {
  return (result.detectedName || result.text || "").trim();
}
