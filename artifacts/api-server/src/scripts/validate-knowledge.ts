/**
 * CLI: validate the knowledge base data quality.
 *
 *   pnpm --filter @workspace/api-server run validate:knowledge
 *
 * Prints a human-readable report and exits with code 1 if there are any errors,
 * so it can be used as a CI gate. Pure — no database required.
 */
import { validateKnowledge } from "../knowledge";

function main(): void {
  const report = validateKnowledge();

  console.log("=== Перевірка якості бази знань ===");
  console.log(`Час: ${report.generatedAt}`);
  console.log("");
  console.log("Кількість записів:");
  console.log(`  Діючі речовини:        ${report.counts.ingredients}`);
  console.log(`  Назви (mappings):      ${report.counts.mappings}`);
  console.log(
    `  Правила взаємодій:     ${report.counts.interactionRules} ` +
      `(курованих ${report.counts.curatedRules}, згенерованих ${report.counts.generatedRules})`,
  );
  console.log(`  Препарати:             ${report.counts.drugs}`);
  console.log(`  ATC-коди (згадані):    ${report.counts.atcCodesReferenced}`);
  console.log("");
  console.log("Покриття провенансом:");
  console.log(
    `  Назви з джерелом:      ${report.coverage.mappingsWithProvenance}/${report.counts.mappings} (${report.coverage.mappingProvenancePct}%)`,
  );
  console.log(
    `  Правила з джерелом:    ${report.coverage.rulesWithSource}/${report.counts.interactionRules} (${report.coverage.ruleSourcePct}%)`,
  );
  console.log(
    `  Препарати з ATC:       ${report.coverage.drugsWithValidAtc}/${report.counts.drugs} (${report.coverage.drugAtcPct}%)`,
  );
  console.log("");

  if (report.warnings.length > 0) {
    console.log(`Попередження (${report.warnings.length}):`);
    for (const w of report.warnings) {
      console.log(`  [${w.code}] ${w.message}`);
    }
    console.log("");
  }

  if (report.errors.length > 0) {
    console.log(`ПОМИЛКИ (${report.errors.length}):`);
    for (const e of report.errors) {
      console.log(`  [${e.code}] ${e.message}`);
    }
    console.log("");
    console.log("❌ Перевірку не пройдено.");
    process.exit(1);
  }

  console.log("✅ Перевірку пройдено, критичних помилок немає.");
}

main();
