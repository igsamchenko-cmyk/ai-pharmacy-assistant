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

  it("normalizes apostrophe variants", () => {
    expect(normalize("\u043f'\u044f\u0442\u044c")).toBe(
      normalize("\u043f\u02bc\u044f\u0442\u044c"),
    );
    expect(normalize("\u043f\u2019\u044f\u0442\u044c")).toBe(
      normalize("\u043f\u0060\u044f\u0442\u044c"),
    );
  });

  it("normalizes hyphen and space variants", () => {
    expect(normalize("\u041d\u043e-\u0448\u043f\u0430")).toBe(
      normalize("\u043d\u043e \u0448\u043f\u0430"),
    );
    expect(normalize("No-Spa")).toBe(normalize("no spa"));
  });

  it("normalizes slash plus and parenthesis separators", () => {
    expect(normalize("amoxicillin + clavulanic acid")).toBe(
      normalize("amoxicillin/clavulanic acid"),
    );
    expect(normalize("iron (III) hydroxide")).toBe(
      normalize("iron iii hydroxide"),
    );
  });
});
