import { describe, it, expect } from "vitest";
import {
  // format
  NAME_TYPES,
  CONFIDENCE_LEVELS,
  REVIEW_STATUSES,
  IMPORT_COLUMNS,
  REQUIRED_COLUMNS,
  isNameType,
  isConfidenceLevel,
  nameTypeToKind,
  // csv
  parseCsv,
  toCsv,
  csvCell,
  // parse
  parseImportCsv,
  parseImportJson,
  // guard
  COPYRIGHTED_SOURCE_TOKENS,
  findCopyrightedSources,
  isImportSourceSafe,
  // review
  deriveReviewStatus,
  isAutoApprovable,
  emptyReviewDistribution,
  // analyze
  analyzeImport,
  liveKnowledgeView,
  type KnowledgeView,
  type ImportRow,
  // samples
  readDictionarySampleCsv,
  readSampleFile,
  findSamplesDir,
  DICTIONARY_SAMPLE_CSV,
  DICTIONARY_SAMPLE_JSON,
  INTERACTIONS_SAMPLE_CSV,
  ATC_SAMPLE_CSV,
} from "../import";
import { isDbRuntimeEnabled, KNOWLEDGE_DB_RUNTIME_ENV } from "../runtime";
import {
  staticDictionaryProvider,
  createDbDictionaryProvider,
  selectDictionaryProvider,
} from "../dictionary/provider";
import { resolveName, activeDictionaryProvider } from "../dictionary/active";
import { normalizeQuery } from "../dictionary";
import type { DictionaryEntry } from "../dictionary";

function row(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    ingredientId: "ing-ibuprofen",
    canonicalInn: "Ібупрофен",
    name: "Нурофен",
    locale: "uk",
    nameType: "brand",
    sourceId: "who-inn",
    confidence: "verified",
    ...overrides,
  };
}

/** Empty knowledge base view for isolated analysis tests. */
function emptyView(overrides: Partial<KnowledgeView> = {}): KnowledgeView {
  return {
    existingInnKeys: new Set<string>(),
    existingNameToInn: new Map<string, string>(),
    isKnownSource: () => true,
    resolveAtc: () => true,
    ...overrides,
  };
}

describe("import/format", () => {
  it("declares the expected enums and columns", () => {
    expect(NAME_TYPES).toContain("brand");
    expect(NAME_TYPES).toContain("typo");
    expect(CONFIDENCE_LEVELS).toEqual(["low", "medium", "high", "verified"]);
    expect(REVIEW_STATUSES).toContain("needs_review");
    expect(IMPORT_COLUMNS[0]).toBe("ingredient_id");
    expect(REQUIRED_COLUMNS).not.toContain("atc_code");
    expect(REQUIRED_COLUMNS).not.toContain("notes");
  });

  it("validates name types and confidence levels", () => {
    expect(isNameType("brand")).toBe(true);
    expect(isNameType("nonsense")).toBe(false);
    expect(isConfidenceLevel("verified")).toBe(true);
    expect(isConfidenceLevel("maybe")).toBe(false);
  });

  it("maps every name type to a runtime NameKind", () => {
    expect(nameTypeToKind("brand")).toBe("brand");
    expect(nameTypeToKind("latin")).toBe("latin");
    expect(nameTypeToKind("english")).toBe("english");
    expect(nameTypeToKind("ukrainian")).toBe("inn");
    expect(nameTypeToKind("generic")).toBe("inn");
    expect(nameTypeToKind("synonym")).toBe("synonym");
    expect(nameTypeToKind("transliteration")).toBe("synonym");
    expect(nameTypeToKind("typo")).toBe("synonym");
  });
});

