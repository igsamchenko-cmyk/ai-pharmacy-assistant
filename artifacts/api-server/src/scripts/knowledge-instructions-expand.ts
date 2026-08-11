import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { resolveDataFilePath } from "../lib/dataPath";
import {
  downloadOfficialRegistrySnapshot,
  parseRegistryFile,
  parseRegistryText,
  type RegistryParseResult,
} from "../knowledge/ingestion";
import {
  getInstructionForProduct,
  loadInstructionManifest,
  loadInstructionSources,
} from "../knowledge/instructions/catalog";
import {
  buildInstructionExpansionPlan,
  DEFAULT_INSTRUCTION_EXPANSION_TARGET,
  type InstructionExpansionCandidate,
} from "../knowledge/instructions/expansion";
import {
  INSTRUCTION_SECTION_KEYS,
  InstructionManifestSchema,
  InstructionSourcesSchema,
  snapshotFileName,
  type DrugInstructionSnapshot,
  type InstructionManifest,
  type InstructionSources,
} from "../knowledge/instructions/model";
import { parseOfficialInstructionMht } from "../knowledge/instructions/parser";

const MAX_DOCUMENT_BYTES = 3_000_000;
const FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MINIMUM_SECTIONS = 8;

interface AcceptedCandidate {
  candidate: InstructionExpansionCandidate;
  snapshot: DrugInstructionSnapshot;
}

interface RejectedCandidate {
  registryProductId: string;
  registrationNumber: string;
  tradeName: string;
  reason: string;
}

interface ExpansionReport {
  version: "1.0-instruction-expansion";
  generatedAt: string;
  source: RegistryParseResult["snapshot"];
  policy: {
    targetCount: number;
    minimumSectionCount: number;
    concurrency: number;
    maximumAttempts: number;
    selection: "operational_search_then_distinct_inn_by_registry_breadth";
    exactProductBinding: true;
    existingSnapshotsRefreshed: false;
  };
  summary: {
    startingCount: number;
    retainedInCurrentRegistry: number;
    retainedOutsideCurrentRegistry: number;
    requiredNewCount: number;
    attemptedCount: number;
    acceptedNewCount: number;
    finalCount: number;
    rejectedCount: number;
    fullNewCount: number;
    partialNewCount: number;
    distinctNewInnCount: number;
  };
  rejectionReasons: Record<string, number>;
  accepted: Array<{
    registryProductId: string;
    registrationNumber: string;
    tradeName: string;
    inn: string;
    priorityReason: string;
    priorityQuery: string | null;
    status: string;
    availableSectionCount: number;
    coveragePct: number;
    documentHash: string;
  }>;
  rejected: RejectedCandidate[];
}

function argValue(prefix: string): string | null {
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    null
  );
}

function integerArgument(
  prefix: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = argValue(prefix);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error("instruction_expansion_argument_invalid");
  }
  return value;
}

function safeCode(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "download_timeout";
  }
  if (error instanceof Error && /^[a-z0-9:_-]{1,120}$/iu.test(error.message)) {
    return error.message;
  }
  return "instruction_candidate_failed";
}

