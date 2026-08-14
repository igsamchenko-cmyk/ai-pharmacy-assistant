import { describe, expect, it } from "vitest";
import { isLazyChunkLoadError } from "./error-boundary";

describe("isLazyChunkLoadError", () => {
  it.each([
    new Error("Failed to fetch dynamically imported module"),
    new Error("Loading chunk 42 failed"),
    "ChunkLoadError: missing module",
    "Importing a module script failed",
  ])("recognizes a lazy chunk failure", (error) => {
    expect(isLazyChunkLoadError(error)).toBe(true);
  });

  it("does not relabel ordinary UI errors", () => {
    expect(isLazyChunkLoadError(new Error("Invalid hook call"))).toBe(false);
  });
});
