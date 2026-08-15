import { useCallback, useSyncExternalStore } from "react";
import {
  REGISTRATION_NUMBER_PATTERN,
  REGISTRY_PRODUCT_ID_PATTERN,
} from "@/lib/registry-product-route";

export interface InteractionCartItem {
  drugId: string;
  name: string;
  inn: string;
  registration: string;
  form?: string;
  strength?: string;
}

interface InteractionCartStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const INTERACTION_CART_KEY = "farmassist:interaction-cart";
export const INTERACTION_CART_LIMIT = 5;

type Listener = () => void;
const listeners = new Set<Listener>();
const EMPTY_CART: InteractionCartItem[] = [];

function browserStorage(): InteractionCartStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function optionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, maxLength);
  return normalized || undefined;
}

export function normalizeInteractionCartItem(
  value: unknown,
): InteractionCartItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const drugId = optionalText(candidate.drugId, 32)?.toUpperCase() ?? "";
  const name = optionalText(candidate.name, 300) ?? "";
  const registration =
    optionalText(candidate.registration, 50)?.toUpperCase() ?? "";
  if (
    !REGISTRY_PRODUCT_ID_PATTERN.test(drugId) ||
    !REGISTRATION_NUMBER_PATTERN.test(registration) ||
    !name
  ) {
    return null;
  }
  const form = optionalText(candidate.form, 2_000);
  const strength = optionalText(candidate.strength, 120);
  return {
    drugId,
    name,
    inn: optionalText(candidate.inn, 2_000) ?? "",
    registration,
    ...(form ? { form } : {}),
    ...(strength ? { strength } : {}),
  };
}

export function sanitizeInteractionCart(value: unknown): InteractionCartItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: InteractionCartItem[] = [];
  for (const candidate of value) {
    const item = normalizeInteractionCartItem(candidate);
    if (!item || seen.has(item.drugId)) continue;
    seen.add(item.drugId);
    items.push(item);
    if (items.length >= INTERACTION_CART_LIMIT) break;
  }
  return items;
}

export function addInteractionCartItem(
  current: readonly InteractionCartItem[],
  candidate: InteractionCartItem,
): InteractionCartItem[] {
  const items = sanitizeInteractionCart(current);
  const item = normalizeInteractionCartItem(candidate);
  if (
    !item ||
    items.length >= INTERACTION_CART_LIMIT ||
    items.some((existing) => existing.drugId === item.drugId)
  ) {
    return items;
  }
  return [...items, item];
}

export function removeInteractionCartItem(
  current: readonly InteractionCartItem[],
  drugId: string,
): InteractionCartItem[] {
  return sanitizeInteractionCart(current).filter(
    (item) => item.drugId !== drugId,
  );
}

export function readStoredInteractionCart(
  target: InteractionCartStorage,
): InteractionCartItem[] {
  const raw = target.getItem(INTERACTION_CART_KEY);
  if (!raw) return [];
  try {
    const items = sanitizeInteractionCart(JSON.parse(raw) as unknown);
    const clean = JSON.stringify(items);
    if (clean !== raw) target.setItem(INTERACTION_CART_KEY, clean);
    return items;
  } catch {
    target.setItem(INTERACTION_CART_KEY, "[]");
    return [];
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === INTERACTION_CART_KEY) emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

let cachedRaw = "";
let cachedItems: InteractionCartItem[] = [];

function snapshot(): InteractionCartItem[] {
  const target = browserStorage();
  const raw = target?.getItem(INTERACTION_CART_KEY) ?? "";
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedItems = target ? readStoredInteractionCart(target) : [];
  }
  return cachedItems;
}

function write(items: readonly InteractionCartItem[]): void {
  const normalized = sanitizeInteractionCart(items);
  const target = browserStorage();
  if (target) {
    try {
      target.setItem(INTERACTION_CART_KEY, JSON.stringify(normalized));
    } catch {
      // localStorage can be unavailable in private browsing; keep it best-effort.
    }
  }
  cachedRaw = "";
  emit();
}

export function useInteractionCart() {
  const items = useSyncExternalStore(subscribe, snapshot, () => EMPTY_CART);
  const add = useCallback((item: InteractionCartItem) => {
    write(addInteractionCartItem(snapshot(), item));
  }, []);
  const remove = useCallback((drugId: string) => {
    write(removeInteractionCartItem(snapshot(), drugId));
  }, []);
  const clear = useCallback(() => write([]), []);
  const toggle = useCallback((item: InteractionCartItem) => {
    const current = snapshot();
    write(
      current.some((existing) => existing.drugId === item.drugId)
        ? removeInteractionCartItem(current, item.drugId)
        : addInteractionCartItem(current, item),
    );
  }, []);
  const isInCart = useCallback(
    (drugId: string) => items.some((item) => item.drugId === drugId),
    [items],
  );
  return {
    items,
    count: items.length,
    isFull: items.length >= INTERACTION_CART_LIMIT,
    isInCart,
    add,
    remove,
    toggle,
    clear,
  };
}
