const EXPECTED_WORKFLOW = "Official registry parity and gated sync";
const EXPECTED_REPOSITORY = "igsamchenko-cmyk/ai-pharmacy-assistant";
const EXPECTED_PURPOSE = "post-apply-registry-search-smoke";
const EXPECTED_PROFILE_PURPOSE = "production-registry-search-profile";
const EXPECTED_ENVIRONMENT = "production-registry-sync";
const EXPECTED_APP_NAME = "farmassist-registry-production-search-smoke";
const EXPECTED_PROFILE_BRANCH = "refs/heads/fix/production-search-regression";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface CatalogSmokeEnvironment {
  [key: string]: string | undefined;
}

export interface CatalogSmokeAuthorization {
  protectedProduction: boolean;
  databaseLabel: "isolated-non-production" | "protected-production-read-only";
}

export interface QueryExecutor {
  query(
    text: string,
    values?: unknown[],
  ): PromiseLike<{ rows: Array<Record<string, unknown>> }>;
}

export interface CloseablePool {
  end(): Promise<void>;
}

export interface CatalogProfileSnapshot {
  currentRows: number;
  staleRows: number;
  searchableRows: number;
  snapshotHashes: number;
  minHash: string | null;
  maxHash: string | null;
}

export function assertCatalogProfileSnapshot(
  snapshot: CatalogProfileSnapshot,
  confirmedSha: string,
  minimumCurrentRows = 16_000,
): void {
  const normalizedSha = confirmedSha.toLowerCase();
  if (
    !Number.isInteger(snapshot.currentRows) ||
    snapshot.currentRows < minimumCurrentRows ||
    snapshot.searchableRows !== snapshot.currentRows ||
    snapshot.staleRows < 0 ||
    snapshot.snapshotHashes !== 1 ||
    snapshot.minHash?.toLowerCase() !== normalizedSha ||
    snapshot.maxHash?.toLowerCase() !== normalizedSha
  ) {
    throw new Error("Production profile snapshot gate failed.");
  }
}

function isRenderHost(host: string): boolean {
  return host.includes("render.com") || host.includes("render-postgres");
}

function assertProtectedProductionContext(env: CatalogSmokeEnvironment): void {
  const confirmedSha = env.CONFIRM_REGISTRY_SNAPSHOT_SHA?.toLowerCase() ?? "";
  const auditedSha = env.AUDITED_REGISTRY_SNAPSHOT_SHA?.toLowerCase() ?? "";
  const committedSha = env.REGISTRY_COMMIT_SNAPSHOT_SHA?.toLowerCase() ?? "";
  const requirements = [
    env.REGISTRY_PRODUCTION_SEARCH_SMOKE === "true",
    SHA256_PATTERN.test(confirmedSha),
    SHA256_PATTERN.test(auditedSha),
    SHA256_PATTERN.test(committedSha),
    confirmedSha === auditedSha,
    committedSha === auditedSha,
    env.REGISTRY_SYNC_MODE === "apply",
    env.REGISTRY_SYNC_PURPOSE === EXPECTED_PURPOSE,
    env.REGISTRY_SYNC_ENVIRONMENT === EXPECTED_ENVIRONMENT,
    env.REGISTRY_COMMIT_COMPLETED === "true",
    env.GITHUB_ACTIONS === "true",
    env.GITHUB_WORKFLOW === EXPECTED_WORKFLOW,
    env.GITHUB_REPOSITORY === EXPECTED_REPOSITORY,
    env.GITHUB_EVENT_NAME === "workflow_dispatch",
    env.GITHUB_REF === "refs/heads/main",
    /^\d+$/.test(env.GITHUB_RUN_ID ?? ""),
  ];
  if (requirements.some((requirement) => !requirement)) {
    throw new Error(
      "Catalog DB smoke refuses the production host outside the approved post-apply registry workflow.",
    );
  }
}

export function assertProtectedProductionProfileContext(
  env: CatalogSmokeEnvironment,
): void {
  const confirmedSha = env.CONFIRM_REGISTRY_SNAPSHOT_SHA?.toLowerCase() ?? "";
  const auditedSha = env.AUDITED_REGISTRY_SNAPSHOT_SHA?.toLowerCase() ?? "";
  const confirmationInput =
    env.CONFIRM_PRODUCTION_APPLY_INPUT?.toLowerCase() ?? "";
  const confirmationSecret =
    env.CONFIRM_PRODUCTION_REGISTRY_APPLY?.toLowerCase() ?? "";
  const requirements = [
    env.REGISTRY_PRODUCTION_SEARCH_PROFILE === "true",
    SHA256_PATTERN.test(confirmedSha),
    SHA256_PATTERN.test(auditedSha),
    SHA256_PATTERN.test(confirmationInput),
    SHA256_PATTERN.test(confirmationSecret),
    confirmedSha === auditedSha,
    confirmationInput === auditedSha,
    confirmationSecret === auditedSha,
    env.REGISTRY_SYNC_MODE === "profile",
    env.REGISTRY_SYNC_PURPOSE === EXPECTED_PROFILE_PURPOSE,
    env.REGISTRY_SYNC_ENVIRONMENT === EXPECTED_ENVIRONMENT,
    env.GITHUB_ACTIONS === "true",
    env.GITHUB_WORKFLOW === EXPECTED_WORKFLOW,
    env.GITHUB_REPOSITORY === EXPECTED_REPOSITORY,
    env.GITHUB_EVENT_NAME === "workflow_dispatch",
    ["refs/heads/main", EXPECTED_PROFILE_BRANCH].includes(env.GITHUB_REF ?? ""),
    /^\d+$/.test(env.GITHUB_RUN_ID ?? ""),
  ];
  if (requirements.some((requirement) => !requirement)) {
    throw new Error(
      "Catalog DB profile refuses production access outside the approved read-only registry workflow.",
    );
  }
}

