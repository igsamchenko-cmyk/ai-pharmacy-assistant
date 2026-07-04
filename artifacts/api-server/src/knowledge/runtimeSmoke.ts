import {
  getKnowledgeRuntimeStatus,
  resolveRuntimeName,
  resolveRuntimeNameFromRows,
  type DbMappingRow,
  type RuntimeDbStore,
  type KnowledgeRuntimeStatus,
  type RuntimeResolveResult,
} from "./dbRuntime";
import {
  clearSearchCache,
  knowledgeSearch,
  type KnowledgeSearchResult,
} from "./search";

export const KNOWLEDGE_RUNTIME_SMOKE_MISSING_DATABASE_URL =
  "DATABASE_URL is required for real DB smoke test.";
export const DEFAULT_RUNTIME_SMOKE_SAMPLE = "Ібупрофен";

export interface RuntimeSmokeReport {
  ok: boolean;
  timestamp: string;
  sample: string;
  databaseUrlConfigured: boolean;
  status: KnowledgeRuntimeStatus;
  samples: {
    runtime: RuntimeResolveResult;
    search: KnowledgeSearchResult;
    staticFallback: RuntimeResolveResult;
  };
  checks: {
    schemaExists: boolean;
    approvedMappingsPresent: boolean;
    dbNormalizeWorks: boolean;
    dbSearchWorks: boolean;
    nonApprovedRowsIgnored: boolean;
    staticFallbackWorks: boolean;
    runtimeStatusDbAvailable: boolean;
  };
  warnings: string[];
}

export class RuntimeSmokeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeSmokeConfigurationError";
  }
}

export function validateRuntimeSmokeEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return env.DATABASE_URL ? [] : [KNOWLEDGE_RUNTIME_SMOKE_MISSING_DATABASE_URL];
}

export function shouldRunOptionalDbTests(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.RUN_DB_TESTS === "true" && Boolean(env.DATABASE_URL);
}

function smokeRow(
  reviewStatus: DbMappingRow["reviewStatus"],
  name: string,
): DbMappingRow {
  return {
    normalized: name.toLowerCase(),
    name,
    kind: "brand",
    ingredientInnKey: "smoke-inn",
    sourceKey: "who-inn",
    evidenceLevel: "reference",
    locale: "uk",
    confidence: "verified",
    confidenceScore: 100,
    reviewStatus,
    importBatchId: "smoke-batch",
    importedAt: new Date("2026-07-04T00:00:00.000Z"),
    inn: "Smoke INN",
    latin: "Smoke Latin",
    english: "Smoke English",
    atcCode: "A01AA01",
    groupName: "Smoke group",
    sourceLabel: "WHO INN",
    sourceType: "reference",
    sourceReliability: "high",
    sourceUrl: "https://example.test/source",
  };
}

export function nonApprovedRowsAreRuntimeHidden(): boolean {
  return (["pending", "rejected", "needs_review"] as const).every((status) => {
    const query = `Smoke ${status}`;
    return (
      resolveRuntimeNameFromRows(query, [smokeRow(status, query)]).source !==
      "db"
    );
  });
}

async function withEnv<T>(
  env: NodeJS.ProcessEnv,
  fn: () => Promise<T>,
): Promise<T> {
  const oldDatabaseUrl = process.env.DATABASE_URL;
  const oldRuntime = process.env.KNOWLEDGE_DB_RUNTIME;
  if (env.DATABASE_URL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = env.DATABASE_URL;
  }
  process.env.KNOWLEDGE_DB_RUNTIME = "true";
  try {
    return await fn();
  } finally {
    if (oldDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = oldDatabaseUrl;
    }
    if (oldRuntime === undefined) {
      delete process.env.KNOWLEDGE_DB_RUNTIME;
    } else {
      process.env.KNOWLEDGE_DB_RUNTIME = oldRuntime;
    }
  }
}

async function withStaticRuntime<T>(fn: () => Promise<T>): Promise<T> {
  const oldRuntime = process.env.KNOWLEDGE_DB_RUNTIME;
  process.env.KNOWLEDGE_DB_RUNTIME = "false";
  try {
    return await fn();
  } finally {
    if (oldRuntime === undefined) {
      delete process.env.KNOWLEDGE_DB_RUNTIME;
    } else {
      process.env.KNOWLEDGE_DB_RUNTIME = oldRuntime;
    }
  }
}

export async function runKnowledgeRuntimeSmoke(
  opts: {
    env?: NodeJS.ProcessEnv;
    sample?: string;
    store?: RuntimeDbStore;
  } = {},
): Promise<RuntimeSmokeReport> {
  const env = opts.env ?? process.env;
  const errors = validateRuntimeSmokeEnvironment(env);
  if (errors.length > 0) throw new RuntimeSmokeConfigurationError(errors[0]);

  const sample = opts.sample ?? DEFAULT_RUNTIME_SMOKE_SAMPLE;
  return withEnv(env, async () => {
    clearSearchCache();
    const status = await getKnowledgeRuntimeStatus(opts.store);
    const runtime = await resolveRuntimeName(sample, opts.store);
    clearSearchCache();
    const search = await knowledgeSearch(sample, {
      skipExternal: true,
      runtimeStore: opts.store,
    });
    const staticFallback = await withStaticRuntime(() =>
      resolveRuntimeName(sample),
    );

    const checks = {
      schemaExists: status.schemaReady && status.dbSchemaStatus === "ready",
      approvedMappingsPresent: status.approvedMappingsCount > 0,
      dbNormalizeWorks: runtime.source === "db" && runtime.entry !== null,
      dbSearchWorks: search.source === "db" && search.normalized !== null,
      nonApprovedRowsIgnored: nonApprovedRowsAreRuntimeHidden(),
      staticFallbackWorks:
        staticFallback.source === "static" && staticFallback.entry !== null,
      runtimeStatusDbAvailable:
        status.dbAvailable && status.providerStatus.db === "active",
    };
    const warnings = [...status.warnings, ...runtime.warnings];

    return {
      ok: Object.values(checks).every(Boolean),
      timestamp: new Date().toISOString(),
      sample,
      databaseUrlConfigured: true,
      status,
      samples: { runtime, search, staticFallback },
      checks,
      warnings: [...new Set(warnings)],
    };
  });
}
