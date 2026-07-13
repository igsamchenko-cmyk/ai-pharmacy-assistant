import { describe, expect, it } from "vitest";
import {
  diffNationalListSnapshots,
  evaluateNationalListActivation,
  ingredientSignature,
  NATIONAL_LIST_EXPECTED_DOCUMENT_HASH,
  parseNationalListHtml,
  resolveNationalListMatch,
  type NationalListEntry,
  type NationalListSnapshot,
} from "../nationalList";

const fixture = `
<html><body>
<p>Із змінами, внесеними згідно з Постановою КМ № 1268 від 08.10.2025</p>
<p>НАЦІОНАЛЬНИЙ ПЕРЕЛІК<br>основних лікарських засобів</p>
<table>
  <tr><td>Клас, група, підгрупа, міжнародна непатентована назва (МНН) українською та англійською мовами</td><td>Форма випуску, доза лікарського засобу</td></tr>
  <tr><td colspan="2">I. Тестовий розділ</td></tr>
  <tr><td colspan="2">1. Тестова група</td></tr>
  <tr><td>Ібупрофен (Ibuprofen)</td><td>таблетки: 200 мг; 400 мг</td></tr>
  <tr><td>Лізиноприл + Гідрохлортіазид</td><td>(Lisinopril + Hydrochlorothiazide)*<br>таблетки: 10 мг/12,5 мг</td></tr>
  <tr><td>Збалансований розчин: натрію хлорид + калію хлорид*</td><td>розчин для інфузій</td></tr>
</table>
</body></html>`;

function entry(overrides: Partial<NationalListEntry> = {}): NationalListEntry {
  return {
    stableKey: "ibuprofen-tablet",
    officialNameUa: "Ібупрофен",
    officialNameEn: "Ibuprofen",
    ingredients: ["Ibuprofen"],
    compositionSignature: ingredientSignature("Ibuprofen"),
    dosageForms: ["таблетки"],
    routes: ["oral"],
    strengths: ["200 мг"],
    dosageText: "таблетки: 200 мг",
    section: "I. Test",
    category: "1. Test",
    restrictions: "",
    sourceUrl: "https://zakon.rada.gov.ua/laws/show/333-2009-п#Text",
    sourceHash: "a".repeat(64),
    sourceLocator: "table-row:4",
    reviewStatus: "reviewed",
    ...overrides,
  };
}

function product(overrides: Record<string, string> = {}) {
  return {
    registryId: "product-1",
    inn: "Ibuprofen",
    activeIngredient: "Ibuprofen 200 mg",
    dosageForm: "таблетки: 200 мг",
    ...overrides,
  };
}

describe("national list parser", () => {
  it("retains split, combination, empty-English and multiline official rows", () => {
    const snapshot = parseNationalListHtml(fixture, {
      checkedAt: "2026-07-13T00:00:00.000Z",
      expectedDocumentHash: null,
    });
    expect(snapshot.counts).toEqual({
      raw: 3,
      parsed: 3,
      valid: 3,
      invalid: 0,
      provenanceCoverage: 100,
    });
    expect(snapshot.status).toBe("reviewed");
    expect(snapshot.entries[1]).toMatchObject({
      officialNameEn: "Lisinopril + Hydrochlorothiazide",
      compositionSignature: "hydrochlorothiazide+lisinopril",
      strengths: ["10 мг/12.5 мг"],
    });
    expect(snapshot.entries[2]).toMatchObject({
      officialNameEn: "",
      compositionSignature: "калію хлорид+натрію хлорид",
    });
    expect(snapshot.source.documentHash).toMatch(/^[a-f\d]{64}$/u);
  });

  it("requires source review when the pinned official document hash changes", () => {
    const drifted = parseNationalListHtml(fixture);
    expect(drifted.status).toBe("draft");
    expect(drifted.errors).toContain(
      "Official document hash changed; source review is required.",
    );
  });

  it("blocks unofficial, incomplete, conflicting or anomalous activation inputs", () => {
    const valid = parseNationalListHtml(fixture, { expectedDocumentHash: null });
    valid.source.documentHash = NATIONAL_LIST_EXPECTED_DOCUMENT_HASH;
    for (const item of valid.entries) item.sourceHash = NATIONAL_LIST_EXPECTED_DOCUMENT_HASH;
    const templates = valid.entries;
    valid.entries = Array.from({ length: 120 }, (_, index) => ({
      ...structuredClone(templates[index % templates.length]),
      stableKey: `${templates[index % templates.length].stableKey}-${index}`,
    }));
    valid.counts.valid = 120;
    valid.counts.raw = 120;
    valid.counts.parsed = 120;
    const previous = structuredClone(valid);
    expect(evaluateNationalListActivation(valid, previous)).toEqual({ ready: true, blockers: [] });
    const unsafe = structuredClone(valid);
    unsafe.source.sourceUrl = "https://example.com/list";
    unsafe.counts.provenanceCoverage = 99;
    unsafe.errors.push("parse error");
    expect(evaluateNationalListActivation(unsafe).ready).toBe(false);
    const inconsistent = structuredClone(valid);
    inconsistent.entries.pop();
    expect(evaluateNationalListActivation(inconsistent).blockers)
      .toContain("Snapshot counts do not match parsed entries.");
    const anomalous = structuredClone(valid);
    anomalous.counts.valid = 200;
    expect(evaluateNationalListActivation(anomalous, previous).blockers)
      .toContain("Entry-count delta exceeds 30%.");
  });

  it("produces deterministic release diffs", () => {
    const current = parseNationalListHtml(fixture, { expectedDocumentHash: null });
    const previous = structuredClone(current) as NationalListSnapshot;
    previous.entries = previous.entries.slice(0, 2);
    previous.counts.valid = 2;
    expect(diffNationalListSnapshots(current, previous)).toEqual({
      added: 1,
      removed: 0,
      changed: 0,
    });
    const nextRelease = structuredClone(current);
    nextRelease.releaseId = "ua-national-list-next";
    nextRelease.entries[0].strengths = ["400 мг"];
    expect(nextRelease.entries[0].stableKey).toBe(current.entries[0].stableKey);
    expect(diffNationalListSnapshots(nextRelease, current)).toEqual({
      added: 0,
      removed: 0,
      changed: 1,
    });
  });
});