async function downloadSource(url: string): Promise<{
  bytes: Buffer;
  lastModified: string | null;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`download_http_${response.status}`);
    }
    const announcedLength = Number(response.headers.get("content-length") ?? 0);
    if (announcedLength > MAX_DOCUMENT_BYTES) {
      throw new Error("document_size_invalid");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) {
      throw new Error("document_size_invalid");
    }
    return {
      bytes,
      lastModified: response.headers.get("last-modified"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function loadRegistry(file: string | null): Promise<RegistryParseResult> {
  if (file) return parseRegistryFile(resolve(file));
  const downloaded = await downloadOfficialRegistrySnapshot();
  return parseRegistryText(downloaded.text, {
    snapshot: downloaded.metadata,
  });
}

function updatedDataset(
  existing: InstructionSources["dataset"],
  registry: RegistryParseResult,
): InstructionSources["dataset"] {
  const snapshot = registry.snapshot;
  if (!snapshot?.sha256 || !snapshot.downloadedAt || !snapshot.sourceUrl) {
    throw new Error("instruction_expansion_fresh_registry_required");
  }
  return InstructionSourcesSchema.shape.dataset.parse({
    ...existing,
    registryUrl: snapshot.sourceUrl,
    registrySha256: snapshot.sha256,
    registryCheckedAt: snapshot.downloadedAt,
  });
}

async function evaluateCandidate(
  candidate: InstructionExpansionCandidate,
  dataset: InstructionSources["dataset"],
  checkedAt: Date,
  minimumSectionCount: number,
): Promise<
  | { ok: true; accepted: AcceptedCandidate }
  | { ok: false; rejected: RejectedCandidate }
> {
  try {
    const downloaded = await downloadSource(candidate.source.sourceUrl);
    const snapshot = parseOfficialInstructionMht(downloaded.bytes, {
      source: candidate.source,
      dataset,
      checkedAt,
      lastModified: downloaded.lastModified,
    });
    if (
      snapshot.status === "needs_review" ||
      snapshot.status === "unavailable" ||
      !snapshot.provenance.sourceAllowed ||
      !snapshot.provenance.registrationMatched ||
      !snapshot.provenance.contentLocationMatched
    ) {
      throw new Error("provenance_validation_failed");
    }
    if (snapshot.provenance.availableSectionCount < minimumSectionCount) {
      throw new Error("insufficient_section_coverage");
    }
    return { ok: true, accepted: { candidate, snapshot } };
  } catch (error) {
    return {
      ok: false,
      rejected: {
        registryProductId: candidate.source.registryProductId,
        registrationNumber: candidate.source.registrationNumber,
        tradeName: candidate.source.tradeName,
        reason: safeCode(error),
      },
    };
  }
}

async function downloadExpansion(
  candidates: readonly InstructionExpansionCandidate[],
  dataset: InstructionSources["dataset"],
  requiredCount: number,
  maximumAttempts: number,
  concurrency: number,
  minimumSectionCount: number,
  checkedAt: Date,
): Promise<{
  accepted: AcceptedCandidate[];
  rejected: RejectedCandidate[];
  attemptedCount: number;
}> {
  const accepted: AcceptedCandidate[] = [];
  const rejected: RejectedCandidate[] = [];
  let cursor = 0;
  while (
    accepted.length < requiredCount &&
    cursor < candidates.length &&
    cursor < maximumAttempts
  ) {
    const remainingAttempts = maximumAttempts - cursor;
    const batch = candidates.slice(
      cursor,
      cursor + Math.min(concurrency, remainingAttempts),
    );
    const results = await Promise.all(
      batch.map((candidate) =>
        evaluateCandidate(candidate, dataset, checkedAt, minimumSectionCount),
      ),
    );
    cursor += batch.length;
    for (const result of results) {
      if (result.ok) {
        if (accepted.length < requiredCount) accepted.push(result.accepted);
      } else {
        rejected.push(result.rejected);
      }
    }
  }
  return { accepted, rejected, attemptedCount: cursor };
}

function buildReport(
  registry: RegistryParseResult,
  plan: ReturnType<typeof buildInstructionExpansionPlan>,
  accepted: readonly AcceptedCandidate[],
  rejected: readonly RejectedCandidate[],
  attemptedCount: number,
  options: {
    checkedAt: Date;
    concurrency: number;
    maximumAttempts: number;
    minimumSectionCount: number;
  },
): ExpansionReport {
  const rejectionReasons: Record<string, number> = {};
  for (const item of rejected) {
    rejectionReasons[item.reason] = (rejectionReasons[item.reason] ?? 0) + 1;
  }
  return {
    version: "1.0-instruction-expansion",
    generatedAt: options.checkedAt.toISOString(),
    source: registry.snapshot,
    policy: {
      targetCount: plan.targetCount,
      minimumSectionCount: options.minimumSectionCount,
      concurrency: options.concurrency,
      maximumAttempts: options.maximumAttempts,
      selection: "operational_search_then_distinct_inn_by_registry_breadth",
      exactProductBinding: true,
      existingSnapshotsRefreshed: false,
    },
    summary: {
      startingCount: plan.retainedCount,
      retainedInCurrentRegistry: plan.retainedInCurrentRegistry,
      retainedOutsideCurrentRegistry: plan.retainedOutsideCurrentRegistry,
      requiredNewCount: plan.requiredAcceptedCount,
      attemptedCount,
      acceptedNewCount: accepted.length,
      finalCount: plan.retainedCount + accepted.length,
      rejectedCount: rejected.length,
      fullNewCount: accepted.filter(
        (item) => item.snapshot.status === "available",
      ).length,
      partialNewCount: accepted.filter(
        (item) => item.snapshot.status === "partial",
      ).length,
      distinctNewInnCount: new Set(
        accepted.map((item) => item.snapshot.inn.toLocaleLowerCase("uk-UA")),
      ).size,
    },
    rejectionReasons,
    accepted: accepted.map(({ candidate, snapshot }) => ({
      registryProductId: snapshot.registryProductId,
      registrationNumber: snapshot.registrationNumber,
      tradeName: snapshot.tradeName,
      inn: snapshot.inn,
      priorityReason: candidate.priorityReason,
      priorityQuery: candidate.priorityQuery,
      status: snapshot.status,
      availableSectionCount: snapshot.provenance.availableSectionCount,
      coveragePct: snapshot.provenance.coveragePct,
      documentHash: snapshot.source.documentHash,
    })),
    rejected: [...rejected],
  };
}

async function writeExpansion(
  existingSources: InstructionSources,
  existingManifest: InstructionManifest,
  dataset: InstructionSources["dataset"],
  accepted: readonly AcceptedCandidate[],
  report: ExpansionReport,
): Promise<void> {
  const sourcesPath = resolveDataFilePath(
    "data/drug-instructions/sources.json",
  );
  const dataDir = dirname(sourcesPath);
  const snapshotsDir = join(dataDir, "snapshots");
  await mkdir(snapshotsDir, { recursive: true });

  const sources = InstructionSourcesSchema.parse({
    version: "1.0",
    dataset,
    products: [
      ...existingSources.products,
      ...accepted.map((item) => item.candidate.source),
    ],
  });
  const manifest = InstructionManifestSchema.parse({
    version: "1.0",
    generatedAt: report.generatedAt,
    dataset,
    products: [
      ...existingManifest.products,
      ...accepted.map(({ snapshot }) => ({
        registryProductId: snapshot.registryProductId,
        registrationNumber: snapshot.registrationNumber,
        tradeName: snapshot.tradeName,
        status: snapshot.status,
        documentHash: snapshot.source.documentHash,
        documentDate: snapshot.source.documentDate,
        snapshotFile: `snapshots/${snapshotFileName(snapshot.registrationNumber)}`,
        availableSections: INSTRUCTION_SECTION_KEYS.filter(
          (key) => snapshot.sections[key] !== null,
        ),
      })),
    ],
  });

  for (const { snapshot } of accepted) {
    await writeFile(
      join(snapshotsDir, snapshotFileName(snapshot.registrationNumber)),
      `${JSON.stringify(snapshot, null, 2)}\n`,
      "utf8",
    );
  }
  await writeFile(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`, "utf8");
  await writeFile(
    join(dataDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(dataDir, "expansion-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
}

async function main(): Promise<void> {
  const download = process.argv.includes("--download");
  const write = process.argv.includes("--write");
  const file = argValue("--file=");
  if (write && !download)
    throw new Error("instruction_write_requires_download");
  if (write && file) {
    throw new Error("instruction_write_requires_fresh_registry");
  }

  const existingSources = loadInstructionSources();
  const existingManifest = loadInstructionManifest();
  if (existingSources.products.length !== existingManifest.products.length) {
    throw new Error("instruction_existing_sources_manifest_mismatch");
  }
  for (const product of existingManifest.products) {
    if (!getInstructionForProduct(product.registryProductId)) {
      throw new Error("instruction_existing_snapshot_missing");
    }
  }

  const targetCount = integerArgument(
    "--target=",
    DEFAULT_INSTRUCTION_EXPANSION_TARGET,
    existingSources.products.length,
    2_500,
  );
  const concurrency = integerArgument(
    "--concurrency=",
    DEFAULT_CONCURRENCY,
    1,
    8,
  );
  const minimumSectionCount = integerArgument(
    "--min-sections=",
    DEFAULT_MINIMUM_SECTIONS,
    1,
    INSTRUCTION_SECTION_KEYS.length,
  );
  const registry = await loadRegistry(file);
  if (registry.parseErrors.length) {
    throw new Error("instruction_registry_parse_failed");
  }
  const plan = buildInstructionExpansionPlan(
    registry.rows,
    existingSources.products,
    targetCount,
  );
  const defaultMaximumAttempts = Math.min(
    plan.candidates.length,
    Math.max(plan.requiredAcceptedCount * 3, plan.requiredAcceptedCount + 50),
  );
  const maximumAttempts = integerArgument(
    "--max-attempts=",
    defaultMaximumAttempts,
    Math.max(plan.requiredAcceptedCount, 1),
    Math.max(plan.candidates.length, 1),
  );

  if (!download) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "preview",
          source: registry.snapshot,
          targetCount: plan.targetCount,
          retainedCount: plan.retainedCount,
          retainedInCurrentRegistry: plan.retainedInCurrentRegistry,
          retainedOutsideCurrentRegistry: plan.retainedOutsideCurrentRegistry,
          requiredAcceptedCount: plan.requiredAcceptedCount,
          eligibleCandidateCount: plan.eligibleCandidateCount,
          eligibleDistinctInnCount: plan.eligibleDistinctInnCount,
          rejectedNonStructuredSourceCount:
            plan.rejectedNonStructuredSourceCount,
          rejectedInvalidMetadataCount: plan.rejectedInvalidMetadataCount,
          rejectedNonSpecificInnCount: plan.rejectedNonSpecificInnCount,
          invalidMetadataFieldCounts: plan.invalidMetadataFieldCounts,
          maximumAttempts,
          candidateSample: plan.candidates.slice(0, 20).map((candidate) => ({
            registryProductId: candidate.source.registryProductId,
            registrationNumber: candidate.source.registrationNumber,
            tradeName: candidate.source.tradeName,
            inn: candidate.source.inn,
            strength: candidate.source.strength,
            priorityReason: candidate.priorityReason,
            priorityQuery: candidate.priorityQuery,
            registryInnPositionCount: candidate.registryInnPositionCount,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  const checkedAt = new Date();
  const dataset = updatedDataset(existingSources.dataset, registry);
  const result = await downloadExpansion(
    plan.candidates,
    dataset,
    plan.requiredAcceptedCount,
    maximumAttempts,
    concurrency,
    minimumSectionCount,
    checkedAt,
  );
  const report = buildReport(
    registry,
    plan,
    result.accepted,
    result.rejected,
    result.attemptedCount,
    { checkedAt, concurrency, maximumAttempts, minimumSectionCount },
  );
  const complete = result.accepted.length === plan.requiredAcceptedCount;
  if (write && complete) {
    await writeExpansion(
      existingSources,
      existingManifest,
      dataset,
      result.accepted,
      report,
    );
  }
  console.log(
    JSON.stringify(
      {
        ok: complete,
        mode: write ? "download-and-write" : "download-preview",
        ...report.summary,
        rejectionReasons: report.rejectionReasons,
        reportWritten: write && complete,
      },
      null,
      2,
    ),
  );
  if (!complete) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, error: safeCode(error) }));
  process.exitCode = 1;
});
