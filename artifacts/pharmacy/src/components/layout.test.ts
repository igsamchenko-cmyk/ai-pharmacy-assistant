import { describe, expect, it } from "vitest";
import {
  APP_CONTENT_CLASS,
  DESKTOP_SIDEBAR_CLASS,
  DESKTOP_SIDEBAR_FOOTER_CLASS,
  DESKTOP_SIDEBAR_NAV_CLASS,
  MOBILE_BOTTOM_NAV_CLASS,
  REFERENCE_NAV_ITEMS,
} from "./layout";

describe("desktop sidebar layout", () => {
  it("uses one bounded scroll flow instead of overlaying the auth card", () => {
    expect(DESKTOP_SIDEBAR_CLASS).toContain("h-[100dvh]");
    expect(DESKTOP_SIDEBAR_CLASS).toContain("overflow-y-auto");
    expect(DESKTOP_SIDEBAR_CLASS).toContain("overscroll-contain");
    expect(DESKTOP_SIDEBAR_NAV_CLASS).not.toContain("overflow-y-auto");
    expect(DESKTOP_SIDEBAR_FOOTER_CLASS).toContain("shrink-0");
    expect(DESKTOP_SIDEBAR_FOOTER_CLASS).toContain("mt-auto");
  });

  it("keeps tablets fluid and uses available width on large displays", () => {
    expect(DESKTOP_SIDEBAR_CLASS).toContain("lg:flex");
    expect(DESKTOP_SIDEBAR_CLASS).not.toContain("md:flex");
    expect(APP_CONTENT_CLASS).toContain("max-w-[1600px]");
    expect(APP_CONTENT_CLASS).toContain("safe-area-inset-left");
    expect(APP_CONTENT_CLASS).toContain("safe-area-inset-right");
    expect(APP_CONTENT_CLASS).toContain("2xl:pl-[max(3rem");
  });

  it("protects mobile navigation from notches and the home indicator", () => {
    expect(MOBILE_BOTTOM_NAV_CLASS).toContain("grid-cols-4");
    expect(MOBILE_BOTTOM_NAV_CLASS).toContain("safe-area-inset-bottom");
    expect(MOBILE_BOTTOM_NAV_CLASS).toContain("safe-area-inset-left");
    expect(MOBILE_BOTTOM_NAV_CLASS).toContain("safe-area-inset-right");
    expect(MOBILE_BOTTOM_NAV_CLASS).toContain("lg:hidden");
  });

  it("keeps only practical reference sections in the primary navigation", () => {
    expect(
      REFERENCE_NAV_ITEMS.map(({ href, label }) => ({ href, label })),
    ).toEqual([
      { href: "/", label: "Довідник ЛЗ" },
      { href: "/interactions", label: "Взаємодії" },
      { href: "/regulatory-radar", label: "Заборони та оновлення" },
      { href: "/favorites", label: "Обране" },
    ]);
    expect(REFERENCE_NAV_ITEMS.map((item) => item.mobileLabel)).toEqual([
      "Довідник",
      "Взаємодії",
      "Заборони",
      "Обране",
    ]);

    const labels = REFERENCE_NAV_ITEMS.map((item) => item.label);
    for (const hiddenLabel of [
      "Головна",
      "Пошук",
      "Порівняння",
      "AI-довідка",
      "Історія",
      "Beta Dashboard",
      "Якість даних",
      "Черга рев'ю",
    ]) {
      expect(labels).not.toContain(hiddenLabel);
    }
  });
});
