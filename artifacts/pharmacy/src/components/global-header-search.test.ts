import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Router } from "wouter";

vi.mock("@/lib/catalog-client-index", () => ({
  useCatalogClientNormalizedSearch: () => null,
}));

import {
  GlobalHeaderSearch,
  flattenHeaderSearchChoices,
  nextHeaderSearchIndex,
  shouldFocusGlobalSearch,
} from "./global-header-search";

function slashEvent(target: EventTarget | null = null) {
  return {
    key: "/",
    defaultPrevented: false,
    isComposing: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target,
  };
}

const candidate = (id: string, correctedQuery?: string) => ({
  product: {
    productId: id.repeat(32),
    registration: "UA/10001/01/01",
    tradeName: `Назва ${id}`,
    inn: "МНН",
    form: "таблетки",
    strength: "10 мг",
  },
  rank: 1,
  matchedBy: "tradeName" as const,
  drugId: id.repeat(32),
  registration: "UA/10001/01/01",
  matchType: correctedQuery ? ("fuzzy" as const) : ("exact" as const),
  matchedToken: "назва",
  ...(correctedQuery ? { correctedQuery } : {}),
  score: 1,
});

describe("global header search", () => {
  it("handles slash outside editable controls", () => {
    expect(shouldFocusGlobalSearch(slashEvent())).toBe(true);
    expect(
      shouldFocusGlobalSearch(
        slashEvent({ tagName: "INPUT" } as unknown as EventTarget),
      ),
    ).toBe(false);
    expect(shouldFocusGlobalSearch({ ...slashEvent(), ctrlKey: true })).toBe(
      false,
    );
  });

  it("wraps arrow navigation and leaves an empty list inactive", () => {
    expect(nextHeaderSearchIndex(-1, "ArrowDown", 3)).toBe(0);
    expect(nextHeaderSearchIndex(2, "ArrowDown", 3)).toBe(0);
    expect(nextHeaderSearchIndex(-1, "ArrowUp", 3)).toBe(2);
    expect(nextHeaderSearchIndex(0, "ArrowUp", 3)).toBe(2);
    expect(nextHeaderSearchIndex(0, "ArrowDown", 0)).toBe(-1);
  });

  it("keeps corrected suggestions separate from primary matches", () => {
    const primary = candidate("A");
    const suggested = candidate("B", "нурофен");
    expect(flattenHeaderSearchChoices([primary], [suggested])).toEqual([
      { item: primary, section: "primary" },
      { item: suggested, section: "suggested" },
    ]);
  });

  it("renders on product and interaction screens but not on the root", () => {
    const render = (path: string) =>
      renderToStaticMarkup(
        createElement(
          Router,
          { ssrPath: path },
          createElement(GlobalHeaderSearch),
        ),
      );
    expect(render("/products/ABC")).toContain(
      'data-testid="global-header-search-input"',
    );
    expect(render("/interactions")).toContain(
      'data-testid="global-header-search-input"',
    );
    expect(render("/")).not.toContain("global-header-search-input");
  });
});
