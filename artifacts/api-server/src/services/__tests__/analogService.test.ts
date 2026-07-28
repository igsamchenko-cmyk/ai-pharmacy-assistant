import { describe, it, expect } from "vitest";
import { findAnalogs } from "../analogService";

describe("analogService.findAnalogs", () => {
  it("returns undefined for an unknown drug", () => {
    expect(findAnalogs("does-not-exist")).toBeUndefined();
  });

  it("does not call a differently described dosage form a full match", () => {
    const result = findAnalogs("paracetamol-500");
    expect(result).toBeDefined();
    expect(result?.full.some((d) => d.id === "panadol-500")).toBe(false);
    expect(result?.partial.some((d) => d.id === "panadol-500")).toBe(true);
  });

  it("does not suggest different-INN drugs as therapeutic replacements", () => {
    const result = findAnalogs("ibuprofen-200");
    expect(result).toBeDefined();
    expect(result?.therapeutic).toEqual([]);
    // The base drug is never listed among its own analogs.
    const allIds = [
      ...(result?.full ?? []),
      ...(result?.partial ?? []),
      ...(result?.therapeutic ?? []),
    ].map((d) => d.id);
    expect(allIds).not.toContain("ibuprofen-200");
  });

  it("does not classify a same-INN drug with a different dosage form as full", () => {
    const result = findAnalogs("paracetamol-500");
    expect(result).toBeDefined();
    const fullIds = (result?.full ?? []).map((d) => d.id);
    const partialIds = (result?.partial ?? []).map((d) => d.id);
    // Any same-INN paracetamol whose exact form differs (e.g. syrup/suspension)
    // must not appear among full analogs.
    const sameInnDifferentForm = [
      ...(result?.full ?? []),
      ...(result?.partial ?? []),
    ]
      .filter((d) => d.form.split(",")[0].trim().toLowerCase() !== "таблетки")
      .map((d) => d.id);
    for (const id of sameInnDifferentForm) {
      expect(fullIds).not.toContain(id);
      expect(partialIds).toContain(id);
    }
  });

  it("always carries a substitution disclaimer", () => {
    const result = findAnalogs("aspirin-500");
    expect(result?.disclaimer.length).toBeGreaterThan(0);
  });
});
