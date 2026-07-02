/**
 * CLI: preview a dictionary import (dry-run, no writes).
 *
 *   pnpm --filter @workspace/api-server run import:preview [file]
 *
 * Parses the given import file (CSV or JSON), analyzes it against the live
 * knowledge base and prints a full preview: rows parsed, new ingredients/
 * mappings, duplicates, conflicts, missing sources, invalid ATC, confidence and
 * review distributions, and whether the import would succeed. Pure — no DB.
 * Defaults to the bundled dictionary sample when no file is given.
 */
import { readFileSync } from "node:fs";
import {
  parseImportCsv,
  parseImportJson,
  analyzeImport,
  liveKnowledgeView,
  readDictionarySampleCsv,
  type ParseResult,
} from "../knowledge";

function loadFile(path: string): ParseResult {
  const text = readFileSync(path, "utf8");
  return path.toLowerCase().endsWith(".json")
    ? parseImportJson(text)
    : parseImportCsv(text);
}

function main(): void {
  const file = process.argv[2];
  const { rows, errors } = file
    ? loadFile(file)
    : parseImportCsv(readDictionarySampleCsv());

  const preview = analyzeImport(rows, liveKnowledgeView(), errors);

  console.log("=== Попередній перегляд імпорту ===");
  console.log(`Файл:                 ${file ?? "(вбудований зразок)"}`);
  console.log(`Рядків розпізнано:    ${preview.rowsParsed}`);
  console.log(`Помилок розбору:      ${preview.parseErrors}`);
  console.log(`Нові діючі речовини:  ${preview.newIngredients}`);
  console.log(`Нові назви (mappings):${preview.newMappings}`);
  console.log(`Дублікати:            ${preview.duplicates}`);
  console.log(`Відсутні джерела:     ${preview.missingSources}`);
  console.log(`Некоректні ATC:       ${preview.invalidAtc}`);
  console.log(`Пропрієтарні джерела: ${preview.copyrightViolations}`);
  console.log("");
  console.log("Розподіл довіри:");
  console.log(`  low:      ${preview.confidenceDistribution.low}`);
  console.log(`  medium:   ${preview.confidenceDistribution.medium}`);
  console.log(`  high:     ${preview.confidenceDistribution.high}`);
  console.log(`  verified: ${preview.confidenceDistribution.verified}`);
  console.log("");
  console.log("Черга рецензування:");
  console.log(`  approved:     ${preview.reviewDistribution.approved}`);
  console.log(`  pending:      ${preview.reviewDistribution.pending}`);
  console.log(`  needs_review: ${preview.reviewDistribution.needs_review}`);
  console.log(`  rejected:     ${preview.reviewDistribution.rejected}`);
  console.log("");

  if (preview.conflicts.length > 0) {
    console.log(`Конфлікти (${preview.conflicts.length}):`);
    for (const c of preview.conflicts) {
      console.log(`  [${c.type}] ${c.detail}`);
    }
    console.log("");
  }

  if (preview.parseErrors > 0) {
    console.log(`Помилки розбору (${errors.length}):`);
    for (const e of errors) {
      console.log(`  рядок ${e.row}, поле ${e.field}: ${e.message}`);
    }
    console.log("");
  }

  console.log(
    preview.wouldSucceed
      ? "✅ Імпорт БУДЕ успішним (немає блокуючих проблем)."
      : "❌ Імпорт НЕ буде успішним (є блокуючі проблеми).",
  );
}

main();
