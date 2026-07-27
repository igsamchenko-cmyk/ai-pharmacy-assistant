import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Router } from "wouter";
import type { DrugRef } from "@/hooks/use-favorites";
import { QUICK_ACCESS_ACTIONS, QuickAccessContent } from "./quick-access";

const favorite: DrugRef = {
  id: "A".repeat(32),
  brandName: "ЕНАП",
  inn: "Еналаприл",
  dosage: "10 мг",
  form: "таблетки",
  registration: "UA/10001/01/01",
  href: `/products/${"A".repeat(32)}?registration=UA%2F10001%2F01%2F01`,
};
const recent: DrugRef = {
  id: "B".repeat(32),
  brandName: "ЕЛІКВІС",
  inn: "Апіксабан",
  dosage: "5 мг",
  form: "таблетки",
  registration: "UA/13699/01/01",
  href: `/products/${"B".repeat(32)}?registration=UA%2F13699%2F01%2F01`,
};

function render(favorites: DrugRef[], history: DrugRef[]): string {
  return renderToStaticMarkup(
    createElement(
      Router,
      { ssrPath: "/hospital" },
      createElement(QuickAccessContent, { favorites, recent: history }),
    ),
  );
}

describe("quick access", () => {
  it("provides four clear shortcuts without a duplicate search API", () => {
    const html = render([], []);
    expect(QUICK_ACCESS_ACTIONS.map((action) => action.href)).toEqual([
      "/search",
      "/interactions",
      "/compare",
      "/scan",
    ]);
    for (const action of QUICK_ACCESS_ACTIONS) {
      expect(html).toContain(`href="${action.href}"`);
      expect(html).toContain(action.title);
    }
    const source = readFileSync(
      new URL("./quick-access.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("useSearchDrugs");
    expect(source).not.toContain("@workspace/api-client-react");
    expect(source).not.toContain("useDebounce");
  });

  it("shows exact saved routes and does not duplicate a favorite in recent", () => {
    const html = render([favorite], [favorite, recent]);
    expect(html).toContain("Швидкий доступ");
    expect(html).toContain(favorite.brandName);
    expect(html).toContain(recent.brandName);
    expect(html).toContain(favorite.href!.replaceAll("&", "&amp;"));
    expect(html.match(new RegExp(favorite.brandName, "g"))).toHaveLength(1);
  });

  it("has a useful empty state and bounded mobile-safe layout", () => {
    const html = render([], []);
    expect(html).toContain('data-testid="quick-access-empty"');
    expect(html).toContain("Тут з’являться ваші препарати");
    expect(html).toContain("overflow-x-hidden");
    expect(html).toContain("min-w-0");
    expect(html).not.toContain("overflow-x-auto");
  });
});