export function authorizeCatalogProfileDatabase(
  rawDatabaseUrl: string | undefined,
  env: CatalogSmokeEnvironment,
): CatalogSmokeAuthorization {
  if (!rawDatabaseUrl) {
    throw new Error(
      "Production database configuration is required for profiling.",
    );
  }
  const host = new URL(rawDatabaseUrl).hostname.toLowerCase();
  if (!isRenderHost(host)) {
    throw new Error("Registry production profiling requires the Render host.");
  }
  assertProtectedProductionProfileContext(env);
  return {
    protectedProduction: true,
    databaseLabel: "protected-production-read-only",
  };
}

export function authorizeCatalogSmokeDatabase(
  rawDatabaseUrl: string | undefined,
  env: CatalogSmokeEnvironment,
): CatalogSmokeAuthorization {
  if (!rawDatabaseUrl) {
    throw new Error("A local test database is required for catalog DB smoke.");
  }
  const host = new URL(rawDatabaseUrl).hostname.toLowerCase();
  const local = new Set(["localhost", "127.0.0.1", "::1"]);
  if (isRenderHost(host)) {
    assertProtectedProductionContext(env);
    return {
      protectedProduction: true,
      databaseLabel: "protected-production-read-only",
    };
  }
  if (
    !local.has(host) &&
    env.ALLOW_REGISTRY_CATALOG_DB_SMOKE_NONLOCAL !== "true"
  ) {
    throw new Error("Catalog DB smoke requires an isolated test database.");
  }
  return {
    protectedProduction: false,
    databaseLabel: "isolated-non-production",
  };
}

export function configureCatalogSmokeReadOnlySession(
  env: CatalogSmokeEnvironment,
): void {
  env.PGAPPNAME = EXPECTED_APP_NAME;
  env.PGOPTIONS = [
    "-c default_transaction_read_only=on",
    "-c statement_timeout=30000",
    "-c idle_in_transaction_session_timeout=5000",
  ].join(" ");
}

function stripSqlLiteralsAndComments(statement: string): string {
  return statement
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ")
    .replace(
      /\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/g,
      " ",
    )
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""')
    .trim();
}

export function assertReadOnlyCatalogStatement(statement: string): void {
  const normalized = stripSqlLiteralsAndComments(statement);
  const withoutTrailingTerminator = normalized.replace(/;\s*$/, "").trim();
  const allowedQuery = /^(?:SELECT|WITH|EXPLAIN)\b/i.test(
    withoutTrailingTerminator,
  );
  const forbidden =
    /\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|VACUUM|REFRESH|REINDEX|CLUSTER|COMMENT|SECURITY|SET|RESET|DISCARD|LISTEN|NOTIFY|LOCK|INTO|COMMIT)\b/i;
  const multipleStatements = withoutTrailingTerminator.includes(";");
  if (
    !withoutTrailingTerminator ||
    multipleStatements ||
    !allowedQuery ||
    forbidden.test(normalized)
  ) {
    throw new Error("Catalog DB smoke blocked a non-read-only SQL statement.");
  }
}

export function createReadOnlyCatalogExecutor(
  executor: QueryExecutor,
): QueryExecutor {
  return {
    async query(text, values = []) {
      assertReadOnlyCatalogStatement(text);
      return await executor.query(text, values);
    },
  };
}

export async function verifyCatalogSmokeReadOnlySession(
  executor: QueryExecutor,
): Promise<void> {
  const result = await executor.query(
    `SELECT current_setting('transaction_read_only') AS transaction_read_only,
            current_setting('statement_timeout') AS statement_timeout,
            current_setting('application_name') AS application_name`,
  );
  const row = result.rows[0];
  if (
    row?.transaction_read_only !== "on" ||
    row?.statement_timeout === "0" ||
    row?.application_name !== EXPECTED_APP_NAME
  ) {
    throw new Error(
      "Catalog DB smoke did not establish a bounded read-only session.",
    );
  }
}

export async function assertCatalogSmokeHasNoIdleTransactions(
  executor: QueryExecutor,
): Promise<number> {
  const result = await executor.query(
    `SELECT COUNT(*)::int AS idle_transactions
       FROM pg_stat_activity
      WHERE datname = current_database()
        AND application_name = current_setting('application_name')
        AND state = 'idle in transaction'`,
  );
  const count = Number(result.rows[0]?.idle_transactions ?? -1);
  if (count !== 0) {
    throw new Error("Catalog DB smoke left an idle transaction open.");
  }
  return count;
}

export async function closeCatalogSmokePool(
  pool: CloseablePool,
): Promise<void> {
  await pool.end();
}