describe("import/csv", () => {
  it("round-trips rows through toCsv/parseCsv", () => {
    const matrix = [
      ["a", "b", "c"],
      ["1", "2", "3"],
    ];
    const parsed = parseCsv(toCsv(matrix));
    expect(parsed).toEqual(matrix);
  });

  it("quotes cells containing commas, quotes and newlines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('has "quote"')).toBe('"has ""quote"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });

  it("parses quoted fields with embedded delimiters", () => {
    const parsed = parseCsv('name,notes\n"Нурофен","містить, кому"');
    expect(parsed[1]).toEqual(["Нурофен", "містить, кому"]);
  });
});

describe("import/parse (CSV)", () => {
  const header = IMPORT_COLUMNS.join(",");

  it("parses a valid row", () => {
    const csv = `${header}\ning-ibu,Ібупрофен,Нурофен,uk,brand,who-inn,verified,M01AE01,note`;
    const { rows, errors } = parseImportCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      canonicalInn: "Ібупрофен",
      name: "Нурофен",
      nameType: "brand",
      confidence: "verified",
      atcCode: "M01AE01",
      notes: "note",
    });
  });

  it("omits optional fields when blank", () => {
    const csv = `${header}\ning,Ібупрофен,Нурофен,uk,brand,who-inn,high,,`;
    const { rows } = parseImportCsv(csv);
    expect(rows[0].atcCode).toBeUndefined();
    expect(rows[0].notes).toBeUndefined();
  });

  it("reports missing required fields per row", () => {
    const csv = `${header}\n,,Нурофен,uk,brand,who-inn,high,,`;
    const { rows, errors } = parseImportCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors.some((e) => e.field === "ingredient_id")).toBe(true);
    expect(errors.some((e) => e.field === "canonical_inn")).toBe(true);
  });

  it("rejects unknown enum values", () => {
    const bad = `${header}\ning,Ібупрофен,Нурофен,uk,potion,who-inn,high,,`;
    expect(parseImportCsv(bad).errors.some((e) => e.field === "name_type")).toBe(
      true,
    );
    const bad2 = `${header}\ning,Ібупрофен,Нурофен,uk,brand,who-inn,ultra,,`;
    expect(
      parseImportCsv(bad2).errors.some((e) => e.field === "confidence"),
    ).toBe(true);
  });

  it("flags unknown and missing header columns", () => {
    const unknown = `ingredient_id,canonical_inn,name,locale,name_type,source_id,confidence,mystery\n`;
    expect(parseImportCsv(unknown).errors.some((e) => e.row === 0)).toBe(true);
    const missing = `name,locale\nНурофен,uk`;
    expect(parseImportCsv(missing).errors.some((e) => e.row === 0)).toBe(true);
  });
});

describe("import/parse (JSON)", () => {
  it("parses an array of rows", () => {
    const json = JSON.stringify([
      {
        ingredient_id: "ing",
        canonical_inn: "Ібупрофен",
        name: "Нурофен",
        locale: "uk",
        name_type: "brand",
        source_id: "who-inn",
        confidence: "high",
      },
    ]);
    const { rows, errors } = parseImportJson(json);
    expect(errors).toHaveLength(0);
    expect(rows[0].name).toBe("Нурофен");
  });

  it("accepts a { rows: [...] } wrapper", () => {
    const json = JSON.stringify({
      rows: [
        {
          ingredient_id: "ing",
          canonical_inn: "Парацетамол",
          name: "Панадол",
          locale: "uk",
          name_type: "brand",
          source_id: "who-inn",
          confidence: "verified",
        },
      ],
    });
    expect(parseImportJson(json).rows[0].canonicalInn).toBe("Парацетамол");
  });

  it("reports invalid JSON and non-array payloads", () => {
    expect(parseImportJson("{ not json").errors[0].message).toContain(
      "Некоректний JSON",
    );
    expect(parseImportJson('{"foo":1}').errors).toHaveLength(1);
  });
});

describe("import/guard", () => {
  it("exposes a non-empty denylist", () => {
    expect(COPYRIGHTED_SOURCE_TOKENS.length).toBeGreaterThan(5);
    expect(COPYRIGHTED_SOURCE_TOKENS).toContain("compendium");
  });

  it("flags proprietary source ids", () => {
    const violations = findCopyrightedSources([
      row({ sourceId: "vidal-2024" }),
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0].token).toBe("vidal");
  });

  it("flags proprietary references hidden in notes", () => {
    const violations = findCopyrightedSources([
      row({ sourceId: "who-inn", notes: "copied from drugbank" }),
    ]);
    expect(violations[0].token).toBe("drugbank");
  });

  it("passes rows that only cite public sources", () => {
    expect(isImportSourceSafe([row({ sourceId: "who-inn" })])).toBe(true);
    expect(
      findCopyrightedSources([row({ sourceId: "who-atc" })]),
    ).toHaveLength(0);
  });
});

