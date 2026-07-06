import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Request } from "express";
import { buildAuthDiagnostics, type AuthDiagnostics } from "./auth";
import { hasGeminiKey, hasOpenAiKey, isOpenAiEnabled } from "./lib/aiProvider";
import { buildStaticBackfillSnapshot, backfillCounts } from "./knowledge/backfill";
import { buildDictionaryBatchSummary } from "./knowledge/import/batches";
import { getKnowledgeEngineStats } from "./knowledge";
import { getKnowledgeRuntimeStatus } from "./knowledge/dbRuntime";

export interface DiagnosticsReportStatus {
  exists: boolean;
  updatedAt: string | null;
}

export interface DiagnosticsPanelData {
  app: {
    name: "FarmAssist";
    releaseLabel: string;
    version: string;
  };
  runtime: {
    mode: "static" | "db";
    dbConfigured: boolean;
    dbRuntimeRequested: boolean;
    dbSchemaStatus: string;
    dbProvider: string;
    staticFallbackEnabled: boolean;
  };
  auth: AuthDiagnostics;
  providers: {
    geminiConfigured: boolean;
    openAiConfigured: boolean;
    openAiEnabled: boolean;
  };
  knowledge: {
    dictionaryBatchCount: number;
    mappingsCount: number;
    ingredientsCount: number;
    interactionRulesCount: number;
    approvedDbMappingsCount: number;
  };
  reports: {
    quality: DiagnosticsReportStatus;
    searchQuality: DiagnosticsReportStatus;
    readiness: DiagnosticsReportStatus;
  };
  references: {
    scenarioDocs: string;
    checklistDocs: string;
  };
  warnings: string[];
}

const REPORT_PATHS = {
  quality: fileURLToPath(
    new URL("../../../artifacts/reports/knowledge-quality-report.json", import.meta.url),
  ),
  searchQuality: fileURLToPath(
    new URL("../../../artifacts/reports/search-quality-report.json", import.meta.url),
  ),
  readiness: fileURLToPath(
    new URL("../../../artifacts/reports/beta-readiness-report.json", import.meta.url),
  ),
};

async function reportStatus(path: string): Promise<DiagnosticsReportStatus> {
  try {
    const info = await stat(path);
    return {
      exists: true,
      updatedAt: info.mtime.toISOString(),
    };
  } catch {
    return { exists: false, updatedAt: null };
  }
}

export async function buildDiagnosticsPanelData(
  env: NodeJS.ProcessEnv = process.env,
  req: Request | null = null,
): Promise<DiagnosticsPanelData> {
  const runtime = await getKnowledgeRuntimeStatus();
  const stats = getKnowledgeEngineStats();
  const batches = buildDictionaryBatchSummary();
  const snapshotCounts = backfillCounts(buildStaticBackfillSnapshot());

  return {
    app: {
      name: "FarmAssist",
      releaseLabel: env.APP_RELEASE_LABEL ?? "v1.0 closed beta readiness",
      version: env.npm_package_version ?? "0.0.0",
    },
    runtime: {
      mode: runtime.runtimeMode,
      dbConfigured: runtime.databaseUrlConfigured,
      dbRuntimeRequested: runtime.dbRuntimeRequested,
      dbSchemaStatus: runtime.dbSchemaStatus,
      dbProvider: runtime.providerStatus.db,
      staticFallbackEnabled: runtime.staticFallbackEnabled,
    },
    auth: buildAuthDiagnostics(req, env),
    providers: {
      geminiConfigured: hasGeminiKey(env),
      openAiConfigured: hasOpenAiKey(env),
      openAiEnabled: isOpenAiEnabled(env) && hasOpenAiKey(env),
    },
    knowledge: {
      dictionaryBatchCount: batches.files,
      mappingsCount: snapshotCounts.names,
      ingredientsCount: snapshotCounts.ingredients,
      interactionRulesCount: stats.interactionRules,
      approvedDbMappingsCount: runtime.approvedMappingsCount,
    },
    reports: {
      quality: await reportStatus(REPORT_PATHS.quality),
      searchQuality: await reportStatus(REPORT_PATHS.searchQuality),
      readiness: await reportStatus(REPORT_PATHS.readiness),
    },
    references: {
      scenarioDocs: "docs/TEST_SCENARIOS.md",
      checklistDocs: "docs/CLOSED_BETA_CHECKLIST.md",
    },
    warnings: runtime.warnings,
  };
}