describe("national list resolver", () => {
  it("resolves exact mono-INN and exact fixed combination", () => {
    expect(resolveNationalListMatch(product(), [entry()], { activeRelease: true }).status)
      .toBe("exact");
    const combination = entry({
      stableKey: "combo",
      officialNameEn: "Lisinopril + Hydrochlorothiazide",
      ingredients: ["Lisinopril", "Hydrochlorothiazide"],
      compositionSignature: ingredientSignature("Lisinopril + Hydrochlorothiazide"),
      strengths: ["10 мг/12.5 мг"],
    });
    const match = resolveNationalListMatch(product({
      inn: "Hydrochlorothiazide + Lisinopril",
      activeIngredient: "10 mg/12.5 mg",
      dosageForm: "таблетки: 10 мг/12,5 мг",
    }), [combination], { activeRelease: true });
    expect(match.status).toBe("exact");
  });

  it.each([
    ["form", { dosageForm: "крем: 200 мг" }],
    ["route", { dosageForm: "розчин для ін'єкцій: 200 мг" }],
    ["strength", { activeIngredient: "Ibuprofen 600 mg", dosageForm: "таблетки: 600 мг" }],
  ])("returns ingredient_only for %s mismatch", (_label, override) => {
    const match = resolveNationalListMatch(product(override), [entry()], { activeRelease: true });
    expect(match.status).toBe("ingredient_only");
    expect(match.ingredientMatch).toBe("match");
  });

  it("never infers a fixed combination from separately listed components", () => {
    const match = resolveNationalListMatch(product({
      inn: "Ibuprofen + Paracetamol",
      activeIngredient: "Ibuprofen 200 mg + Paracetamol 500 mg",
    }), [entry(), entry({
      stableKey: "paracetamol",
      officialNameEn: "Paracetamol",
      ingredients: ["Paracetamol"],
      compositionSignature: ingredientSignature("Paracetamol"),
    })], { activeRelease: true });
    expect(match.status).toBe("uncertain");
    expect(match.entryStableKey).toBeNull();
  });

  it("separates uncertain, not-listed, not-applicable and versioned outcomes", () => {
    expect(resolveNationalListMatch(product({ inn: "" }), [entry()], { activeRelease: true }).status)
      .toBe("uncertain");
    expect(resolveNationalListMatch(product({ inn: "Unlisted" }), [entry()], { activeRelease: true }).status)
      .toBe("not_listed");
    expect(resolveNationalListMatch(product(), [entry()], { activeRelease: false }).status)
      .toBe("not_applicable");
    expect(resolveNationalListMatch(product(), [], { activeRelease: true }).status)
      .toBe("not_listed");
    expect(resolveNationalListMatch(product(), [entry()], { activeRelease: true }).status)
      .toBe("exact");
  });
});