describe("import/review", () => {
  it("never auto-approves suspicious rows", () => {
    expect(
      deriveReviewStatus(row(), { unknownSource: true }),
    ).toBe("rejected");
    expect(deriveReviewStatus(row(), { hasConflict: true })).toBe(
      "needs_review",
    );
    expect(deriveReviewStatus(row({ nameType: "typo" }))).toBe("needs_review");
    expect(deriveReviewStatus(row({ confidence: "low" }))).toBe("needs_review");
  });

  it("approves only clean high/verified rows", () => {
    expect(deriveReviewStatus(row({ confidence: "verified" }))).toBe(
      "approved",
    );
    expect(deriveReviewStatus(row({ confidence: "high" }))).toBe("approved");
    expect(deriveReviewStatus(row({ confidence: "medium" }))).toBe("pending");
  });

  it("prioritizes unknown source over other signals", () => {
    expect(
      deriveReviewStatus(row({ confidence: "verified" }), {
        unknownSource: true,
        hasConflict: true,
      }),
    ).toBe("rejected");
  });

  it("exposes auto-approvable + empty distribution helpers", () => {
    expect(isAutoApprovable("approved")).toBe(true);
    expect(isAutoApprovable("pending")).toBe(false);
    expect(emptyReviewDistribution()).toEqual({
      pending: 0,
      approved: 0,
      rejected: 0,
      needs_review: 0,
    });
  });
});

describe("import/analyze", () => {
  it("counts new ingredients and mappings against an empty base", () => {
    const preview = analyzeImport(
      [row(), row({ name: "Ібупром", ingredientId: "ing-ibuprofen" })],
      emptyView(),
    );
    expect(preview.rowsParsed).toBe(2);
    expect(preview.newIngredients).toBe(1);
    expect(preview.newMappings).toBe(2);
    expect(preview.wouldSucceed).toBe(true);
  });

  it("detects duplicate mappings without blocking", () => {
    const view = emptyView({
      existingNameToInn: new Map([["нурофен", "ібупрофен"]]),
      existingInnKeys: new Set(["ібупрофен"]),
    });
    const preview = analyzeImport([row()], view);
    expect(preview.duplicates).toBe(1);
    expect(preview.wouldSucceed).toBe(true);
  });

  it("flags a name pointing at two ingredients as a hard conflict", () => {
    const view = emptyView({
      existingNameToInn: new Map([["нурофен", "парацетамол"]]),
    });
    const preview = analyzeImport([row()], view);
    expect(
      preview.conflicts.some((c) => c.type === "name_multiple_ingredients"),
    ).toBe(true);
    expect(preview.wouldSucceed).toBe(false);
  });

  it("blocks on unknown source and invalid ATC", () => {
    const preview = analyzeImport(
      [row({ sourceId: "x", atcCode: "ZZZZ99" })],
      emptyView({ isKnownSource: () => false, resolveAtc: () => false }),
    );
    expect(preview.missingSources).toBe(1);
    expect(preview.invalidAtc).toBe(1);
    expect(preview.wouldSucceed).toBe(false);
  });

  it("blocks on copyrighted sources", () => {
    const preview = analyzeImport([row({ sourceId: "medscape" })], emptyView());
    expect(preview.copyrightViolations).toBe(1);
    expect(preview.wouldSucceed).toBe(false);
  });

  it("propagates parse errors into wouldSucceed", () => {
    const preview = analyzeImport([row()], emptyView(), [
      { row: 1, field: "name", message: "bad" },
    ]);
    expect(preview.parseErrors).toBe(1);
    expect(preview.wouldSucceed).toBe(false);
  });

  it("tallies confidence and review distributions", () => {
    const preview = analyzeImport(
      [
        row({ confidence: "verified", name: "A" }),
        row({ confidence: "low", name: "B" }),
        row({ confidence: "medium", name: "C" }),
      ],
      emptyView(),
    );
    expect(preview.confidenceDistribution.verified).toBe(1);
    expect(preview.confidenceDistribution.low).toBe(1);
    expect(preview.reviewDistribution.approved).toBe(1);
    expect(preview.reviewDistribution.needs_review).toBe(1);
    expect(preview.reviewDistribution.pending).toBe(1);
  });

  it("builds a live view from the static dictionary", () => {
    const view = liveKnowledgeView();
    expect(view.existingInnKeys.size).toBeGreaterThan(0);
    expect(view.existingNameToInn.size).toBeGreaterThan(0);
  });
});

