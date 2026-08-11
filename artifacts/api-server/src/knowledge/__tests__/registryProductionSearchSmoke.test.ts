import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  assertCatalogProfileSnapshot,
  assertCatalogSmokeHasNoIdleTransactions,
  assertReadOnlyCatalogStatement,
  authorizeCatalogProfileDatabase,
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
const NEON_URL =
  "postgresql://db.pooler.us-east-2.aws.neon.tech:5432/farmassist";
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

function profileContext(
  overrides: CatalogSmokeEnvironment = {},
): CatalogSmokeEnvironment {
  return {
    REGISTRY_PRODUCTION_SEARCH_PROFILE: "true",
    CONFIRM_REGISTRY_SNAPSHOT_SHA: SHA,
    AUDITED_REGISTRY_SNAPSHOT_SHA: SHA,
    CONFIRM_PRODUCTION_APPLY_INPUT: SHA,
    CONFIRM_PRODUCTION_REGISTRY_APPLY: SHA,
    REGISTRY_SYNC_MODE: "profile",
    REGISTRY_SYNC_PURPOSE: "production-registry-search-profile",
    REGISTRY_SYNC_ENVIRONMENT: "production-registry-sync",
    GITHUB_ACTIONS: "true",
    GITHUB_WORKFLOW: "Official registry parity and gated sync",
    GITHUB_REPOSITORY: "igsamchenko-cmyk/ai-pharmacy-assistant",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/fix/production-search-regression",
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

  it("protects Neon hosts with the same fail-closed gate", () => {
    expect(() => authorizeCatalogSmokeDatabase(NEON_URL, {})).toThrow(
      /refuses the production host/,
    );
    expect(authorizeCatalogSmokeDatabase(NEON_URL, protectedContext())).toEqual(
      {
        protectedProduction: true,
        databaseLabel: "protected-production-read-only",
      },
    );
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

describe("protected production search profile authorization", () => {
  it("blocks incomplete and mismatched profile confirmations", () => {
    expect(() =>
      authorizeCatalogProfileDatabase(RENDER_URL, {
        REGISTRY_PRODUCTION_SEARCH_PROFILE: "true",
      }),
    ).toThrow(/approved read-only/);
    expect(() =>
      authorizeCatalogProfileDatabase(
        RENDER_URL,
        profileContext({ CONFIRM_PRODUCTION_REGISTRY_APPLY: "a".repeat(64) }),
      ),
    ).toThrow(/approved read-only/);
  });

  it("allows Neon only with the complete protected profile context", () => {
    expect(authorizeCatalogProfileDatabase(NEON_URL, profileContext())).toEqual(
      {
        protectedProduction: true,
        databaseLabel: "protected-production-read-only",
      },
    );
  });

  it("blocks wrong mode, workflow and branch markers", () => {
    expect(() =>
      authorizeCatalogProfileDatabase(
        RENDER_URL,
        profileContext({ REGISTRY_SYNC_MODE: "apply" }),
      ),
    ).toThrow(/approved read-only/);
    expect(() =>
      authorizeCatalogProfileDatabase(
        RENDER_URL,
        profileContext({ GITHUB_WORKFLOW: "Ordinary CI" }),
      ),
    ).toThrow(/approved read-only/);
    expect(() =>
      authorizeCatalogProfileDatabase(
        RENDER_URL,
        profileContext({ GITHUB_REF: "refs/heads/arbitrary" }),
      ),
    ).toThrow(/approved read-only/);
  });

  it("allows only the complete protected read-only profile context", () => {
    expect(
      authorizeCatalogProfileDatabase(RENDER_URL, profileContext()),
    ).toEqual({
      protectedProduction: true,
      databaseLabel: "protected-production-read-only",
    });
  });
});

describe("moving production profile snapshot gate", () => {
  const snapshot = {
    currentRows: 16_474,
    staleRows: 59,
    searchableRows: 16_474,
    snapshotHashes: 1,
    minHash: SHA,
    maxHash: SHA,
  };

  it("accepts a confirmed moving official count above the anomaly floor", () => {
    expect(() => assertCatalogProfileSnapshot(snapshot, SHA)).not.toThrow();
  });

  it("fails closed for partial, hidden, mixed, or wrong snapshots", () => {
    expect(() =>
      assertCatalogProfileSnapshot({ ...snapshot, currentRows: 15_999 }, SHA),
    ).toThrow(/snapshot gate/);
    expect(() =>
      assertCatalogProfileSnapshot(
        { ...snapshot, searchableRows: snapshot.currentRows - 1 },
        SHA,
      ),
    ).toThrow(/snapshot gate/);
    expect(() =>
      assertCatalogProfileSnapshot({ ...snapshot, snapshotHashes: 2 }, SHA),
    ).toThrow(/snapshot gate/);
    expect(() =>
      assertCatalogProfileSnapshot(
        { ...snapshot, minHash: "a".repeat(64), maxHash: "a".repeat(64) },
        SHA,
      ),
    ).toThrow(/snapshot gate/);
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

  it("keeps environment-scoped secrets and every protected smoke marker", () => {
    const workflowPath = fileURLToPath(
      new URL(
        "../../../../../.github/workflows/official-registry-sync.yml",
        import.meta.url,
      ),
    );
    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow).toContain("environment: production-registry-sync");
    expect(workflow).toContain("--expect-min-products=16000");
    expect(workflow).not.toContain("--expect-min-products=16533");
    expect(workflow).toContain("confirm_production_apply:");
    expect(workflow).toContain("CONFIRM_PRODUCTION_APPLY_INPUT:");
    expect(workflow).toContain("CONFIRM_PRODUCTION_REGISTRY_APPLY:");
    expect(workflow).toContain("Require fail-closed production confirmation");
    expect(workflow).toContain("confirmation_passed != 'true'");
    const applyJob = workflow.slice(workflow.indexOf("\n  apply:"));
    const applyHeader = applyJob.slice(0, applyJob.indexOf("\n    steps:"));
    expect(applyHeader).not.toContain("DATABASE_URL");
    expect(
      applyJob.indexOf("Require fail-closed production confirmation"),
    ).toBeLessThan(
      applyJob.indexOf("DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}"),
    );
    const stageArtifact = workflow.indexOf(
      "Stage immutable registry checkpoint",
    );
    const uploadArtifact = workflow.indexOf(
      "Upload audit and rollback checkpoint",
    );
    const downloadArtifact = applyJob.indexOf(
      "Download the audited immutable checkpoint",
    );
    const verifyArtifact = applyJob.indexOf(
      "Verify downloaded registry CSV before DB access",
    );
    const databaseAccess = applyJob.indexOf("Apply additive schema changes");
    expect(stageArtifact).toBeGreaterThan(-1);
    expect(stageArtifact).toBeLessThan(uploadArtifact);
    expect(downloadArtifact).toBeLessThan(verifyArtifact);
    expect(verifyArtifact).toBeLessThan(databaseAccess);
    expect(workflow).toContain("registry-checkpoint/");
    expect(workflow).toContain("REGISTRY_ARTIFACT_DIRECTORY:");
    expect(workflow).toContain("steps.registry_artifact.outputs.csv_path");
    expect(workflow).not.toContain("$RUNNER_TEMP/registry-audit/reestr.csv");
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

    const profileJob = workflow.slice(
      workflow.indexOf("\n  profile:"),
      workflow.indexOf("\n  apply:"),
    );
    const profileHeader = profileJob.slice(
      0,
      profileJob.indexOf("\n    steps:"),
    );
    expect(profileHeader).not.toContain("DATABASE_URL");
    expect(profileJob).toContain(
      "Require fail-closed read-only profile confirmation",
    );
    expect(
      profileJob.indexOf("profile_confirmation_passed != 'true'"),
    ).toBeLessThan(
      profileJob.indexOf(
        "DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}",
      ),
    );
    expect(profileJob).toContain("REGISTRY_SYNC_MODE: profile");
    expect(profileJob).toContain(
      "REGISTRY_SYNC_PURPOSE: production-registry-search-profile",
    );
    expect(profileJob).not.toContain("pnpm db:push");
    expect(profileJob).not.toContain("--apply");
  });

  it("uses a moving-source anomaly floor instead of a stale exact DRLZ count", () => {
    const workflowPath = fileURLToPath(
      new URL(
        "../../../../../.github/workflows/v16-registry-validation.yml",
        import.meta.url,
      ),
    );
    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow).toContain("--expect-min-products=16000");
    expect(workflow).not.toContain("--expect-min-products=16533");
    expect(workflow).not.toContain("--expect-products=16533");
    expect(workflow).toContain(
      "the smoke itself verifies that every parsed row is persisted",
    );
  });

  it("keeps the production profile moving-count and read-only diagnostics", () => {
    const profilePath = fileURLToPath(
      new URL(
        "../../scripts/knowledge-registry-search-profile.ts",
        import.meta.url,
      ),
    );
    const profile = readFileSync(profilePath, "utf8");
    expect(profile).not.toContain("16_533");
    expect(profile).toContain("assertCatalogProfileSnapshot");
    expect(profile).toContain("FROM knowledge_registry_sync_runs");
    expect(profile).toContain("Latest sync missing/extra/changed");
  });
});
