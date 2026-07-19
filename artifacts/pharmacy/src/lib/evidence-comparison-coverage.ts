import { EVIDENCE_REGISTRY } from "./evidence-comparisons";

export interface EvidenceComparisonCoverageReport {
  schemaVersion: "evidence-comparison-coverage-v1";
  generatedAt: string;
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

export function buildEvidenceComparisonCoverageReport(): EvidenceComparisonCoverageReport {
  const normalizedInnExpressions = 1_638;
  const verifiedInnPairs = new Set(
    EVIDENCE_REGISTRY.map((record) =>
      record.comparators
        .map((comparator) => comparator.exactInnAliases[0])
        .sort()
        .join("::"),
    ),
  ).size;
  const potentialInnPairs = potentialUnorderedPairs(normalizedInnExpressions);

  return {
    schemaVersion: "evidence-comparison-coverage-v1",
    generatedAt: "2026-07-19T13:08:20.545Z",
    officialRegistry: {
      sourceSha256:
        "228b8a201491de53d85788d398143586cd20fcd461731892d5db4ab2d8f4dd96",
      validRows: 16_533,
      invalidRows: 0,
      rowsWithValidAtc: 11_770,
    },
    counts: {
      normalizedInnExpressions,
      therapeuticClasses: 545,
      potentialInnPairs,
      verifiedEvidenceRecords: EVIDENCE_REGISTRY.length,
      verifiedInnPairs,
      insufficientEvidencePairs: potentialInnPairs - verifiedInnPairs,
    },
  };
}

export const EVIDENCE_COMPARISON_COVERAGE =
  buildEvidenceComparisonCoverageReport();
