import { describe, it, expect } from "vitest";
import { normalize } from "../text";

describe("normalize", () => {
  it("trims surrounding whitespace", () => {
    expect(normalize("  аспірин  ")).toBe("аспірин");
  });

  it("lowercases input", () => {
    expect(normalize("АСПІРИН")).toBe("аспірин");
  });

  it("handles an empty string", () => {
    expect(normalize("")).toBe("");
    expect(normalize("   ")).toBe("");
  });
});
