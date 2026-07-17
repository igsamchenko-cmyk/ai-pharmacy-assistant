import { readFileSync, writeFileSync } from "node:fs";

export interface RegistryCommitState {
  schemaVersion: "registry-sync-commit-state-v1";
  commitCompleted: boolean;
  productionParity: "exact" | "mismatch" | "unknown";
  currentRowCount: number | null;
  registrySnapshotHash: string | null;
}

export type WorkflowOutcome = "success" | "failure" | "skipped" | "unknown";

export interface RegistryWorkflowSummary {
  status:
    | "apply_failed_before_commit"
    | "apply_failed_after_commit"
    | "committed_smoke_failed"
    | "apply_and_smoke_success";
  commitCompleted: boolean;
  productionParity: RegistryCommitState["productionParity"];
  currentRowCount: number | null;
  registrySnapshotHash: string | null;
  smokeSucceeded: boolean;
  rollbackRequired: boolean;
}

export function initialRegistryCommitState(): RegistryCommitState {
  return {
    schemaVersion: "registry-sync-commit-state-v1",
    commitCompleted: false,
    productionParity: "unknown",
    currentRowCount: null,
    registrySnapshotHash: null,
  };
}

export function writeRegistryCommitState(
  path: string | null,
  state: RegistryCommitState,
): void {
  if (!path) return;
  writeFileSync(path, `${JSON.stringify(state)}\n`, "utf8");
}

export function readRegistryCommitState(
  path: string | null,
): RegistryCommitState | null {
  if (!path) return null;
  try {
    const candidate = JSON.parse(
      readFileSync(path, "utf8"),
    ) as Partial<RegistryCommitState>;
    if (
      candidate.schemaVersion !== "registry-sync-commit-state-v1" ||
      typeof candidate.commitCompleted !== "boolean" ||
      !["exact", "mismatch", "unknown"].includes(
        candidate.productionParity ?? "",
      )
    ) {
      return null;
    }
    return {
      schemaVersion: "registry-sync-commit-state-v1",
      commitCompleted: candidate.commitCompleted,
      productionParity:
        candidate.productionParity as RegistryCommitState["productionParity"],
      currentRowCount:
        typeof candidate.currentRowCount === "number"
          ? candidate.currentRowCount
          : null,
      registrySnapshotHash:
        typeof candidate.registrySnapshotHash === "string" &&
        /^[a-f0-9]{64}$/.test(candidate.registrySnapshotHash)
          ? candidate.registrySnapshotHash
          : null,
    };
  } catch {
    return null;
  }
}

export function summarizeRegistryWorkflowState(input: {
  state: RegistryCommitState | null;
  applyOutcome: WorkflowOutcome;
  smokeOutcome: WorkflowOutcome;
}): RegistryWorkflowSummary {
  const state = input.state ?? initialRegistryCommitState();
  const smokeSucceeded = input.smokeOutcome === "success";
  let status: RegistryWorkflowSummary["status"];
  if (!state.commitCompleted) {
    status = "apply_failed_before_commit";
  } else if (input.applyOutcome !== "success") {
    status = "apply_failed_after_commit";
  } else if (!smokeSucceeded) {
    status = "committed_smoke_failed";
  } else {
    status = "apply_and_smoke_success";
  }
  const rollbackRequired =
    state.commitCompleted &&
    (input.applyOutcome !== "success" ||
      state.productionParity !== "exact" ||
      !smokeSucceeded);
  return {
    status,
    commitCompleted: state.commitCompleted,
    productionParity: state.productionParity,
    currentRowCount: state.currentRowCount,
    registrySnapshotHash: state.registrySnapshotHash,
    smokeSucceeded,
    rollbackRequired,
  };
}

export function formatRegistryWorkflowSummary(
  summary: RegistryWorkflowSummary,
): string {
  return [
    "## Production registry sync state",
    "",
    `- delivery state: ${summary.status}`,
    `- commit completed: ${summary.commitCompleted}`,
    `- production parity: ${summary.productionParity}`,
    `- current row count: ${summary.currentRowCount ?? "unknown"}`,
    `- registry snapshot hash: ${summary.registrySnapshotHash ?? "unknown"}`,
    `- search smoke succeeded: ${summary.smokeSucceeded}`,
    `- rollback required: ${summary.rollbackRequired}`,
    "",
  ].join("\n");
}
