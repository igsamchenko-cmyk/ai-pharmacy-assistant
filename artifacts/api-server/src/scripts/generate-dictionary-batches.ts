import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ingredientSeeds,
  type IngredientSeed,
} from "../knowledge/dictionary/ingredients";

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const HEADER = [
  "ingredient_id",
  "canonical_inn",
  "name",
  "locale",
  "name_type",
  "source_id",
  "confidence",
  "atc_code",
  "notes",
];

const BATCHES = [
  ["0001-core-analgesics.csv", "core analgesics"],
  ["0002-antibiotics.csv", "antibiotics"],
  ["0003-cardiovascular-diuretics.csv", "cardiovascular diuretics"],
  ["0004-anticoagulants-antiplatelets.csv", "anticoagulants antiplatelets"],
  ["0005-gi-endocrine.csv", "gi endocrine"],
  ["0006-respiratory-allergy.csv", "respiratory allergy"],
  ["0007-neuro-psych.csv", "neuro psych"],
  ["0008-icu-emergency-electrolytes.csv", "icu emergency electrolytes"],
] as const;

type BatchFile = (typeof BATCHES)[number][0];

type CsvRow = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

function compact(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_+./\\()]+/g, "");
}

function slug(value: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || compact(value);
}

function trChar(ch: string): string {
  switch (ch.toLowerCase()) {
    case "\u0430":
      return "a";
    case "\u0431":
      return "b";
    case "\u0432":
      return "v";
    case "\u0433":
      return "h";
    case "\u0491":
      return "g";
    case "\u0434":
      return "d";
    case "\u0435":
      return "e";
    case "\u0454":
      return "ie";
    case "\u0436":
      return "zh";
    case "\u0437":
      return "z";
    case "\u0438":
      return "y";
    case "\u0456":
      return "i";
    case "\u0457":
      return "i";
    case "\u0439":
      return "i";
    case "\u043a":
      return "k";
    case "\u043b":
      return "l";
    case "\u043c":
      return "m";
    case "\u043d":
      return "n";
    case "\u043e":
      return "o";
    case "\u043f":
      return "p";
    case "\u0440":
      return "r";
    case "\u0441":
      return "s";
    case "\u0442":
      return "t";
    case "\u0443":
      return "u";
    case "\u0444":
      return "f";
    case "\u0445":
      return "kh";
    case "\u0446":
      return "ts";
    case "\u0447":
      return "ch";
    case "\u0448":
      return "sh";
    case "\u0449":
      return "shch";
    case "\u044c":
      return "";
    case "\u044e":
      return "iu";
    case "\u044f":
      return "ia";
    case "\u2019":
    case "\u02bc":
    case "'":
      return "";
    case " ":
    case "-":
    case "+":
    case "/":
      return " ";
    default:
      return /[a-z0-9]/i.test(ch) ? ch.toLowerCase() : "";
  }
}

function transliterate(value: string): string {
  return [...value].map(trChar).join("").replace(/\s+/g, " ").trim();
}

function batchFor(seed: IngredientSeed): BatchFile {
  const atc = seed.atc.toUpperCase();
  if (atc.startsWith("J")) return "0002-antibiotics.csv";
  if (atc.startsWith("B01")) return "0004-anticoagulants-antiplatelets.csv";
  if (atc.startsWith("C")) return "0003-cardiovascular-diuretics.csv";
  if (atc.startsWith("R")) return "0006-respiratory-allergy.csv";
  if (
    atc.startsWith("N03") ||
    atc.startsWith("N05") ||
    atc.startsWith("N06") ||
    atc.startsWith("N07")
  )
    return "0007-neuro-psych.csv";
  if (
    atc.startsWith("A02") ||
    atc.startsWith("A03") ||
    atc.startsWith("A05") ||
    atc.startsWith("A06") ||
    atc.startsWith("A07") ||
    atc.startsWith("A09") ||
    atc.startsWith("A10") ||
    atc.startsWith("H03")
  )
    return "0005-gi-endocrine.csv";
  if (
    atc.startsWith("H02") ||
    atc.startsWith("B03") ||
    atc.startsWith("A11") ||
    atc.startsWith("A12") ||
    atc.startsWith("D") ||
    atc.startsWith("N01")
  )
    return "0008-icu-emergency-electrolytes.csv";
  return "0001-core-analgesics.csv";
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(rows: CsvRow[]): string {
  return (
    [HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n"
  );
}

const byBatch = new Map<BatchFile, CsvRow[]>();
for (const [file] of BATCHES) byBatch.set(file, []);

const seenIngredients = new Set<string>();
const seenRows = new Set<string>();

for (const seed of ingredientSeeds) {
  const ingredientKey = compact(seed.inn);
  if (seenIngredients.has(ingredientKey)) continue;
  seenIngredients.add(ingredientKey);

  const ingredientId = `ing-${slug(seed.english || seed.latin || seed.inn)}`;
  const batch = batchFor(seed);
  const rows = byBatch.get(batch)!;
  const candidates: CsvRow[] = [
    [
      ingredientId,
      seed.inn,
      seed.inn,
      "uk",
      "ukrainian",
      "public_generic_inn",
      "verified",
      seed.atc,
      "v0.9 curated generic batch",
    ],
    [
      ingredientId,
      seed.inn,
      seed.english,
      "en",
      "english",
      "public_generic_inn",
      "verified",
      seed.atc,
      "v0.9 curated generic batch",
    ],
    [
      ingredientId,
      seed.inn,
      seed.latin,
      "la",
      "latin",
      "public_generic_inn",
      "verified",
      seed.atc,
      "v0.9 curated generic batch",
    ],
  ];
  const transliteration = transliterate(seed.inn);
  if (transliteration && compact(transliteration) !== compact(seed.english)) {
    candidates.push([
      ingredientId,
      seed.inn,
      transliteration,
      "uk-Latn",
      "transliteration",
      "project_generated_transliteration",
      "high",
      seed.atc,
      "v0.9 deterministic transliteration",
    ]);
  }
  for (const row of candidates) {
    const key = `${compact(row[2])}|${ingredientKey}`;
    if (seenRows.has(key)) continue;
    seenRows.add(key);
    rows.push(row);
  }
}

const outDir = resolve(REPO_ROOT, "data/dictionary-batches");
mkdirSync(outDir, { recursive: true });
for (const [file] of BATCHES) {
  const rows = byBatch.get(file)!;
  rows.sort(
    (a, b) =>
      a[1].localeCompare(b[1]) ||
      a[4].localeCompare(b[4]) ||
      a[2].localeCompare(b[2]),
  );
  writeFileSync(resolve(outDir, file), toCsv(rows), "utf8");
}

console.log(
  `Generated ${[...byBatch.values()].reduce((sum, rows) => sum + rows.length, 0)} rows in ${BATCHES.length} files.`,
);
