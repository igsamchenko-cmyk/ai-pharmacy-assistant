import { describe, it, expect } from "vitest";
import { findAnalogs } from "../analogService";

describe("analogService.findAnalogs", () => {
  it("returns undefined for an unknown drug", () => {
    expect(findAnalogs("does-not-exist")).toBeUndefined();
  });

  it("groups full analogs sharing INN and dosage", () => {
    const result = findAnalogs("paracetamol-500");
    expect(result).toBeDefined();
    // Панадол shares INN Парацетамол and 500 мг -> full analog.
    expect(result?.full.some((d) => d.id === "panadol-500")).toBe(true);
  });

  it("classifies different-INN, same-group drugs as therapeutic alternatives", () => {
    const result = findAnalogs("ibuprofen-200");
    expect(result).toBeDefined();
    // Diclofenac is a different INN but the same NSAID group.
    expect(result?.therapeutic.some((d) => d.id === "diclofenac-50")).toBe(
      true,
    );
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
    // Any same-INN paracetamol whose base form differs (e.g. syrup/suspension)
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
