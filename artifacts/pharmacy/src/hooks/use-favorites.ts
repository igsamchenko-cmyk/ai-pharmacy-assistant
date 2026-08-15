import { useCallback, useSyncExternalStore } from "react";
import {
  REGISTRATION_NUMBER_PATTERN,
  REGISTRY_PRODUCT_ID_PATTERN,
} from "@/lib/registry-product-route";

/** Browser-local reference used by favourites and recently viewed lists. */
export interface DrugRef {
  id: string;
  brandName: string;
  inn: string;
  dosage?: string;
  form?: string;
  manufacturer?: string;
  registration?: string;
  href?: string;
  ts?: number;
}

interface DrugRefStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const FAVORITES_KEY = "farmassist:favorites";
export const RECENT_KEY = "farmassist:recent";
export const RECENT_LIMIT = 20;
const FAVORITES_LIMIT = 100;
const SAFE_LEGACY_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;

type Listener = () => void;
const listeners = new Set<Listener>();

function storage(): DrugRefStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === FAVORITES_KEY || event.key === RECENT_KEY) emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function optionalText(value: unknown, maxLength = 300): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, maxLength);
  return normalized || undefined;
}

function normalizeHref(
  id: string,
  hrefValue: unknown,
  registrationValue: unknown,
): { href?: string; registration?: string } | null {
  const href = optionalText(hrefValue, 500);
  const suppliedRegistration = optionalText(registrationValue, 50);

  if (!href) {
    return SAFE_LEGACY_ID_PATTERN.test(id) ? {} : null;
  }
  if (!href.startsWith("/") || href.startsWith("//")) return null;

  const url = new URL(href, "https://farmassist.local");
  const registryMatch = url.pathname.match(/^\/products\/([A-F0-9]{32})$/u);
  if (registryMatch) {
    const registration = url.searchParams.get("registration")?.trim() ?? "";
    if (
      registryMatch[1] !== id ||
      !REGISTRY_PRODUCT_ID_PATTERN.test(id) ||
      !REGISTRATION_NUMBER_PATTERN.test(registration) ||
      (suppliedRegistration && suppliedRegistration !== registration)
    ) {
      return null;
    }
    return {
      href: url.pathname + "?registration=" + encodeURIComponent(registration),
      registration,
    };
  }

  const legacyHref = "/drug/" + encodeURIComponent(id);
  if (!SAFE_LEGACY_ID_PATTERN.test(id) || href !== legacyHref) return null;
  return { href };
}

export function normalizeDrugRef(value: unknown): DrugRef | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const id = optionalText(candidate.id, 128);
  const brandName = optionalText(candidate.brandName, 300);
  if (!id || !brandName) return null;

  const route = normalizeHref(id, candidate.href, candidate.registration);
  if (!route) return null;

  const dosage = optionalText(candidate.dosage);
  const form = optionalText(candidate.form);
  const manufacturer = optionalText(candidate.manufacturer, 500);
  const ts =
    typeof candidate.ts === "number" &&
    Number.isFinite(candidate.ts) &&
    candidate.ts > 0
      ? Math.floor(candidate.ts)
      : undefined;
  return {
    id,
    brandName,
    inn: optionalText(candidate.inn, 500) ?? "",
    ...(dosage ? { dosage } : {}),
    ...(form ? { form } : {}),
    ...(manufacturer ? { manufacturer } : {}),
    ...(route.registration ? { registration: route.registration } : {}),
    ...(route.href ? { href: route.href } : {}),
    ...(ts ? { ts } : {}),
  };
}

export function sanitizeDrugRefs(
  value: unknown,
  limit = FAVORITES_LIMIT,
): DrugRef[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: DrugRef[] = [];
  for (const item of value) {
    const normalized = normalizeDrugRef(item);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}

export function toggleFavoriteRefs(
  current: DrugRef[],
  drug: DrugRef,
): DrugRef[] {
  const normalized = normalizeDrugRef(drug);
  const sanitizedCurrent = sanitizeDrugRefs(current);
  if (!normalized) return sanitizedCurrent;
  return sanitizedCurrent.some((item) => item.id === normalized.id)
    ? sanitizedCurrent.filter((item) => item.id !== normalized.id)
    : [normalized, ...sanitizedCurrent];
}

export function recordRecentlyViewedRefs(
  current: DrugRef[],
  drug: DrugRef,
  ts = Date.now(),
): DrugRef[] {
  const normalized = normalizeDrugRef({ ...drug, ts });
  if (!normalized) return sanitizeDrugRefs(current, RECENT_LIMIT);
  return sanitizeDrugRefs(
    [normalized, ...current.filter((item) => item.id !== normalized.id)],
    RECENT_LIMIT,
  );
}

export function readStoredDrugRefs(
  target: DrugRefStorage,
  key: string,
  limit = FAVORITES_LIMIT,
): DrugRef[] {
  const raw = target.getItem(key);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const sanitized = sanitizeDrugRefs(parsed, limit);
    const cleanRaw = JSON.stringify(sanitized);
    if (cleanRaw !== raw) target.setItem(key, cleanRaw);
    return sanitized;
  } catch {
    target.setItem(key, "[]");
    return [];
  }
}

