import { buildDictionaryBatchSummary } from "../knowledge";

const summary = buildDictionaryBatchSummary();
const warnings: string[] = [];

if (summary.suspiciousBrandLikeRows > 0) {
  warnings.push(
    `${summary.suspiciousBrandLikeRows} brand-like rows require review discipline.`,
  );
}
if (summary.ambiguousAbbreviationRows > 0) {
  warnings.push(
    `${summary.ambiguousAbbreviationRows} ambiguous short-name rows require review discipline.`,
  );
}

console.log("=== Dictionary batch validation ===");
console.log(`Files:             ${summary.files}`);
console.log(`Rows:              ${summary.totalRows}`);
console.log(`Parse errors:      ${summary.parseErrors}`);
console.log(`Missing sources:   ${summary.missingSources}`);
console.log(`Invalid ATC:       ${summary.invalidAtc}`);
console.log(`Copyright blocked: ${summary.copyrightViolations}`);
console.log(`Conflicts:         ${summary.conflicts}`);
console.log(`Source coverage:   ${summary.sourceCoveragePct}%`);
console.log(`Ukrainian coverage: ${summary.ukrainianCoveragePct}%`);
console.log(`ATC coverage:      ${summary.atcCoveragePct}%`);

for (const warning of warnings) console.log(`WARNING: ${warning}`);

if (!summary.wouldSucceed) {
  console.log("FAILED: dictionary batches contain blocking issues.");
  process.exit(1);
}

console.log("OK: dictionary batches passed validation.");
