import React from "react";

import type { RegistryProductResult } from "@workspace/api-client-react";
import {
  REGISTRATION_NUMBER_PATTERN,
  REGISTRY_PRODUCT_ID_PATTERN,
  registryProductDetailHref,
} from "@/lib/registry-product-route";
import { conciseManufacturerText } from "@/lib/manufacturer-display";

export const PRODUCT_COMPARISON_STORAGE_KEY = "farmassist:product-comparison";
export const PRODUCT_COMPARISON_LIMIT = 2;

const NATIONAL_LIST_STATUSES = new Set([
  "exact",
  "ingredient_only",
  "not_listed",
  "uncertain",
  "not_applicable",
]);

export interface ComparisonProductRef {
  productId: string;
  registrationNumber: string;
  tradeName: string;
  inn: string | null;
  atcCode: string | null;
  activeIngredient: string | null;
  strength: string | null;
  dosageForm: string | null;
  manufacturer: string | null;
  nationalListStatus: RegistryProductResult["nationalListStatus"];
  instructionAvailable: boolean;
  href: string;
}

interface ComparisonStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const EMPTY_SNAPSHOT: ComparisonProductRef[] = [];
let cachedRaw: string | null | undefined;
let cachedSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();

function nullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeComparisonProduct(value: unknown): ComparisonProductRef | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const productId = typeof candidate.productId === "string" ? candidate.productId.trim().toUpperCase() : "";
  const registrationNumber =
    typeof candidate.registrationNumber === "string" ? candidate.registrationNumber.trim() : "";
  const tradeName = typeof candidate.tradeName === "string" ? candidate.tradeName.trim() : "";

  if (
    !REGISTRY_PRODUCT_ID_PATTERN.test(productId) ||
    !REGISTRATION_NUMBER_PATTERN.test(registrationNumber) ||
    tradeName.length === 0
  ) {
    return null;
  }

  const href = registryProductDetailHref({ id: productId, registration: { number: registrationNumber } });
  if (candidate.href !== href) return null;

  const nationalListStatus = candidate.nationalListStatus;
  if (typeof nationalListStatus !== "string" || !NATIONAL_LIST_STATUSES.has(nationalListStatus)) {
    return null;
  }

  return {
    productId,
    registrationNumber,
    tradeName,
    inn: nullableText(candidate.inn),
    atcCode: nullableText(candidate.atcCode)?.toUpperCase() ?? null,
    activeIngredient: nullableText(candidate.activeIngredient),
    strength: nullableText(candidate.strength),
    dosageForm: nullableText(candidate.dosageForm),
    manufacturer: nullableText(candidate.manufacturer),
    nationalListStatus: nationalListStatus as RegistryProductResult["nationalListStatus"],
    instructionAvailable: candidate.instructionAvailable === true,
    href,
  };
}

export function sanitizeComparisonProducts(value: unknown): ComparisonProductRef[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: ComparisonProductRef[] = [];

  for (const candidate of value) {
    const product = normalizeComparisonProduct(candidate);
    if (!product || seen.has(product.productId)) continue;
    seen.add(product.productId);
    result.push(product);
    if (result.length === PRODUCT_COMPARISON_LIMIT) break;
  }

  return result;
}

export function addComparisonProductRef(
  products: ComparisonProductRef[],
  product: ComparisonProductRef,
): ComparisonProductRef[] {
  const normalized = normalizeComparisonProduct(product);
  const current = sanitizeComparisonProducts(products);
  if (!normalized || current.some((item) => item.productId === normalized.productId)) return current;
  if (current.length >= PRODUCT_COMPARISON_LIMIT) return current;
  return [...current, normalized];
}

export function removeComparisonProductRef(
  products: ComparisonProductRef[],
  productId: string,
): ComparisonProductRef[] {
  return sanitizeComparisonProducts(products).filter((product) => product.productId !== productId);
}

export function comparisonProductFromRegistry(
  product: RegistryProductResult,
  conciseForm: string | null,
): ComparisonProductRef {
  return {
    productId: product.id,
    registrationNumber: product.registration.number,
    tradeName: product.tradeName,
    inn: product.inn,
    atcCode: product.atcCode,
    activeIngredient: product.activeIngredient,
    strength: product.strength,
    dosageForm: conciseForm,
    manufacturer:
      conciseManufacturerText(product.manufacturers, "") || null,
    nationalListStatus: product.nationalListStatus,
    instructionAvailable: product.instructionAvailable === true,
    href: registryProductDetailHref(product),
  };
}

function browserStorage(): ComparisonStorage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readComparisonProducts(storage: ComparisonStorage | null = browserStorage()): ComparisonProductRef[] {
  if (!storage) return [];
  const raw = storage.getItem(PRODUCT_COMPARISON_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const sanitized = sanitizeComparisonProducts(parsed);
    const cleanRaw = JSON.stringify(sanitized);
    if (cleanRaw !== raw) storage.setItem(PRODUCT_COMPARISON_STORAGE_KEY, cleanRaw);
    return sanitized;
  } catch {
    storage.setItem(PRODUCT_COMPARISON_STORAGE_KEY, "[]");
    return [];
  }
}

function writeComparisonProducts(products: ComparisonProductRef[]): void {
  const storage = browserStorage();
  if (!storage) return;
  const sanitized = sanitizeComparisonProducts(products);
  storage.setItem(PRODUCT_COMPARISON_STORAGE_KEY, JSON.stringify(sanitized));
  cachedRaw = undefined;
  listeners.forEach((listener) => listener());
}

function getSnapshot(): ComparisonProductRef[] {
  const storage = browserStorage();
  if (!storage) return EMPTY_SNAPSHOT;
  const raw = storage.getItem(PRODUCT_COMPARISON_STORAGE_KEY);
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  cachedSnapshot = readComparisonProducts(storage);
  return cachedSnapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined") window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", listener);
  };
}

export function useProductComparison() {
  const products = React.useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT);

  const addProduct = React.useCallback((product: ComparisonProductRef) => {
    writeComparisonProducts(addComparisonProductRef(readComparisonProducts(), product));
  }, []);
  const removeProduct = React.useCallback((productId: string) => {
    writeComparisonProducts(removeComparisonProductRef(readComparisonProducts(), productId));
  }, []);
  const clear = React.useCallback(() => writeComparisonProducts([]), []);
  const isSelected = React.useCallback(
    (productId: string) => products.some((product) => product.productId === productId),
    [products],
  );

  return {
    products,
    addProduct,
    removeProduct,
    clear,
    isSelected,
    isFull: products.length >= PRODUCT_COMPARISON_LIMIT,
  };
}