describe("import/samples", () => {
  it("locates the samples directory", () => {
    expect(findSamplesDir()).not.toBeNull();
  });

  it("reads all four sample files", () => {
    expect(readSampleFile(DICTIONARY_SAMPLE_CSV)).not.toBeNull();
    expect(readSampleFile(DICTIONARY_SAMPLE_JSON)).not.toBeNull();
    expect(readSampleFile(INTERACTIONS_SAMPLE_CSV)).not.toBeNull();
    expect(readSampleFile(ATC_SAMPLE_CSV)).not.toBeNull();
  });

  it("bundled dictionary sample parses and passes safety + analysis", () => {
    const csv = readDictionarySampleCsv();
    const { rows, errors } = parseImportCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows.length).toBeGreaterThan(0);
    expect(isImportSourceSafe(rows)).toBe(true);
    const preview = analyzeImport(rows, liveKnowledgeView(), errors);
    expect(preview.wouldSucceed).toBe(true);
  });

  it("bundled JSON sample parses cleanly", () => {
    const json = readSampleFile(DICTIONARY_SAMPLE_JSON)!;
    const { rows, errors } = parseImportJson(json);
    expect(errors).toHaveLength(0);
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("knowledge/runtime flag", () => {
  it("defaults OFF and is ON only for the exact string 'true'", () => {
    expect(KNOWLEDGE_DB_RUNTIME_ENV).toBe("KNOWLEDGE_DB_RUNTIME");
    expect(isDbRuntimeEnabled({})).toBe(false);
    expect(isDbRuntimeEnabled({ KNOWLEDGE_DB_RUNTIME: "false" })).toBe(false);
    expect(isDbRuntimeEnabled({ KNOWLEDGE_DB_RUNTIME: "1" })).toBe(false);
    expect(isDbRuntimeEnabled({ KNOWLEDGE_DB_RUNTIME: "true" })).toBe(true);
  });
});

describe("dictionary provider bridge", () => {
  const sampleEntry: DictionaryEntry = {
    name: "TestDrugName",
    kind: "brand",
    ingredient: {
      inn: "TestInn",
      english: "TestEnglish",
      latin: "TestLatin",
      atc: "",
      synonyms: [],
    },
  } as unknown as DictionaryEntry;

  it("static provider serves the seed dictionary", () => {
    expect(staticDictionaryProvider.id).toBe("static");
    expect(staticDictionaryProvider.listEntries().length).toBeGreaterThan(0);
    expect(staticDictionaryProvider.normalizeQuery("Нурофен")).not.toBeNull();
  });

  it("db provider indexes injected entries with exact + substring lookup", () => {
    const provider = createDbDictionaryProvider([sampleEntry]);
    expect(provider.id).toBe("db");
    expect(provider.normalizeQuery("testdrugname")).toBe(sampleEntry);
    expect(provider.normalizeQuery("TestDrug")).toBe(sampleEntry);
    expect(provider.normalizeQuery("")).toBeNull();
    expect(provider.normalizeQuery("zz")).toBeNull();
    expect(provider.normalizeQuery("otherdrugname")).toBeNull();
  });

  it("selects static by default even when flag is on but no entries", () => {
    expect(selectDictionaryProvider().id).toBe("static");
    expect(selectDictionaryProvider({ dbRuntime: true }).id).toBe("static");
    expect(
      selectDictionaryProvider({ dbRuntime: false, dbEntries: [sampleEntry] })
        .id,
    ).toBe("static");
  });

  it("selects db only when flag on AND entries supplied", () => {
    expect(
      selectDictionaryProvider({ dbRuntime: true, dbEntries: [sampleEntry] })
        .id,
    ).toBe("db");
    expect(
      selectDictionaryProvider({
        env: { KNOWLEDGE_DB_RUNTIME: "true" },
        dbEntries: [sampleEntry],
      }).id,
    ).toBe("db");
  });
});

describe("parseImportJson strict schema", () => {
  const cleanRow = (): Record<string, string> => ({
    ingredient_id: "ing-ibuprofen",
    canonical_inn: "Ібупрофен",
    name: "Нурофен",
    locale: "uk",
    name_type: "brand",
    source_id: "who-inn",
    confidence: "high",
    atc_code: "M01AE01",
    notes: "",
  });

  it("rejects rows with unknown/extra keys", () => {
    const bad = { ...cleanRow(), rogue_field: "should fail" };
    const { rows, errors } = parseImportJson(JSON.stringify([bad]));
    expect(rows).toHaveLength(0);
    expect(errors.some((e) => /rogue_field/.test(e.field))).toBe(true);
  });

  it("accepts rows containing only known columns", () => {
    const { rows, errors } = parseImportJson(JSON.stringify([cleanRow()]));
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
  });
});

describe("runtime dictionary seam (active provider)", () => {
  it("defaults to the static provider", () => {
    expect(activeDictionaryProvider().id).toBe("static");
  });

  it("resolveName matches the static normalizeQuery by default", () => {
    const viaSeam = resolveName("Нурофен");
    const viaStatic = normalizeQuery("Нурофен");
    expect(viaSeam?.ingredient.inn).toBe(viaStatic?.ingredient.inn);
    expect(viaSeam).toEqual(viaStatic);
  });
});
