import { describe, expect, it } from "vitest";
import {
  INTERACTION_CART_KEY,
  INTERACTION_CART_LIMIT,
  addInteractionCartItem,
  readStoredInteractionCart,
  removeInteractionCartItem,
  sanitizeInteractionCart,
  type InteractionCartItem,
} from "./interaction-cart";

const id = (value: number) =>
  value.toString(16).toUpperCase().padStart(32, "A").slice(-32);
const item = (value: number): InteractionCartItem => ({
  drugId: id(value),
  name: `Препарат ${value}`,
  inn: `МНН ${value}`,
  registration: `UA/${value}/01/01`,
  form: "таблетки",
  strength: `${value} мг`,
});

describe("interaction cart", () => {
  it("keeps exact registry identity, rejects malformed rows and deduplicates", () => {
    expect(
      sanitizeInteractionCart([
        item(1),
        item(1),
        { ...item(2), registration: "not-a-registration" },
      ]),
    ).toEqual([item(1)]);
  });

  it("enforces the five-product limit", () => {
    const full = Array.from({ length: INTERACTION_CART_LIMIT }, (_, index) =>
      item(index + 1),
    );
    expect(addInteractionCartItem(full, item(6))).toEqual(full);
    expect(addInteractionCartItem(full, full[0])).toEqual(full);
  });

  it("adds and removes synchronously", () => {
    const first = addInteractionCartItem([], item(1));
    expect(first).toEqual([item(1)]);
    expect(removeInteractionCartItem(first, item(1).drugId)).toEqual([]);
  });

  it("persists a sanitized cart across reads", () => {
    const values = new Map<string, string>([
      [INTERACTION_CART_KEY, JSON.stringify([item(1), item(1), item(2)])],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(readStoredInteractionCart(storage)).toEqual([item(1), item(2)]);
    expect(JSON.parse(values.get(INTERACTION_CART_KEY) ?? "[]")).toHaveLength(
      2,
    );
  });
});
