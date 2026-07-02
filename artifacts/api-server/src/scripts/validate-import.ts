/**
 * CLI: validate import sample files (structure + safety).
 *
 *   pnpm --filter @workspace/api-server run validate:import
 *
 * With no arguments, validates all bundled sample files (dictionary CSV+JSON,
 * interactions CSV, ATC CSV). Checks structure, enums, provenance sources and
 * the copyrighted-source guard. Exits with code 1 on any blocking problem so it
 * can act as a CI gate. Pure — no database required.
 */
import {
  parseCsv,
  parseImportCsv,
  parseImportJson,
  analyzeImport,
  findCopyrightedSources,
  liveKnowledgeView,
  readSampleFile,
  DICTIONARY_SAMPLE_CSV,
  DICTIONARY_SAMPLE_JSON,
  INTERACTIONS_SAMPLE_CSV,
  ATC_SAMPLE_CSV,
} from "../knowledge";
import { isKnownSource } from "../knowledge";

const RISK_LEVELS = new Set(["low", "medium", "high", "critical"]);
const CONFIDENCE = new Set(["low", "medium", "high", "verified"]);

let failures = 0;

function fail(msg: string): void {
  failures++;
  console.log(`  ❌ ${msg}`);
}

function validateDictionary(fileName: string, isJson: boolean): void {
  console.log(`\n— ${fileName}`);
  const text = readSampleFile(fileName);
  if (text === null) {
    fail(`Файл не знайдено.`);
    return;
  }
  const { rows, errors } = isJson ? parseImportJson(text) : parseImportCsv(text);
  for (const e of errors) fail(`рядок ${e.row}, ${e.field}: ${e.message}`);
  const violations = findCopyrightedSources(rows);
  for (const v of violations) fail(v.message);
  const preview = analyzeImport(rows, liveKnowledgeView(), errors);
  console.log(
    `  розпізнано ${preview.rowsParsed}, конфліктів ${preview.conflicts.length}, ` +
      `відсутніх джерел ${preview.missingSources}, некоректних ATC ${preview.invalidAtc}`,
  );
  if (!preview.wouldSucceed) fail("імпорт містить блокуючі проблеми.");
  else console.log("  ✅ структура коректна.");
}

function validateInteractions(): void {
  console.log(`\n— ${INTERACTIONS_SAMPLE_CSV}`);
  const text = readSampleFile(INTERACTIONS_SAMPLE_CSV);
  if (text === null) return fail("Файл не знайдено.");
  const matrix = parseCsv(text);
  const header = matrix[0] ?? [];
  const idx = (c: string) => header.indexOf(c);
  for (const c of ["ingredient_a", "ingredient_b", "risk_level", "source_id"]) {
    if (idx(c) === -1) fail(`відсутня колонка «${c}».`);
  }
  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i];
    const a = (r[idx("ingredient_a")] ?? "").trim();
    const b = (r[idx("ingredient_b")] ?? "").trim();
    const risk = (r[idx("risk_level")] ?? "").trim();
    const src = (r[idx("source_id")] ?? "").trim();
    if (!a || !b) fail(`рядок ${i}: порожній матчер.`);
    if (a && a.toLowerCase() === b.toLowerCase()) fail(`рядок ${i}: пара сама з собою.`);
    if (!RISK_LEVELS.has(risk)) fail(`рядок ${i}: невідомий ризик «${risk}».`);
    if (!isKnownSource(src)) fail(`рядок ${i}: невідоме джерело «${src}».`);
  }
  if (failures === 0) console.log("  ✅ структура коректна.");
}

function validateAtc(): void {
  console.log(`\n— ${ATC_SAMPLE_CSV}`);
  const text = readSampleFile(ATC_SAMPLE_CSV);
  if (text === null) return fail("Файл не знайдено.");
  const matrix = parseCsv(text);
  const header = matrix[0] ?? [];
  const idx = (c: string) => header.indexOf(c);
  for (const c of ["atc_code", "anatomical_group", "therapeutic_class", "source_id"]) {
    if (idx(c) === -1) fail(`відсутня колонка «${c}».`);
  }
  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i];
    const code = (r[idx("atc_code")] ?? "").trim();
    const src = (r[idx("source_id")] ?? "").trim();
    if (!/^[A-Z]\d{2}[A-Z]{2}\d{2}$/i.test(code)) fail(`рядок ${i}: некоректний ATC «${code}».`);
    if (!isKnownSource(src)) fail(`рядок ${i}: невідоме джерело «${src}».`);
  }
}

function main(): void {
  console.log("=== Валідація зразків імпорту ===");
  validateDictionary(DICTIONARY_SAMPLE_CSV, false);
  validateDictionary(DICTIONARY_SAMPLE_JSON, true);
  validateInteractions();
  validateAtc();

  console.log("");
  if (failures > 0) {
    console.log(`❌ Валідацію не пройдено (${failures} проблем).`);
    process.exit(1);
  }
  console.log("✅ Усі зразки імпорту валідні.");
}

main();
