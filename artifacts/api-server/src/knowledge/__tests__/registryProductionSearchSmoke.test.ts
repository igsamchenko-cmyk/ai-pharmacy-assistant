import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  assertCatalogSmokeHasNoIdleTransactions,
  assertReadOnlyCatalogStatement,
  authorizeCatalogSmokeDatabase,
  closeCatalogSmokePool,
  configureCatalogSmokeReadOnlySession,
  createReadOnlyCatalogExecutor,
  verifyCatalogSmokeReadOnlySession,
  type CatalogSmokeEnvironment,
  type QueryExecutor,
} from "../registryProductionSearchSmoke";
import {
  formatRegistryWorkflowSummary,
  initialRegistryCommitState,
  summarizeRegistryWorkflowState,
} from "../registrySyncWorkflowState";

const RENDER_URL = "postgresql://db.render.com:5432/farmassist";
const SHA = "228b8a201491de53d85788d398143586cd20fcd461731892d5db4ab2d8f4dd96";

function protectedContext(
  overrides: CatalogSmokeEnvironment = {},
): CatalogSmokeEnvironment {
  return {
    REGISTRY_PRODUCTION_SEARCH_SMOKE: "true",
    CONFIRM_REGISTRY_SNAPSHOT_SHA: SHA,
    AUDITED_REGISTRY_SNAPSHOT_SHA: SHA,
    REGISTRY_SYNC_MODE: "apply",
    REGISTRY_SYNC_PURPOSE: "post-apply-registry-search-smoke",
    REGISTRY_COMMIT_SNAPSHOT_SHA: SHA,
    REGISTRY_SYNC_ENVIRONMENT: "production-registry-sync",
    REGISTRY_COMMIT_COMPLETED: "true",
    GITHUB_ACTIONS: "true",
    GITHUB_WORKFLOW: "Official registry parity and gated sync",
    GITHUB_REPOSITORY: "igsamchenko-cmyk/ai-pharmacy-assistant",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main",
    GITHUB_RUN_ID: "123456",
    ...overrides,
  };
}

describe("protected production catalog smoke authorization", () => {
  it("blocks a Render host without permission", () => {
    expect(() => authorizeCatalogSmokeDatabase(RENDER_URL, {})).toThrow(
      /refuses the production host/,
    );
  });

  it("blocks a Render host with only the explicit flag", () => {
    expect(() =>
      authorizeCatalogSmokeDatabase(RENDER_URL, {
        REGISTRY_PRODUCTION_SEARCH_SMOKE: "true",
      }),
    ).toThrow(/approved post-apply/);
  });

  it("blocks a wrong audited SHA", () => {
    expect(() =>
      authorizeCatalogSmokeDatabase(
        RENDER_URL,
        protectedContext({ AUDITED_REGISTRY_SNAPSHOT_SHA: "a".repeat(64) }),
      ),
    ).toThrow(/approved post-apply/);
  });

  it("blocks the wrong workflow marker", () => {
    expect(() =>
      authorizeCatalogSmokeDatabase(
        RENDER_URL,
        protectedContext({ GITHUB_WORKFLOW: "Ordinary CI" }),
      ),
    ).toThrow(/approved post-apply/);
  });

  it("blocks non-apply mode", () => {
    expect(() =>
      authorizeCatalogSmokeDatabase(
        RENDER_URL,
        protectedContext({ REGISTRY_SYNC_MODE: "audit" }),
      ),
    ).toThrow(/approved post-apply/);
  });

  it("allows the complete protected apply context", () => {
    expect(
      authorizeCatalogSmokeDatabase(RENDER_URL, protectedContext()),
    ).toEqual({
      protectedProduction: true,
      databaseLabel: "protected-production-read-only",
    });
  });
});

