import { describe, expect, it } from "vitest";
import {
  DESKTOP_SIDEBAR_CLASS,
  DESKTOP_SIDEBAR_FOOTER_CLASS,
  DESKTOP_SIDEBAR_NAV_CLASS,
} from "./layout";

describe("desktop sidebar layout", () => {
  it("uses one bounded scroll flow instead of overlaying the auth card", () => {
    expect(DESKTOP_SIDEBAR_CLASS).toContain("h-[100dvh]");
    expect(DESKTOP_SIDEBAR_CLASS).toContain("overflow-y-auto");
    expect(DESKTOP_SIDEBAR_CLASS).toContain("overscroll-contain");
    expect(DESKTOP_SIDEBAR_NAV_CLASS).not.toContain("overflow-y-auto");
    expect(DESKTOP_SIDEBAR_FOOTER_CLASS).toContain("shrink-0");
  });
});