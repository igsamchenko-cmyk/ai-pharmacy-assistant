import type { RegistryParseResult } from "../ingestion";
import type { InstructionManifest } from "./model";
import { resolveOfficialInstructionSource } from "./source";

export type InstructionCoverageReason =
  | "official_source_pending_structuring"
  | "official_document_only"
  | "official_source_not_published"
  | "official_source_url_rejected";

export interface InstructionCoverageGap {
  registryProductId: string;
  registrationNumber: string;
  tradeName: string;
  reason: InstructionCoverageReason;
}

export interface OfficialInstructionCoverageReport {
  schemaVersion: "official-instruction-coverage-v1";
  source: RegistryParseResult["snapshot"];
  counts: {
    officialProducts: number;
    structuredSnapshots: number;
    officialSourceDocuments: number;
    pendingStructuring: number;
    officialDocumentOnly: number;
    notPublishedByDrlz: number;
    rejectedSourceUrls: number;
    accountedProducts: number;
  };
  coverage: {
    structuredPct: number;
    officialSourcePotentialPct: number;
    exactProductMatching: true;
    registrationFallbackUsed: false;
    allProductsAccountedFor: boolean;
  };
  rejectedSourceUrlSamples: string[];
  gaps: InstructionCoverageGap[];
}

function exactKey(
  registryProductId: string,
  registrationNumber: string,
): string {
  return `${registryProductId}\u0000${registrationNumber}`;
}

function percentage(numerator: number, denominator: number): number {
  return Math.round((numerator / Math.max(denominator, 1)) * 10_000) / 100;
}

export function buildOfficialInstructionCoverageReport(
  registry: RegistryParseResult,
  manifest: InstructionManifest,
): OfficialInstructionCoverageReport {
  const structuredKeys = new Set(
    manifest.products
      .filter(
        (product) =>
          product.status === "available" || product.status === "partial",
      )
      .map((product) =>
        exactKey(product.registryProductId, product.registrationNumber),
      ),
  );
  let structuredSnapshots = 0;
  let officialSourceDocuments = 0;
  let pendingStructuring = 0;
  let officialDocumentOnly = 0;
  let notPublishedByDrlz = 0;
  let rejectedSourceUrls = 0;
  const rejectedSourceUrlSamples: string[] = [];
  const gaps: InstructionCoverageGap[] = [];

  for (const row of registry.rows) {
    const key = exactKey(row.registryId, row.registrationNumber);
    const structured = structuredKeys.has(key);
    const source = resolveOfficialInstructionSource(
      row.instructionUrl,
      row.registrationNumber,
      structured,
    );
    if (structured) structuredSnapshots += 1;
    if (source.documentUrl) officialSourceDocuments += 1;
    if (structured) continue;

    if (source.status === "structured") {
      pendingStructuring += 1;
      gaps.push({
        registryProductId: row.registryId,
        registrationNumber: row.registrationNumber,
        tradeName: row.tradeName,
        reason: "official_source_pending_structuring",
      });
    } else if (source.status === "official_document") {
      officialDocumentOnly += 1;
      gaps.push({
        registryProductId: row.registryId,
        registrationNumber: row.registrationNumber,
        tradeName: row.tradeName,
        reason: "official_document_only",
      });
    } else if (source.status === "invalid_source") {
      rejectedSourceUrls += 1;
      if (rejectedSourceUrlSamples.length < 10) {
        rejectedSourceUrlSamples.push(row.instructionUrl.slice(0, 1_000));
      }
      gaps.push({
        registryProductId: row.registryId,
        registrationNumber: row.registrationNumber,
        tradeName: row.tradeName,
        reason: "official_source_url_rejected",
      });
    } else {
      notPublishedByDrlz += 1;
      gaps.push({
        registryProductId: row.registryId,
        registrationNumber: row.registrationNumber,
        tradeName: row.tradeName,
        reason: "official_source_not_published",
      });
    }
  }

  const officialProducts = registry.rows.length;
  const accountedProducts =
    structuredSnapshots +
    pendingStructuring +
    officialDocumentOnly +
    notPublishedByDrlz +
    rejectedSourceUrls;
  return {
    schemaVersion: "official-instruction-coverage-v1",
    source: registry.snapshot,
    counts: {
      officialProducts,
      structuredSnapshots,
      officialSourceDocuments,
      pendingStructuring,
      officialDocumentOnly,
      notPublishedByDrlz,
      rejectedSourceUrls,
      accountedProducts,
    },
    coverage: {
      structuredPct: percentage(structuredSnapshots, officialProducts),
      officialSourcePotentialPct: percentage(
        officialSourceDocuments,
        officialProducts,
      ),
      exactProductMatching: true,
      registrationFallbackUsed: false,
      allProductsAccountedFor: accountedProducts === officialProducts,
    },
    rejectedSourceUrlSamples,
    gaps,
  };
}
