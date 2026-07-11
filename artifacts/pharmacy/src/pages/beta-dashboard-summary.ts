import type { BetaDashboardStatus } from "@workspace/api-client-react";

export const EXTERNAL_PROVIDER_NOTICE =
  "\u0417\u043e\u0432\u043d\u0456\u0448\u043d\u0456 \u043f\u0440\u043e\u0432\u0430\u0439\u0434\u0435\u0440\u0438 \u043d\u0435 \u043f\u0435\u0440\u0435\u0432\u0456\u0440\u044f\u043b\u0438\u0441\u044c \u0443 \u0446\u044c\u043e\u043c\u0443 \u0442\u0435\u0441\u0442\u0456; production DB \u043f\u0440\u0430\u0446\u044e\u0454.";

export interface DashboardProductionSummary {
  release: string;
  runtime: string;
  products: number;
  approvedMappings: number;
  registrations: number;
  databaseReady: boolean;
  blockers: string[];
  reportNotices: string[];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isProviderOrFallbackWarning(warning: string): boolean {
  const value = warning.toLowerCase();
  return (
    value.includes("external provider") ||
    value.includes("static fallback") ||
    value.includes("local fallback") ||
    value.includes("local/static")
  );
}

export function buildDashboardProductionSummary(
  status: BetaDashboardStatus,
): DashboardProductionSummary {
  const databaseReady =
    status.runtime.mode === "db" &&
    status.runtime.dbConfigured &&
    status.runtime.dbAvailable;
  const blockers: string[] = [];

  if (!status.readiness.ready) {
    blockers.push("Private beta readiness requires review.");
  }
  if (!databaseReady) {
    blockers.push("Production PostgreSQL runtime is unavailable or not ready.");
  }
  if (!status.dataQuality.ok) {
    blockers.push("Data quality verification found a problem.");
  }
  if (status.scenarios.failed > 0) {
    blockers.push("Not all beta scenarios passed.");
  }

  const warnings = unique([
    ...status.readiness.warnings,
    ...status.scenarios.warnings,
    ...status.searchQuality.warnings,
    ...status.realWorld.warnings,
    ...status.ingestion.warnings,
    ...status.dataQuality.warnings,
    ...status.runtime.warnings,
    ...status.reviewQueue.warnings,
    ...status.diagnostics.warnings,
  ]);
  const providerNotice = databaseReady && warnings.some(isProviderOrFallbackWarning);

  return {
    release: status.diagnostics.version,
    runtime: databaseReady ? "PostgreSQL" : "Static fallback",
    products: status.ingestion.registryProducts,
    approvedMappings: status.reviewQueue.approved,
    registrations: status.ingestion.registryRegistrations,
    databaseReady,
    blockers,
    reportNotices: unique([
      ...(providerNotice ? [EXTERNAL_PROVIDER_NOTICE] : []),
      ...warnings.filter((warning) => !isProviderOrFallbackWarning(warning)),
    ]),
  };
}
