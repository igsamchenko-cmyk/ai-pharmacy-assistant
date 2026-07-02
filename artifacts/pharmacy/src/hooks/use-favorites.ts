import { useCallback, useSyncExternalStore } from "react";

/**
 * Client-side favorites and recently-viewed drugs, persisted in localStorage.
 * A tiny external store powers useSyncExternalStore so every component that
 * reads favourites/recents re-renders together, even across tabs.
 *
 * We store a minimal snapshot (id + names) so lists render without a refetch;
 * always open the drug detail for authoritative, up-to-date information.
 */
export interface DrugRef {
  id: string;
  brandName: string;
  inn: string;
}

const FAVORITES_KEY = "farmassist:favorites";
const RECENT_KEY = "farmassist:recent";
const RECENT_LIMIT = 8;

type Listener = () => void;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === FAVORITES_KEY || e.key === RECENT_KEY) emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function read(key: string): DrugRef[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is DrugRef =>
        x && typeof x.id === "string" && typeof x.brandName === "string",
    );
  } catch {
    return [];
  }
}

function write(key: string, value: DrugRef[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / privacy-mode errors — favourites are best-effort.
  }
  emit();
}

// Cache snapshots so useSyncExternalStore gets a stable reference until a write.
let favCache: DrugRef[] = [];
let favRaw = "";
let recentCache: DrugRef[] = [];
let recentRaw = "";

function getFavoritesSnapshot(): DrugRef[] {
  const raw = localStorage.getItem(FAVORITES_KEY) ?? "";
  if (raw !== favRaw) {
    favRaw = raw;
    favCache = read(FAVORITES_KEY);
  }
  return favCache;
}

function getRecentSnapshot(): DrugRef[] {
  const raw = localStorage.getItem(RECENT_KEY) ?? "";
  if (raw !== recentRaw) {
    recentRaw = raw;
    recentCache = read(RECENT_KEY);
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
    (id: string) => favorites.some((d) => d.id === id),
    [favorites],
  );

  const toggleFavorite = useCallback((drug: DrugRef) => {
    const current = read(FAVORITES_KEY);
    const exists = current.some((d) => d.id === drug.id);
    const next = exists
      ? current.filter((d) => d.id !== drug.id)
      : [{ id: drug.id, brandName: drug.brandName, inn: drug.inn }, ...current];
    write(FAVORITES_KEY, next);
  }, []);

  return { favorites, isFavorite, toggleFavorite };
}

export function useRecentlyViewed() {
  const recent = useSyncExternalStore(
    subscribe,
    getRecentSnapshot,
    () => emptySnapshot,
  );
  return recent;
}

/** Record a drug as recently viewed (call from the detail page). */
export function recordRecentlyViewed(drug: DrugRef): void {
  const current = read(RECENT_KEY).filter((d) => d.id !== drug.id);
  const next = [
    { id: drug.id, brandName: drug.brandName, inn: drug.inn },
    ...current,
  ].slice(0, RECENT_LIMIT);
  write(RECENT_KEY, next);
}
