import { readFileSync } from "node:fs";
import { resolveDataFilePath } from "../../lib/dataPath";
import { TtlCache } from "../../lib/cache";
import {
  DrugInstructionSnapshotSchema,
  InstructionManifestSchema,
  InstructionSourcesSchema,
  type DrugInstructionSnapshot,
  type InstructionManifest,
  type InstructionSources,
} from "./model";
import { withAdministrationFacts } from "./parser";

const manifestCache = new TtlCache<InstructionManifest>({
  ttlMs: 5 * 60_000,
  maxEntries: 1,
});
const snapshotCache = new TtlCache<DrugInstructionSnapshot>({
  ttlMs: 6 * 60 * 60_000,
  maxEntries: 30,
});

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolveDataFilePath(path), "utf8")) as unknown;
}

export function loadInstructionSources(): InstructionSources {
  return InstructionSourcesSchema.parse(
    readJson("data/drug-instructions/sources.json"),
  );
}

export function loadInstructionManifest(): InstructionManifest {
  const cached = manifestCache.get("manifest");
  if (cached) return cached;
  const manifest = InstructionManifestSchema.parse(
    readJson("data/drug-instructions/manifest.json"),
  );
  manifestCache.set("manifest", manifest);
  return manifest;
}

export function hasInstructionForProduct(
  registryProductId: string,
  registrationNumber: string,
): boolean {
  try {
    return loadInstructionManifest().products.some(
      (product) =>
        product.registryProductId === registryProductId &&
        product.registrationNumber === registrationNumber &&
        (product.status === "available" || product.status === "partial"),
    );
  } catch {
    return false;
  }
}

export function getInstructionForProduct(
  registryProductId: string,
): DrugInstructionSnapshot | null {
  const manifest = loadInstructionManifest();
  const entry = manifest.products.find(
    (product) => product.registryProductId === registryProductId,
  );
  if (!entry || (entry.status !== "available" && entry.status !== "partial")) {
    return null;
  }
  const cacheKey = `${entry.registrationNumber}:${entry.documentHash}`;
  const cached = snapshotCache.get(cacheKey);
  if (cached) return cached;

  const snapshot = withAdministrationFacts(
    DrugInstructionSnapshotSchema.parse(
      readJson(`data/drug-instructions/${entry.snapshotFile}`),
    ),
  );
  if (
    snapshot.registryProductId !== entry.registryProductId ||
    snapshot.registrationNumber !== entry.registrationNumber ||
    snapshot.source.documentHash !== entry.documentHash
  ) {
    throw new Error("instruction_snapshot_manifest_mismatch");
  }
  snapshotCache.set(cacheKey, snapshot);
  return snapshot;
}

export function clearInstructionCatalogCaches(): void {
  manifestCache.clear();
  snapshotCache.clear();
}
