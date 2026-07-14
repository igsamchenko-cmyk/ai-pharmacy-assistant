import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveDataFilePath } from "../lib/dataPath";
import {
  getInstructionForProduct,
  loadInstructionManifest,
  loadInstructionSources,
} from "../knowledge/instructions/catalog";
import {
  INSTRUCTION_SECTION_KEYS,
  InstructionManifestSchema,
  snapshotFileName,
  type DrugInstructionSnapshot,
} from "../knowledge/instructions/model";
import { parseOfficialInstructionMht } from "../knowledge/instructions/parser";

const MAX_DOCUMENT_BYTES = 3_000_000;
const FETCH_TIMEOUT_MS = 30_000;

async function downloadSource(url: string): Promise<{
  bytes: Buffer;
  lastModified: string | null;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`instruction_download_http_${response.status}`);
    const announcedLength = Number(response.headers.get("content-length") ?? 0);
    if (announcedLength > MAX_DOCUMENT_BYTES) {
      throw new Error("instruction_document_size_invalid");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) {
      throw new Error("instruction_document_size_invalid");
    }
    return {
      bytes,
      lastModified: response.headers.get("last-modified"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshSnapshots(): Promise<DrugInstructionSnapshot[]> {
  const sources = loadInstructionSources();
  const checkedAt = new Date();
  const snapshots: DrugInstructionSnapshot[] = [];
  for (const source of sources.products) {
    const downloaded = await downloadSource(source.sourceUrl);
    const snapshot = parseOfficialInstructionMht(downloaded.bytes, {
      source,
      dataset: sources.dataset,
      checkedAt,
      lastModified: downloaded.lastModified,
    });
    if (snapshot.status === "needs_review" || snapshot.status === "unavailable") {
      throw new Error(`instruction_refresh_blocked:${source.registrationNumber}`);
    }
    snapshots.push(snapshot);
  }
  return snapshots;
}

async function writeSnapshots(snapshots: DrugInstructionSnapshot[]): Promise<void> {
  const sources = loadInstructionSources();
  const sourcesPath = resolveDataFilePath("data/drug-instructions/sources.json");
  const dataDir = dirname(sourcesPath);
  const snapshotsDir = join(dataDir, "snapshots");
  await mkdir(snapshotsDir, { recursive: true });

  for (const snapshot of snapshots) {
    await writeFile(
      join(snapshotsDir, snapshotFileName(snapshot.registrationNumber)),
      `${JSON.stringify(snapshot, null, 2)}\n`,
      "utf8",
    );
  }

  const manifest = InstructionManifestSchema.parse({
    version: "1.0",
    generatedAt: snapshots[0]?.source.checkedAt ?? new Date().toISOString(),
    dataset: sources.dataset,
    products: snapshots.map((snapshot) => ({
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
  });
  await writeFile(
    join(dataDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

function reportFromCommittedSnapshots() {
  const manifest = loadInstructionManifest();
  const snapshots = manifest.products.map((product) => {
    const snapshot = getInstructionForProduct(product.registryProductId);
    if (!snapshot) throw new Error("instruction_snapshot_missing");
    return snapshot;
  });
  const statuses = Object.fromEntries(
    ["available", "partial", "unavailable", "needs_review"].map((status) => [
      status,
      snapshots.filter((snapshot) => snapshot.status === status).length,
    ]),
  );
  const blockers = snapshots.filter((snapshot) =>
    snapshot.status === "needs_review" || snapshot.status === "unavailable"
  ).length;
  return {
    ok: snapshots.length >= 5 &&
      snapshots.every((snapshot) =>
        snapshot.provenance.sourceAllowed &&
        snapshot.provenance.registrationMatched &&
        snapshot.provenance.contentLocationMatched
      ),
    products: snapshots.length,
    source: {
      title: manifest.dataset.title,
      url: manifest.dataset.url,
      license: manifest.dataset.license,
      registrySha256: manifest.dataset.registrySha256,
      registryCheckedAt: manifest.dataset.registryCheckedAt,
    },
    parserVersions: [...new Set(snapshots.map((snapshot) => snapshot.source.parserVersion))],
    statuses,
    fullInstructions: snapshots.filter((snapshot) => snapshot.status === "available").length,
    partialInstructions: snapshots.filter((snapshot) => snapshot.status === "partial").length,
    provenanceCoveragePct: Math.round(
      snapshots.filter((snapshot) => snapshot.provenance.registrationMatched).length /
        Math.max(snapshots.length, 1) * 100,
    ),
    blockers,
    sections: Object.fromEntries(INSTRUCTION_SECTION_KEYS.map((key) => [
      key,
      snapshots.filter((snapshot) => snapshot.sections[key]).length,
    ])),
    registrations: snapshots.map((snapshot) => ({
      registrationNumber: snapshot.registrationNumber,
      tradeName: snapshot.tradeName,
      status: snapshot.status,
      coveragePct: snapshot.provenance.coveragePct,
      documentHash: snapshot.source.documentHash,
    })),
  };
}

async function main(): Promise<void> {
  const refresh = process.argv.includes("--download");
  const write = process.argv.includes("--write");
  if (write && !refresh) throw new Error("instruction_write_requires_download");
  if (refresh) {
    const snapshots = await refreshSnapshots();
    if (write) await writeSnapshots(snapshots);
    console.log(JSON.stringify({
      ok: snapshots.length >= 5,
      mode: write ? "download-and-write" : "download-preview",
      products: snapshots.length,
      fullInstructions: snapshots.filter((snapshot) => snapshot.status === "available").length,
      partialInstructions: snapshots.filter((snapshot) => snapshot.status === "partial").length,
      blockers: snapshots.filter((snapshot) =>
        snapshot.status === "needs_review" || snapshot.status === "unavailable"
      ).length,
    }, null, 2));
    return;
  }
  const report = reportFromCommittedSnapshots();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const code = error instanceof Error && /^[a-z0-9:_-]+$/iu.test(error.message)
    ? error.message
    : "instruction_report_failed";
  console.error(JSON.stringify({ ok: false, error: code }));
  process.exitCode = 1;
});
