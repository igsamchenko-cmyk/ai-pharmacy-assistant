import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  appendRegistryAuditReconciliation,
  authorizeRegistryAuditReconciliationDatabase,
  assertProtectedRegistryAuditReconciliationContext,
  assertRegistryAuditReconciliationSnapshot,
  type RegistryAuditReconciliationEnvironment,
} from "../registryAuditReconciliation";

const SHA = "c".repeat(64);

function protectedEnvironment(): RegistryAuditReconciliationEnvironment {
  return {
    REGISTRY_PRODUCTION_AUDIT_RECONCILIATION: "true",
    CONFIRM_REGISTRY_SNAPSHOT_SHA: SHA,
    AUDITED_REGISTRY_SNAPSHOT_SHA: SHA,
    CONFIRM_PRODUCTION_RECONCILE_INPUT: SHA,
    CONFIRM_PRODUCTION_REGISTRY_RECONCILE: SHA,
    REGISTRY_SYNC_MODE: "reconcile",
    REGISTRY_SYNC_PURPOSE: "production-registry-audit-reconciliation",
    REGISTRY_SYNC_ENVIRONMENT: "production-registry-sync",
    GITHUB_ACTIONS: "true",
    GITHUB_WORKFLOW: "Official registry parity and gated sync",
    GITHUB_REPOSITORY: "igsamchenko-cmyk/ai-pharmacy-assistant",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main",
    GITHUB_RUN_ID: "12345",
  };
}

