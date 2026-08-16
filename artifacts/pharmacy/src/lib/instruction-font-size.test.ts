import { describe, expect, it } from "vitest";
import {
  INSTRUCTION_FONT_SIZE_DEFAULT,
  INSTRUCTION_FONT_SIZE_STORAGE_KEY,
  isInstructionFontSizeStep,
  nextInstructionFontSizeStep,
  readInstructionFontSize,
  writeInstructionFontSize,
} from "./instruction-font-size";

describe("instruction font size steps", () => {
  it("validates only the three known steps", () => {
    expect(isInstructionFontSizeStep("sm")).toBe(true);
    expect(isInstructionFontSizeStep("md")).toBe(true);
    expect(isInstructionFontSizeStep("lg")).toBe(true);
    expect(isInstructionFontSizeStep("xl")).toBe(false);
    expect(isInstructionFontSizeStep(null)).toBe(false);
    expect(isInstructionFontSizeStep(undefined)).toBe(false);
  });

  it("clamps stepping at both ends of the 3-step range", () => {
    expect(nextInstructionFontSizeStep("sm", -1)).toBe("sm");
    expect(nextInstructionFontSizeStep("sm", 1)).toBe("md");
    expect(nextInstructionFontSizeStep("md", 1)).toBe("lg");
    expect(nextInstructionFontSizeStep("lg", 1)).toBe("lg");
    expect(nextInstructionFontSizeStep("lg", -1)).toBe("md");
  });

  it("falls back to the default step outside a browser (SSR/tests)", () => {
    expect(readInstructionFontSize()).toBe(INSTRUCTION_FONT_SIZE_DEFAULT);
    expect(() => writeInstructionFontSize("lg")).not.toThrow();
  });

  it("round-trips through a fake localStorage", () => {
    const store = new Map<string, string>();
    const fakeWindow = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    } as unknown as Window & typeof globalThis;
    const globalWithWindow = globalThis as { window?: typeof fakeWindow };
    const original = globalWithWindow.window;
    globalWithWindow.window = fakeWindow;
    try {
      expect(readInstructionFontSize()).toBe(INSTRUCTION_FONT_SIZE_DEFAULT);
      writeInstructionFontSize("lg");
      expect(store.get(INSTRUCTION_FONT_SIZE_STORAGE_KEY)).toBe("lg");
      expect(readInstructionFontSize()).toBe("lg");
    } finally {
      if (original === undefined) delete globalWithWindow.window;
      else globalWithWindow.window = original;
    }
  });

  it("falls back to default when storage throws (private browsing)", () => {
    const fakeWindow = {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    } as unknown as Window & typeof globalThis;
    const globalWithWindow = globalThis as { window?: typeof fakeWindow };
    const original = globalWithWindow.window;
    globalWithWindow.window = fakeWindow;
    try {
      expect(readInstructionFontSize()).toBe(INSTRUCTION_FONT_SIZE_DEFAULT);
      expect(() => writeInstructionFontSize("sm")).not.toThrow();
    } finally {
      if (original === undefined) delete globalWithWindow.window;
      else globalWithWindow.window = original;
    }
  });
});
