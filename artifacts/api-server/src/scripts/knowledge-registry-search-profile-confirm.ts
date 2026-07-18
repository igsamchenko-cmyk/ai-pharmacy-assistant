import { appendFileSync } from "node:fs";
import { assertProtectedProductionProfileContext } from "../knowledge/registryProductionSearchSmoke";

function append(path: string | undefined, content: string): void {
  if (path) appendFileSync(path, content, "utf8");
}

try {
  assertProtectedProductionProfileContext(process.env);
  append(process.env.GITHUB_OUTPUT, "profile_confirmation_passed=true\n");
  const summary = [
    "## Production search profile confirmation",
    "",
    "- Confirmation gate passed: **true**",
    "- Access mode: **read-only SELECT/EXPLAIN**",
    "",
  ].join("\n");
  append(process.env.GITHUB_STEP_SUMMARY, summary);
  process.stdout.write(summary);
} catch {
  append(process.env.GITHUB_OUTPUT, "profile_confirmation_passed=false\n");
  console.error(
    "Production search profile confirmation failed before database access.",
  );
  process.exitCode = 1;
}
