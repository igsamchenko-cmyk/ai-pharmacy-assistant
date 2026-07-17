import { appendFileSync } from "node:fs";
import {
  formatRegistryWorkflowSummary,
  readRegistryCommitState,
  summarizeRegistryWorkflowState,
  type WorkflowOutcome,
} from "../knowledge/registrySyncWorkflowState";

function argValue(prefix: string): string | null {
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    null
  );
}

function outcome(value: string | null): WorkflowOutcome {
  return value === "success" || value === "failure" || value === "skipped"
    ? value
    : "unknown";
}

function appendOutput(path: string | undefined, content: string): void {
  if (path) appendFileSync(path, content, "utf8");
}

function main(): void {
  const state = readRegistryCommitState(argValue("--state-file="));
  const summary = summarizeRegistryWorkflowState({
    state,
    applyOutcome: outcome(argValue("--apply-outcome=")),
    smokeOutcome: outcome(argValue("--smoke-outcome=")),
  });
  const markdown = formatRegistryWorkflowSummary(summary);
  if (!process.argv.includes("--outputs-only")) {
    appendOutput(process.env.GITHUB_STEP_SUMMARY, markdown);
    process.stdout.write(markdown);
  }
  appendOutput(
    process.env.GITHUB_OUTPUT,
    [
      `delivery_state=${summary.status}`,
      `commit_completed=${summary.commitCompleted}`,
      `production_parity=${summary.productionParity}`,
      `current_row_count=${summary.currentRowCount ?? "unknown"}`,
      `registry_snapshot_hash=${summary.registrySnapshotHash ?? "unknown"}`,
      `smoke_succeeded=${summary.smokeSucceeded}`,
      `rollback_required=${summary.rollbackRequired}`,
      "",
    ].join("\n"),
  );
}

try {
  main();
} catch {
  console.error("Registry workflow state summary failed.");
  process.exitCode = 1;
}
