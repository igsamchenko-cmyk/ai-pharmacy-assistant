import { describe, expect, it } from "vitest";
import type { RegistryProductResult } from "@workspace/api-client-react";
import {
  PRODUCT_COMPARISON_LIMIT,
  PRODUCT_COMPARISON_STORAGE_KEY,
  addComparisonProductRef,
  comparisonProductFromRegistry,
  normalizeComparisonProduct,
  readComparisonProducts,
  removeComparisonProductRef,
  sanitizeComparisonProducts,
  type ComparisonProductRef,
} from "./use-product-comparison";

function ref(
  productId: string,
  registrationNumber: string,
  tradeName: string,
): ComparisonProductRef {
  return {
    productId,
    registrationNumber,
    tradeName,
    inn: "тестова речовина",
    atcCode: null,
    activeIngredient: "тестова речовина",
    strength: "10 мг",
    dosageForm: "таблетки",
    manufacturer: "Офіційний виробник",
    nationalListStatus: "exact",
    instructionAvailable: true,
    href: "/products/" + productId + "?registration=" + encodeURIComponent(registrationNumber),
  };
}

class MemoryStorage {
  values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const enap = ref("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "UA/10001/01/01", "ЕНАП");
const krka = ref("BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", "UA/10002/01/01", "ЕНАЛАПРИЛ КРКА");
const third = ref("CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", "UA/10003/01/01", "ТРЕТІЙ");

describe("product comparison local store", () => {
  it("keeps exact productId + registration routes and removes duplicates", () => {
    expect(normalizeComparisonProduct(enap)).toEqual(enap);
    expect(sanitizeComparisonProducts([enap, enap, krka])).toEqual([enap, krka]);
    expect(removeComparisonProductRef([enap, krka], enap.productId)).toEqual([krka]);
  });

  it("stores only concise manufacturer names for comparison", () => {
    const product = {
      id: enap.productId,
      registration: { number: enap.registrationNumber },
      tradeName: enap.tradeName,
      inn: enap.inn,
      atcCode: enap.atcCode,
      activeIngredient: enap.activeIngredient,
      strength: enap.strength,
      manufacturers: [
        {
          name: 'АТ "Лубнифарм" (первинне пакування, контроль та випуск серій)',
          country: "Україна",
        },
      ],
      nationalListStatus: "exact",
      instructionAvailable: true,
    } as RegistryProductResult;

    expect(comparisonProductFromRegistry(product, "таблетки").manufacturer).toBe(
      'АТ "Лубнифарм", Україна',
    );
  });

  it("allows at most two registry positions", () => {
    const selected = addComparisonProductRef(addComparisonProductRef([], enap), krka);
    expect(selected).toHaveLength(PRODUCT_COMPARISON_LIMIT);
    expect(addComparisonProductRef(selected, third)).toEqual(selected);
  });

  it("fails closed for invalid IDs, registrations, and mismatched routes", () => {
    expect(normalizeComparisonProduct({ ...enap, productId: "not-an-id" })).toBeNull();
    expect(normalizeComparisonProduct({ ...enap, registrationNumber: "123" })).toBeNull();
    expect(normalizeComparisonProduct({ ...enap, href: "/products/other" })).toBeNull();
  });

  it("cleans malformed and stale local payload entries", () => {
    const storage = new MemoryStorage();
    storage.setItem(PRODUCT_COMPARISON_STORAGE_KEY, JSON.stringify([
      enap,
      { ...krka, href: "/wrong" },
      enap,
      third,
    ]));

    expect(readComparisonProducts(storage)).toEqual([enap, third]);
    expect(JSON.parse(storage.getItem(PRODUCT_COMPARISON_STORAGE_KEY) ?? "[]")).toEqual([enap, third]);

    storage.setItem(PRODUCT_COMPARISON_STORAGE_KEY, "{broken");
    expect(readComparisonProducts(storage)).toEqual([]);
    expect(storage.getItem(PRODUCT_COMPARISON_STORAGE_KEY)).toBe("[]");
  });
});