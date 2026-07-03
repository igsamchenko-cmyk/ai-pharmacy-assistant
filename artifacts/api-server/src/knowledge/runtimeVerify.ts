import {
  getKnowledgeRuntimeStatus,
  resolveRuntimeName,
  resolveRuntimeNameFromRows,
  type DbMappingRow,
  type KnowledgeRuntimeStatus,
  type RuntimeResolveResult,
} from "./dbRuntime";
import { buildStaticBackfillSnapshot } from "./backfill";

export interface RuntimeVerificationReport {
  ok: boolean;
  timestamp: string;
  databaseUrlConfigured: boolean;
  strict: boolean;
  status: KnowledgeRuntimeStatus;
  samples: {
    dbMock: RuntimeResolveResult;
    runtime: RuntimeResolveResult;
  };
  checks: Record<string, boolean>;
  warnings: string[];
}

export function snapshotToRuntimeRows(): DbMappingRow[] {
  const snapshot = buildStaticBackfillSnapshot();
  const ingredients = new Map(
    snapshot.ingredients.map((ingredient) => [ingredient.innKey, ingredient]),
  );
  const sources = new Map(snapshot.sources.map((source) => [source.key, source]));

  return snapshot.names.flatMap((name): DbMappingRow[] => {
    const ingredient = ingredients.get(name.ingredientInnKey);
    if (!ingredient) return [];
    const source = sources.get(name.sourceKey);
    return [
      {
        normalized: name.normalized,
        name: name.name,
        kind: name.kind,
        ingredientInnKey: name.ingredientInnKey,
        sourceKey: name.sourceKey,
        evidenceLevel: name.evidenceLevel ?? "reference",
        locale: name.locale ?? "uk",
        confidence: name.confidence ?? "verified",
        confidenceScore: name.confidenceScore ?? 100,
        reviewStatus: name.reviewStatus ?? "approved",
        importBatchId: name.importBatchId ?? null,
        importedAt: new Date(),
        inn: ingredient.inn,
        latin: ingredient.latin ?? "",
        english: ingredient.english ?? "",
        atcCode: ingredient.atcCode ?? null,
        groupName: ingredient.groupName ?? "",
        sourceLabel: source?.label ?? null,
        sourceType: source?.type ?? null,
        sourceReliability: source?.reliability ?? null,
        sourceUrl: source?.url ?? null,
      },
    ];
  });
}

export async function verifyKnowledgeRuntime(
  opts: { strict?: boolean; sample?: string } = {},
): Promise<RuntimeVerificationReport> {
  const sample = opts.sample ?? "Ibuprofen";
  const warnings: string[] = [];
  const databaseUrlConfigured = Boolean(process.env.DATABASE_URL);
  const status = await getKnowledgeRuntimeStatus();
  const dbMock = resolveRuntimeNameFromRows(sample, snapshotToRuntimeRows());
  const runtime = await resolveRuntimeName(sample);

  if (!databaseUrlConfigured) {
    warnings.push(
      "DATABASE_URL is not configured; DB checks were limited to static snapshot simulation.",
    );
  }
  warnings.push(...status.warnings, ...runtime.warnings);

  const checks = {
    schemaReachable: databaseUrlConfigured ? status.dbAvailable : true,
    approvedRowsVisible: databaseUrlConfigured
      ? status.approvedMappingsCount > 0 || !status.dbEnabled
      : true,
    dbMockNormalizeWorks: dbMock.source === "db" && dbMock.entry !== null,
    runtimeLookupWorks: runtime.entry !== null,
    staticFallbackAvailable: status.staticFallbackEnabled,
    statusCountsNonNegative:
      status.approvedMappingsCount >= 0 &&
      status.pendingCount >= 0 &&
      status.rejectedCount >= 0 &&
      status.needsReviewCount >= 0,
  };

  const hardFailure = opts.strict
    ? Object.values(checks).some((check) => !check)
    : !checks.dbMockNormalizeWorks ||
      !checks.runtimeLookupWorks ||
      !checks.staticFallbackAvailable ||
      !checks.statusCountsNonNegative;

  return {
    ok: !hardFailure,
    timestamp: new Date().toISOString(),
    databaseUrlConfigured,
    strict: opts.strict === true,
    status,
    samples: { dbMock, runtime },
    checks,
    warnings: [...new Set(warnings)],
  };
}