describe("protected registry audit reconciliation", () => {
  it("allows only the exact protected confirmation context", () => {
    expect(
      assertProtectedRegistryAuditReconciliationContext(protectedEnvironment()),
    ).toBe(SHA);
  });

  it.each([
    ["flag", { REGISTRY_PRODUCTION_AUDIT_RECONCILIATION: "false" }],
    ["sha", { CONFIRM_REGISTRY_SNAPSHOT_SHA: "a".repeat(64) }],
    ["input", { CONFIRM_PRODUCTION_RECONCILE_INPUT: "a".repeat(64) }],
    ["secret", { CONFIRM_PRODUCTION_REGISTRY_RECONCILE: "a".repeat(64) }],
    ["mode", { REGISTRY_SYNC_MODE: "apply" }],
    ["purpose", { REGISTRY_SYNC_PURPOSE: "other" }],
    ["environment", { REGISTRY_SYNC_ENVIRONMENT: "other" }],
    ["workflow", { GITHUB_WORKFLOW: "other" }],
    ["repository", { GITHUB_REPOSITORY: "other/repo" }],
    ["event", { GITHUB_EVENT_NAME: "push" }],
    ["ref", { GITHUB_REF: "refs/heads/feature" }],
  ])("blocks a wrong %s marker", (_label, change) => {
    expect(() =>
      assertProtectedRegistryAuditReconciliationContext({
        ...protectedEnvironment(),
        ...change,
      }),
    ).toThrow(/refused/);
  });

  it("allows approved Render and Neon hosts after the full context gate", () => {
    expect(
      authorizeRegistryAuditReconciliationDatabase(
        "postgresql://example.render.com/db",
        protectedEnvironment(),
      ),
    ).toBe(SHA);
    expect(
      authorizeRegistryAuditReconciliationDatabase(
        "postgresql://example.pooler.us-east-2.aws.neon.tech/db",
        protectedEnvironment(),
      ),
    ).toBe(SHA);
    expect(() =>
      authorizeRegistryAuditReconciliationDatabase(
        "postgresql://localhost/db",
        protectedEnvironment(),
      ),
    ).toThrow(/approved production database host/);
  });

  it("requires exact current/searchable parity while allowing stale history", () => {
    const snapshot = {
      officialRows: 16_474,
      currentRows: 16_474,
      staleRows: 330,
      searchableRows: 16_474,
      missingRows: 0,
      unintendedCurrentExtras: 0,
      changedRows: 0,
      hiddenRows: 0,
      snapshotHashes: 1,
      minHash: SHA,
      maxHash: SHA,
      exactParity: true,
    };
    expect(() =>
      assertRegistryAuditReconciliationSnapshot(snapshot, SHA),
    ).not.toThrow();
    expect(() =>
      assertRegistryAuditReconciliationSnapshot(
        { ...snapshot, changedRows: 1, exactParity: false },
        SHA,
      ),
    ).toThrow(/parity gate/);
    expect(() =>
      assertRegistryAuditReconciliationSnapshot(
        { ...snapshot, unintendedCurrentExtras: 1 },
        SHA,
      ),
    ).toThrow(/parity gate/);
    expect(() =>
      assertRegistryAuditReconciliationSnapshot(
        { ...snapshot, minHash: "a".repeat(64) },
        SHA,
      ),
    ).toThrow(/parity gate/);
  });

  it("appends one exact audit record without product writes", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: `registry-reconcile-${SHA}`,
          status: "completed",
          parity_status: "exact",
        },
      ],
    });
    const result = await appendRegistryAuditReconciliation(
      { query },
      {
        id: `registry-reconcile-${SHA}`,
        sourceUrl: "https://official.example/reestr.csv",
        sourceHash: SHA,
        sourceTimestamp: "2026-07-21T00:00:00Z",
        officialRows: 16_474,
        currentRows: 16_474,
      },
    );
    const sql = String(query.mock.calls[0]?.[0]);
    expect(result).toMatchObject({
      status: "completed",
      parity_status: "exact",
    });
    expect(sql).toContain("INSERT INTO knowledge_registry_sync_runs");
    expect(sql).toContain("'reconcile', 'completed'");
    expect(sql).toContain("NOT EXISTS");
    expect(sql).not.toMatch(
      /(?:INSERT|UPDATE|DELETE)\s+.*knowledge_registry_products/i,
    );
    expect(sql).not.toMatch(/\b(?:UPDATE|DELETE|DROP|TRUNCATE)\b/i);
  });

  it("fails closed when no append occurs", async () => {
    await expect(
      appendRegistryAuditReconciliation(
        { query: vi.fn().mockResolvedValue({ rows: [] }) },
        {
          id: `registry-reconcile-${SHA}`,
          sourceUrl: "https://official.example/reestr.csv",
          sourceHash: SHA,
          sourceTimestamp: "2026-07-21T00:00:00Z",
          officialRows: 16_474,
          currentRows: 16_474,
        },
      ),
    ).rejects.toThrow(/not appended/);
  });

  it("keeps the workflow metadata-only and confirmation-first", () => {
    const workflow = readFileSync(
      fileURLToPath(
        new URL(
          "../../../../../.github/workflows/official-registry-sync.yml",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    expect(workflow).toContain("confirm_production_reconcile:");
    const job = workflow.slice(
      workflow.indexOf("\n  reconcile:"),
      workflow.indexOf("\n  apply:"),
    );
    expect(job).toContain("environment: production-registry-sync");
    expect(job).toContain("CONFIRM_PRODUCTION_REGISTRY_RECONCILE:");
    expect(job).toContain("reconciliation_confirmation_passed != 'true'");
    expect(
      job.indexOf("Require fail-closed reconciliation confirmation"),
    ).toBeLessThan(
      job.indexOf("DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}"),
    );
    expect(job).toContain("Verify downloaded registry CSV before DB access");
    expect(job).not.toContain("pnpm db:push");
    expect(job).not.toContain("--apply");
  });

  it("exposes reconciliation commands from the workspace root used by Actions", () => {
    const rootPackage = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("../../../../../package.json", import.meta.url)),
        "utf8",
      ),
    ) as { scripts?: Record<string, string> };
    expect(rootPackage.scripts?.["knowledge:registry:reconcile-confirm"]).toBe(
      "pnpm --filter @workspace/api-server run knowledge:registry:reconcile-confirm",
    );
    expect(rootPackage.scripts?.["knowledge:registry:reconcile-audit"]).toBe(
      "pnpm --filter @workspace/api-server run knowledge:registry:reconcile-audit",
    );
  });
});