function read(key: string, limit = FAVORITES_LIMIT): DrugRef[] {
  const target = storage();
  return target ? readStoredDrugRefs(target, key, limit) : [];
}

function write(key: string, value: DrugRef[], limit = FAVORITES_LIMIT): void {
  const target = storage();
  if (target) {
    try {
      target.setItem(key, JSON.stringify(sanitizeDrugRefs(value, limit)));
    } catch {
      // Browser storage can be unavailable in privacy mode; keep UX best-effort.
    }
  }
  emit();
}

let favCache: DrugRef[] = [];
let favRaw = "";
let recentCache: DrugRef[] = [];
let recentRaw = "";

function getFavoritesSnapshot(): DrugRef[] {
  const target = storage();
  const raw = target?.getItem(FAVORITES_KEY) ?? "";
  if (raw !== favRaw) {
    favRaw = raw;
    favCache = target ? readStoredDrugRefs(target, FAVORITES_KEY) : [];
  }
  return favCache;
}

function getRecentSnapshot(): DrugRef[] {
  const target = storage();
  const raw = target?.getItem(RECENT_KEY) ?? "";
  if (raw !== recentRaw) {
    recentRaw = raw;
    recentCache = target
      ? readStoredDrugRefs(target, RECENT_KEY, RECENT_LIMIT)
      : [];
  }
  return recentCache;
}

const emptySnapshot: DrugRef[] = [];

export function useFavorites() {
  const favorites = useSyncExternalStore(
    subscribe,
    getFavoritesSnapshot,
    () => emptySnapshot,
  );

  const isFavorite = useCallback(
    (id: string) => favorites.some((drug) => drug.id === id),
    [favorites],
  );

  const toggleFavorite = useCallback((drug: DrugRef) => {
    write(FAVORITES_KEY, toggleFavoriteRefs(read(FAVORITES_KEY), drug));
  }, []);

  const removeFavorite = useCallback((id: string) => {
    write(
      FAVORITES_KEY,
      read(FAVORITES_KEY).filter((item) => item.id !== id),
    );
  }, []);

  const clearFavorites = useCallback(() => write(FAVORITES_KEY, []), []);

  return {
    favorites,
    isFavorite,
    toggleFavorite,
    removeFavorite,
    clearFavorites,
  };
}

export function useRecentlyViewed() {
  return useSyncExternalStore(
    subscribe,
    getRecentSnapshot,
    () => emptySnapshot,
  );
}

export function recordRecentlyViewed(drug: DrugRef): void {
  const normalized = normalizeDrugRef(drug);
  if (!normalized) return;

  const viewed = { ...normalized, ts: Date.now() };
  const favorites = read(FAVORITES_KEY);
  if (favorites.some((item) => item.id === normalized.id)) {
    write(
      FAVORITES_KEY,
      favorites.map((item) => (item.id === normalized.id ? viewed : item)),
    );
  }

  write(
    RECENT_KEY,
    recordRecentlyViewedRefs(read(RECENT_KEY, RECENT_LIMIT), viewed, viewed.ts),
    RECENT_LIMIT,
  );
}

export function removeRecentlyViewed(id: string): void {
  write(
    RECENT_KEY,
    read(RECENT_KEY, RECENT_LIMIT).filter((item) => item.id !== id),
    RECENT_LIMIT,
  );
}

export function clearRecentlyViewed(): void {
  write(RECENT_KEY, [], RECENT_LIMIT);
}

/** Remove a valid-looking local reference after the exact product route returns no match. */
export function removeStaleDrugRef(id: string, href: string): void {
  for (const [key, limit] of [
    [FAVORITES_KEY, FAVORITES_LIMIT],
    [RECENT_KEY, RECENT_LIMIT],
  ] as const) {
    const current = read(key, limit);
    const next = current.filter((item) => item.id !== id || item.href !== href);
    if (next.length !== current.length) write(key, next, limit);
  }
}

export function drugRefHref(drug: DrugRef): string {
  return drug.href || "/drug/" + encodeURIComponent(drug.id);
}
