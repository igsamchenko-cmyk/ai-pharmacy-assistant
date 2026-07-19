import { normalize } from "../lib/text";
import type { RegistryParseResult } from "./ingestion/registry";

export const EVIDENCE_COVERAGE_REPORT_VERSION =
  "evidence-comparison-coverage-v1";
export const EVIDENCE_REGISTRY_INDEX_VERSION =
  "evidence-comparison-registry-index-v1";

export interface EvidenceRegistryIndex {
  schemaVersion: typeof EVIDENCE_REGISTRY_INDEX_VERSION;
  records: Array<{
    id: string;
    comparatorInnKeys: [string, string];
    indicationIds: string[];
  }>;
}

export interface EvidenceComparisonCoverageReport {
  schemaVersion: typeof EVIDENCE_COVERAGE_REPORT_VERSION;
  officialRegistry: {
    sourceSha256: string;
    validRows: number;
    invalidRows: number;
    rowsWithValidAtc: number;
  };
  counts: {
    normalizedInnExpressions: number;
    therapeuticClasses: number;
    potentialInnPairs: number;
    verifiedEvidenceRecords: number;
    verifiedInnPairs: number;
    insufficientEvidencePairs: number;
  };
}

export function potentialUnorderedPairs(itemCount: number): number {
  if (!Number.isSafeInteger(itemCount) || itemCount < 0) {
    throw new Error("itemCount must be a non-negative safe integer");
  }
  return (itemCount * (itemCount - 1)) / 2;
}

export function parseEvidenceRegistryIndex(
  value: unknown,
): EvidenceRegistryIndex {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Evidence registry index must be an object.");
  }
  const candidate = value as { schemaVersion?: unknown; records?: unknown };
  if (candidate.schemaVersion !== EVIDENCE_REGISTRY_INDEX_VERSION) {
    throw new Error("Unsupported evidence registry index version.");
  }
  if (!Array.isArray(candidate.records) || candidate.records.length === 0) {
    throw new Error("Evidence registry index must contain records.");
  }

  const ids = new Set<string>();
  const records = candidate.records.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Evidence registry record ${index} must be an object.`);
    }
    const record = value as {
      id?: unknown;
      comparatorInnKeys?: unknown;
      indicationIds?: unknown;
    };
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id || ids.has(id))
      throw new Error(
        `Invalid or duplicate evidence record id: ${id || index}.`,
      );
    ids.add(id);

    if (
      !Array.isArray(record.comparatorInnKeys) ||
      record.comparatorInnKeys.length !== 2
    ) {
      throw new Error(
        `Evidence record ${id} must have exactly two comparator INNs.`,
      );
    }
    const comparatorInnKeys = record.comparatorInnKeys.map((item) =>
      typeof item === "string" ? normalize(item) : "",
    ) as [string, string];
    if (
      comparatorInnKeys.some((item) => !item) ||
      comparatorInnKeys[0] === comparatorInnKeys[1]
    ) {
      throw new Error(`Evidence record ${id} has invalid comparator INNs.`);
    }

    if (
      !Array.isArray(record.indicationIds) ||
      record.indicationIds.length === 0
    ) {
      throw new Error(
        `Evidence record ${id} must have at least one indication.`,
      );
    }
    const indicationIds = record.indicationIds.map((item) =>
      typeof item === "string" ? item.trim() : "",
    );
    if (indicationIds.some((item) => !item)) {
      throw new Error(`Evidence record ${id} has an invalid indication id.`);
    }

    return { id, comparatorInnKeys, indicationIds };
  });

  return { schemaVersion: EVIDENCE_REGISTRY_INDEX_VERSION, records };
}

function atcClassKeys(value: string): string[] {
  const matches =
    value.toUpperCase().match(/\b[A-Z]\d{2}[A-Z]{2}\d{2}\b/gu) ?? [];
  return [...new Set(matches.map((code) => code.slice(0, 5)))];
}

export function buildEvidenceComparisonCoverageReport(
  registry: RegistryParseResult,
  index: EvidenceRegistryIndex,
): EvidenceComparisonCoverageReport {
  if (registry.parseErrors.length > 0) {
    throw new Error(
      `Official registry has ${registry.parseErrors.length} parse errors.`,
    );
  }
  const sourceSha256 = registry.snapshot?.sha256?.toLowerCase() ?? "";
  if (!/^[a-f0-9]{64}$/u.test(sourceSha256)) {
    throw new Error("Official registry snapshot SHA-256 is required.");
  }

  const normalizedInnExpressions = new Set(
    registry.rows.map((row) => normalize(row.inn)).filter(Boolean),
  ).size;
  const atcClassesByRow = registry.rows.map((row) => atcClassKeys(row.atcCode));
  const therapeuticClasses = new Set(atcClassesByRow.flat()).size;
  const verifiedPairs = new Set(
    index.records.map((record) =>
      [...record.comparatorInnKeys].sort().join("::"),
    ),
  ).size;
  const potentialInnPairs = potentialUnorderedPairs(normalizedInnExpressions);

  return {
    schemaVersion: EVIDENCE_COVERAGE_REPORT_VERSION,
    officialRegistry: {
      sourceSha256,
      validRows: registry.rows.length,
      invalidRows: Math.max(0, registry.rawRows - registry.rows.length),
      rowsWithValidAtc: atcClassesByRow.filter((keys) => keys.length > 0)
        .length,
    },
    counts: {
      normalizedInnExpressions,
      therapeuticClasses,
      potentialInnPairs,
      verifiedEvidenceRecords: index.records.length,
      verifiedInnPairs: verifiedPairs,
      insufficientEvidencePairs: potentialInnPairs - verifiedPairs,
    },
  };
}

function count(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function renderEvidenceComparisonCoverageReport(
  report: EvidenceComparisonCoverageReport,
): string {
  return `# Evidence comparison coverage

Fresh official DRLZ export SHA-256: \`${report.officialRegistry.sourceSha256}\`

| Metric | Count |
| --- | ---: |
| Official valid rows | ${count(report.officialRegistry.validRows)} |
| Official invalid rows | ${count(report.officialRegistry.invalidRows)} |
| Unique normalized INN/composition expressions | ${count(report.counts.normalizedInnExpressions)} |
| Distinct valid ATC 5-character class prefixes | ${count(report.counts.therapeuticClasses)} |
| Official rows with a valid ATC code | ${count(report.officialRegistry.rowsWithValidAtc)} |
| Potential unordered INN-expression pairs | ${count(report.counts.potentialInnPairs)} |
| Reviewed evidence records | ${count(report.counts.verifiedEvidenceRecords)} |
| Verified exact INN pairs | ${count(report.counts.verifiedInnPairs)} |
| Pairs returning insufficient evidence | ${count(report.counts.insufficientEvidencePairs)} |

## Reproduce

\`pnpm run knowledge:evidence:coverage-report -- --file=<audited-reestr.csv> --expected-sha256=${report.officialRegistry.sourceSha256} --check\`

The command parses the complete official CSV, verifies its exact SHA-256, reads the versioned evidence registry index and byte-compares this report.

## Definitions and safety

- The denominator uses every distinct normalized INN/composition expression in the audited official export, not a curated sample.
- Combination expressions remain exact compositions; they are not split into assumed monotherapies.
- “Potential pairs” is a mathematical coverage denominator, not a claim that each pair is clinically meaningful.
- A verified record is scoped to exact comparator INNs and explicit indication identifiers.
- All other pairs fail closed with “Надійного порівняння немає”.
- The resolver does not derive clinical conclusions from product instructions or an LLM.
- The generator reads a CSV file only; it does not connect to or write any database.
`;
}
