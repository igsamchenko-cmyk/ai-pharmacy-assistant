import { describe, expect, it } from "vitest";
import { visualViewportKeyboardInset } from "./visual-viewport";

describe("visualViewportKeyboardInset", () => {
  it("returns the occluded keyboard height", () => {
    expect(visualViewportKeyboardInset(800, 470, 0)).toBe(330);
  });

  it("accounts for a shifted visual viewport", () => {
    expect(visualViewportKeyboardInset(800, 500, 25)).toBe(275);
  });

  it("never returns a negative or invalid inset", () => {
    expect(visualViewportKeyboardInset(600, 700, 0)).toBe(0);
    expect(visualViewportKeyboardInset(Number.NaN, 500, 0)).toBe(0);
  });
});
