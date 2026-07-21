import { appendFileSync } from "node:fs";
import { assertProtectedRegistryAuditReconciliationContext } from "../knowledge/registryAuditReconciliation";

function append(path: string | undefined, content: string): void {
  if (path) appendFileSync(path, content, "utf8");
}

try {
  assertProtectedRegistryAuditReconciliationContext(process.env);
  append(
    process.env.GITHUB_OUTPUT,
    "reconciliation_confirmation_passed=true\n",
  );
  const summary = [
    "## Production registry audit reconciliation confirmation",
    "",
    "- Confirmation gate passed: **true**",
    "- Allowed write scope: **append-only sync audit metadata**",
    "- Product and manufacturer writes: **forbidden**",
    "",
  ].join("\n");
  append(process.env.GITHUB_STEP_SUMMARY, summary);
  process.stdout.write(summary);
} catch {
  append(
    process.env.GITHUB_OUTPUT,
    "reconciliation_confirmation_passed=false\n",
  );
  console.error(
    "Production registry audit reconciliation confirmation failed before database access.",
  );
  process.exitCode = 1;
}
