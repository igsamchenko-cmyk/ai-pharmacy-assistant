import { describe, it, expect } from "vitest";
import { getAtcInfo } from "../atc";

describe("getAtcInfo", () => {
  it("returns null for empty or nullish input", () => {
    expect(getAtcInfo(null)).toBeNull();
    expect(getAtcInfo(undefined)).toBeNull();
    expect(getAtcInfo("")).toBeNull();
    expect(getAtcInfo("   ")).toBeNull();
  });

  it("returns null for an unknown anatomical letter", () => {
    expect(getAtcInfo("999")).toBeNull();
  });

  it("resolves the anatomical main group from the first letter", () => {
    const info = getAtcInfo("N02BE01");
    expect(info).not.toBeNull();
    expect(info?.anatomicalGroup).toBe("Нервова система");
  });

  it("normalizes case and whitespace", () => {
    const info = getAtcInfo("  n02be01  ");
    expect(info?.code).toBe("N02BE01");
  });

  it("prefers the longest matching therapeutic prefix", () => {
    const specific = getAtcInfo("N02BE01");
    expect(specific?.therapeuticClass).toContain("парацетамол");
  });

  it("mirrors therapeuticClass into pharmacologicalClass", () => {
    const info = getAtcInfo("B01AF01");
    expect(info?.pharmacologicalClass).toBe(info?.therapeuticClass);
  });

  it("falls back to the anatomical group when no therapeutic prefix matches", () => {
    const info = getAtcInfo("N");
    expect(info).not.toBeNull();
    expect(info?.therapeuticClass).toBe(info?.anatomicalGroup);
  });
});
