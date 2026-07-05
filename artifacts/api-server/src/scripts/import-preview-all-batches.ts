import { buildDictionaryBatchSummary } from "../knowledge";

const summary = buildDictionaryBatchSummary();

console.log("=== Dictionary batch import preview ===");
console.log(`Files:               ${summary.files}`);
console.log(`Rows parsed:         ${summary.totalRows}`);
console.log(`New ingredients:     ${summary.totalNewIngredients}`);
console.log(`New mappings:        ${summary.totalNewMappings}`);
console.log(`Duplicates:          ${summary.duplicates}`);
console.log(`Conflicts:           ${summary.conflicts}`);
console.log(`Parse errors:        ${summary.parseErrors}`);
console.log(`Missing sources:     ${summary.missingSources}`);
console.log(`Invalid ATC:         ${summary.invalidAtc}`);
console.log(`Copyright blocked:   ${summary.copyrightViolations}`);
console.log(`Ukrainian rows:      ${summary.ukrainianRows}`);
console.log(`ATC coverage:        ${summary.atcCoveragePct}%`);
console.log("");

for (const file of summary.fileSummaries) {
  console.log(
    `${file.fileName}: ${file.rowsParsed} rows, ${file.newMappings} new mappings, ` +
      `${file.conflicts} conflicts, ${file.wouldSucceed ? "ok" : "blocked"}`,
  );
}

console.log("");
console.log(
  summary.wouldSucceed
    ? "OK: all dictionary batches are safe to preview."
    : "BLOCKED: one or more dictionary batches have blocking issues.",
);

if (!summary.wouldSucceed) process.exitCode = 1;
