import { describe, it, expect } from "vitest";
import {
  listSources,
  getSource,
  isKnownSource,
  provenanceForNameKind,
} from "../provenance";
import { listDictionaryEntries } from "../dictionary";

describe("provenance registry", () => {
  it("exposes a non-empty source registry", () => {
    expect(listSources().length).toBeGreaterThan(0);
  });

  it("every source has a stable key, label and note", () => {
    for (const s of listSources()) {
      expect(s.key.length).toBeGreaterThan(0);
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.note.length).toBeGreaterThan(0);
      expect(["official", "reference", "demo", "external"]).toContain(s.type);
      expect(["high", "medium", "low"]).toContain(s.reliability);
    }
  });

  it("source keys are unique", () => {
    const keys = listSources().map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("getSource resolves known keys and returns null otherwise", () => {
    expect(getSource("who-inn")).not.toBeNull();
    expect(getSource("does-not-exist")).toBeNull();
    expect(isKnownSource("who-inn")).toBe(true);
    expect(isKnownSource("does-not-exist")).toBe(false);
  });

  it("provenanceForNameKind returns a known source for every kind", () => {
    for (const kind of ["inn", "latin", "english", "brand", "synonym"] as const) {
      const prov = provenanceForNameKind(kind);
      expect(isKnownSource(prov.sourceKey)).toBe(true);
      expect(prov.evidenceLevel.length).toBeGreaterThan(0);
    }
  });

  it("brand names are attributed to the demo catalog", () => {
    expect(provenanceForNameKind("brand").sourceKey).toBe("demo-catalog");
  });

  it("every dictionary entry carries provenance with a known source", () => {
    for (const e of listDictionaryEntries()) {
      expect(e.provenance).toBeDefined();
      expect(isKnownSource(e.provenance.sourceKey)).toBe(true);
    }
  });
});
