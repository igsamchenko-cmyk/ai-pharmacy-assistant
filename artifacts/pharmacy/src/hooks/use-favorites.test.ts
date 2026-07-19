import { describe, expect, it } from "vitest";
import {
  FAVORITES_KEY,
  RECENT_LIMIT,
  readStoredDrugRefs,
  recordRecentlyViewedRefs,
  sanitizeDrugRefs,
  toggleFavoriteRefs,
  type DrugRef,
} from "./use-favorites";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const products: DrugRef[] = [
  {
    id: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    brandName: "ЕНАП",
    inn: "Еналаприл",
    dosage: "10 мг",
    form: "таблетки",
    manufacturer: "КРКА",
    registration: "UA/10001/01/01",
    href:
      "/products/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA?registration=UA%2F10001%2F01%2F01",
  },
  {
    id: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    brandName: "НУРОФЕН",
    inn: "Ібупрофен",
    dosage: "200 мг",
    form: "таблетки",
    manufacturer: "Реккітт Бенкізер",
    registration: "UA/10002/01/01",
    href:
      "/products/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB?registration=UA%2F10002%2F01%2F01",
  },
  {
    id: "3100C9CB2A81D315C2258CC00032ED38",
    brandName: "ЕЛІКВІС",
    inn: "Апіксабан",
    dosage: "5 мг",
    form: "таблетки",
    manufacturer: "Брістол-Майєрс Сквібб",
    registration: "UA/13699/01/01",
    href:
      "/products/3100C9CB2A81D315C2258CC00032ED38?registration=UA%2F13699%2F01%2F01",
  },
  {
    id: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
    brandName: "АМОКСИКЛАВ",
    inn: "Амоксицилін + клавуланова кислота",
    dosage: "875 мг/125 мг",
    form: "таблетки",
    manufacturer: "Лек",
    registration: "UA/10004/01/01",
    href:
      "/products/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC?registration=UA%2F10004%2F01%2F01",
  },
  {
    id: "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
    brandName: "КСАРЕЛТО",
    inn: "Ривароксабан",
    dosage: "20 мг",
    form: "таблетки",
    manufacturer: "Байєр",
    registration: "UA/10005/01/01",
    href:
      "/products/DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD?registration=UA%2F10005%2F01%2F01",
  },
];

describe("browser-local favorite and viewing-history store", () => {
  it.each(products)("adds and removes $brandName without duplicates", (product) => {
    const added = toggleFavoriteRefs([], product);
    expect(added).toEqual([product]);
    expect(toggleFavoriteRefs(added, product)).toEqual([]);
  });

  it("moves a repeated view to the front and keeps only the latest 20", () => {
    let recent: DrugRef[] = [];
    for (let index = 0; index < 25; index += 1) {
      const id = index.toString(16).toUpperCase().padStart(32, "0");
      recent = recordRecentlyViewedRefs(recent, {
        id,
        brandName: "Препарат " + index,
        inn: "Речовина",
        href:
          "/products/" +
          id +
          "?registration=" +
          encodeURIComponent("UA/" + (11000 + index) + "/01/01"),
      });
    }

    expect(recent).toHaveLength(RECENT_LIMIT);
    expect(recent[0]?.brandName).toBe("Препарат 24");
    expect(recent.at(-1)?.brandName).toBe("Препарат 5");

    const repeated = recordRecentlyViewedRefs(recent, recent[10]!);
    expect(repeated).toHaveLength(RECENT_LIMIT);
    expect(repeated[0]?.id).toBe(recent[10]?.id);
    expect(new Set(repeated.map((item) => item.id)).size).toBe(RECENT_LIMIT);
  });

  it("removes malformed, external and mismatched exact product references", () => {
    const clean = sanitizeDrugRefs([
      products[0],
      products[0],
      { ...products[1], id: "../../secret" },
      { ...products[2], href: "https://example.com/product" },
      {
        ...products[3],
        href:
          "/products/DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD?registration=UA%2F10004%2F01%2F01",
      },
      { id: "", brandName: "Порожній", inn: "" },
    ]);

    expect(clean).toEqual([products[0]]);
  });

  it("rewrites corrupted local storage to a deduplicated safe snapshot", () => {
    const target = new MemoryStorage();
    target.setItem(
      FAVORITES_KEY,
      JSON.stringify([
        products[0],
        products[0],
        { id: "bad/id", brandName: "Небезпечний", inn: "" },
      ]),
    );

    expect(readStoredDrugRefs(target, FAVORITES_KEY)).toEqual([products[0]]);
    expect(JSON.parse(target.getItem(FAVORITES_KEY) ?? "[]")).toEqual([
      products[0],
    ]);
  });

  it("fails closed on invalid JSON", () => {
    const target = new MemoryStorage();
    target.setItem(FAVORITES_KEY, "{not-json");
    expect(readStoredDrugRefs(target, FAVORITES_KEY)).toEqual([]);
    expect(target.getItem(FAVORITES_KEY)).toBe("[]");
  });
});