describe("read-only production catalog smoke", () => {
  it("sets bounded read-only PostgreSQL session options", () => {
    const env: CatalogSmokeEnvironment = {};
    configureCatalogSmokeReadOnlySession(env);
    expect(env.PGOPTIONS).toContain("default_transaction_read_only=on");
    expect(env.PGOPTIONS).toContain("statement_timeout=30000");
    expect(env.PGOPTIONS).toContain("idle_in_transaction_session_timeout=5000");
  });

  it("allows only SELECT/WITH/EXPLAIN statements", () => {
    expect(() => assertReadOnlyCatalogStatement("SELECT 1")).not.toThrow();
    expect(() =>
      assertReadOnlyCatalogStatement(
        "WITH rows AS (SELECT 1) SELECT * FROM rows",
      ),
    ).not.toThrow();
    expect(() =>
      assertReadOnlyCatalogStatement("EXPLAIN (FORMAT JSON) SELECT 1"),
    ).not.toThrow();
    expect(() =>
      assertReadOnlyCatalogStatement("EXPLAIN (ANALYZE, FORMAT JSON) SELECT 1"),
    ).not.toThrow();
    expect(() => assertReadOnlyCatalogStatement("BEGIN READ ONLY")).toThrow();
    expect(() =>
      assertReadOnlyCatalogStatement("SHOW transaction_read_only"),
    ).toThrow();
  });

  it("blocks writes and modifying CTEs in smoke context", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const executor = createReadOnlyCatalogExecutor({ query });
    await expect(
      executor.query("UPDATE knowledge_registry_products SET trade_name = 'x'"),
    ).rejects.toThrow(/non-read-only/);
    await expect(
      executor.query(
        "WITH changed AS (DELETE FROM knowledge_registry_products RETURNING *) SELECT * FROM changed",
      ),
    ).rejects.toThrow(/non-read-only/);
    expect(query).not.toHaveBeenCalled();
  });

  it("verifies session settings and idle transaction count", async () => {
    const executor: QueryExecutor = {
      query: vi.fn(async (statement: string) =>
        statement.includes("pg_stat_activity")
          ? { rows: [{ idle_transactions: 0 }] }
          : {
              rows: [
                {
                  transaction_read_only: "on",
                  statement_timeout: "30s",
                  application_name:
                    "farmassist-registry-production-search-smoke",
                },
              ],
            },
      ),
    };
    await expect(
      verifyCatalogSmokeReadOnlySession(executor),
    ).resolves.toBeUndefined();
    await expect(
      assertCatalogSmokeHasNoIdleTransactions(executor),
    ).resolves.toBe(0);
  });

  it("closes the pool", async () => {
    const end = vi.fn(async () => undefined);
    await closeCatalogSmokePool({ end });
    expect(end).toHaveBeenCalledOnce();
  });
});

describe("post-commit workflow state", () => {
  const committed = {
    ...initialRegistryCommitState(),
    commitCompleted: true,
    productionParity: "exact" as const,
    currentRowCount: 16_533,
    registrySnapshotHash: SHA,
  };

  it("distinguishes failure before commit", () => {
    expect(
      summarizeRegistryWorkflowState({
        state: initialRegistryCommitState(),
        applyOutcome: "failure",
        smokeOutcome: "skipped",
      }),
    ).toMatchObject({
      status: "apply_failed_before_commit",
      commitCompleted: false,
      rollbackRequired: false,
    });
  });

  it("distinguishes committed plus smoke failed", () => {
    expect(
      summarizeRegistryWorkflowState({
        state: committed,
        applyOutcome: "success",
        smokeOutcome: "failure",
      }),
    ).toMatchObject({
      status: "committed_smoke_failed",
      commitCompleted: true,
      productionParity: "exact",
      currentRowCount: 16_533,
      registrySnapshotHash: SHA,
      rollbackRequired: true,
    });
  });

  it("distinguishes apply and smoke success without leaking secrets or paths", () => {
    const summary = summarizeRegistryWorkflowState({
      state: committed,
      applyOutcome: "success",
      smokeOutcome: "success",
    });
    const markdown = formatRegistryWorkflowSummary(summary);
    expect(summary).toMatchObject({
      status: "apply_and_smoke_success",
      rollbackRequired: false,
    });
    expect(markdown).not.toMatch(/postgres(?:ql)?:\/\//i);
    expect(markdown).not.toMatch(/[A-Za-z]:\\|\/(?:home|tmp|var)\//);
  });

  it("keeps the protected environment on the apply job and passes every contract marker", () => {
    const workflowPath = fileURLToPath(
      new URL(
        "../../../../../.github/workflows/official-registry-sync.yml",
        import.meta.url,
      ),
    );
    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow).toContain("environment: production-registry-sync");
    expect(workflow).toContain('REGISTRY_PRODUCTION_SEARCH_SMOKE: "true"');
    expect(workflow).toContain("AUDITED_REGISTRY_SNAPSHOT_SHA:");
    expect(workflow).toContain("CONFIRM_REGISTRY_SNAPSHOT_SHA:");
    expect(workflow).toContain("REGISTRY_COMMIT_SNAPSHOT_SHA:");
    expect(workflow).toContain("REGISTRY_SYNC_MODE: apply");
    expect(workflow).toContain(
      "REGISTRY_SYNC_PURPOSE: post-apply-registry-search-smoke",
    );
    expect(workflow).toContain(
      "REGISTRY_SYNC_ENVIRONMENT: production-registry-sync",
    );
    expect(workflow).toContain("Post-commit state summary");
    expect(workflow).not.toMatch(/ALLOW_PRODUCTION\s*[:=]/);
  });
});
