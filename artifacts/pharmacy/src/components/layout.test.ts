import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { describe, expect, it, vi } from "vitest";
import {
  APP_CONTENT_CLASS,
  DESKTOP_HEADER_CLASS,
  Layout,
  MOBILE_BOTTOM_NAV_CLASS,
  REFERENCE_NAV_ITEMS,
  isNavigationItemActive,
} from "./layout";

vi.mock("./theme-provider", () => ({
  useThemeContext: () => ({ theme: "dark", setTheme: vi.fn() }),
}));
vi.mock("./auth-status", () => ({ AuthStatus: () => null }));
vi.mock("@/components/service-warmup-status", () => ({
  ServiceWarmupStatus: () => null,
}));

describe("navigation v3 layout", () => {
  it("renders the same three practical destinations on desktop and mobile", () => {
    expect(
      REFERENCE_NAV_ITEMS.map(({ href, label }) => ({ href, label })),
    ).toEqual([
      { href: "/", label: "Пошук" },
      { href: "/interactions", label: "Взаємодії" },
      { href: "/history", label: "Збережене" },
    ]);
    expect(REFERENCE_NAV_ITEMS.map((item) => item.mobileLabel)).toEqual([
      "Пошук",
      "Взаємодії",
      "Збережене",
    ]);
  });

  it("keeps secondary and operator pages out of primary navigation", () => {
    const hrefs = REFERENCE_NAV_ITEMS.map((item) => item.href);
    for (const hiddenHref of [
      "/about",
      "/review",
      "/beta-dashboard",
      "/regulatory-radar",
      "/favorites",
      "/dispense",
      "/instruction-search",
      "/compare",
    ]) {
      expect(hrefs).not.toContain(hiddenHref);
    }
  });

  it("treats product cards as search context and favorites as saved context", () => {
    expect(
      isNavigationItemActive("/products/ABC", REFERENCE_NAV_ITEMS[0]),
    ).toBe(true);
    expect(isNavigationItemActive("/favorites", REFERENCE_NAV_ITEMS[2])).toBe(
      true,
    );
  });

  it("uses the desktop header from 768px and protects mobile safe areas", () => {
    expect(DESKTOP_HEADER_CLASS).toContain("md:flex");
    expect(DESKTOP_HEADER_CLASS).toContain("safe-area-inset-left");
    expect(MOBILE_BOTTOM_NAV_CLASS).toContain("grid-cols-3");
    expect(MOBILE_BOTTOM_NAV_CLASS).toContain("safe-area-inset-bottom");
    expect(MOBILE_BOTTOM_NAV_CLASS).toContain("safe-area-inset-left");
    expect(MOBILE_BOTTOM_NAV_CLASS).toContain("safe-area-inset-right");
    expect(MOBILE_BOTTOM_NAV_CLASS).toContain("md:hidden");
    expect(APP_CONTENT_CLASS).toContain("max-w-[1600px]");
  });
  it("renders exactly three links in each primary navigation", () => {
    const html = renderToStaticMarkup(
      createElement(
        Router,
        { ssrPath: "/" },
        createElement(Layout, null, createElement("div", null, "content")),
      ),
    );
    expect(html.match(/data-testid="nav-/gu)).toHaveLength(3);
    expect(html.match(/data-testid="mobile-nav-/gu)).toHaveLength(3);
    expect(html).not.toContain('href="/about"');
    expect(html).not.toContain('href="/review"');
    expect(html).not.toContain('href="/beta-dashboard"');
  });
});
