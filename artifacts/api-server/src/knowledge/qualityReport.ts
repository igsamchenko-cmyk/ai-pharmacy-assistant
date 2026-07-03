import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { validateKnowledge } from "./validation";
import { buildStaticBackfillSnapshot, backfillCounts } from "./backfill";
import { getKnowledgeRuntimeStatus } from "./dbRuntime";

export interface KnowledgeQualityJsonReport {
  version: "0.6";
  timestamp: string;
  counts: ReturnType<typeof backfillCounts>;
  coverage: {
    mappingProvenancePct: number;
    atcCoveragePct: number;
    sourceCoveragePct: number;
    approvedMappingPct: number;
  };
  runtime: Awaited<ReturnType<typeof getKnowledgeRuntimeStatus>>;
  warnings: string[];
  validation: ReturnType<typeof validateKnowledge>;
}

function pct(part: number, total: number): number {
  return total === 0 ? 100 : Math.round((part / total) * 100);
}

export async function buildKnowledgeQualityJsonReport(): Promise<KnowledgeQualityJsonReport> {
  const validation = validateKnowledge();
  const snapshot = buildStaticBackfillSnapshot();
  const counts = backfillCounts(snapshot);
  const runtime = await getKnowledgeRuntimeStatus();
  const namesWithProvenance = snapshot.names.filter(
    (name) => name.sourceKey && name.evidenceLevel,
  ).length;
  const ingredientsWithAtc = snapshot.ingredients.filter(
    (ingredient) => ingredient.atcCode,
  ).length;
  const sourceKeys = new Set(snapshot.sources.map((source) => source.key));
  const rowsWithKnownSource = [
    ...snapshot.names.map((row) => row.sourceKey),
    ...snapshot.ingredients.map((row) => row.sourceKey),
    ...snapshot.atcCodes.map((row) => row.sourceKey),
    ...snapshot.interactionRules.map((row) => row.sourceKey),
  ].filter((key) => sourceKeys.has(key)).length;
  const rowsWithSource =
    snapshot.names.length +
    snapshot.ingredients.length +
    snapshot.atcCodes.length +
    snapshot.interactionRules.length;
  const approvedMappings = snapshot.names.filter(
    (name) => name.reviewStatus === "approved",
  ).length;

  return {
    version: "0.6",
    timestamp: new Date().toISOString(),
    counts,
    coverage: {
      mappingProvenancePct: pct(namesWithProvenance, snapshot.names.length),
      atcCoveragePct: pct(ingredientsWithAtc, snapshot.ingredients.length),
      sourceCoveragePct: pct(rowsWithKnownSource, rowsWithSource),
      approvedMappingPct: pct(approvedMappings, snapshot.names.length),
    },
    runtime,
    warnings: [...validation.warnings.map((warning) => warning.message), ...runtime.warnings],
    validation,
  };
}

export async function writeKnowledgeQualityJsonReport(path: string): Promise<void> {
  const report = await buildKnowledgeQualityJsonReport();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2), "utf8");
}

