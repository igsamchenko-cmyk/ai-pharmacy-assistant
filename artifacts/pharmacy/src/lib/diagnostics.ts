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
    quality: { path: string; exists: boolean; updatedAt: string | null };
    searchQuality: { path: string; exists: boolean; updatedAt: string | null };
    readiness: { path: string; exists: boolean; updatedAt: string | null };
  };
  references: {
    scenarioDocs: string;
    checklistDocs: string;
  };
  warnings: string[];
}

export async function fetchDiagnostics(): Promise<DiagnosticsPanelData> {
  const response = await fetch("/api/diagnostics", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Diagnostics request failed: ${response.status}`);
  }
  return (await response.json()) as DiagnosticsPanelData;
}

