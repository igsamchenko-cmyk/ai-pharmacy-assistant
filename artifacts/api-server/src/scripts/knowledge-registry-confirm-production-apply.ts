import { appendFileSync } from "node:fs";
import {
  formatRegistryApplyConfirmationSummary,
  verifyRegistryApplyConfirmation,
} from "../knowledge/registryApplyConfirmation";

function appendOutput(path: string | undefined, content: string): void {
  if (path) appendFileSync(path, content, "utf8");
}

const result = verifyRegistryApplyConfirmation({
  mode: process.env.REGISTRY_SYNC_MODE,
  confirmSha256: process.env.CONFIRM_REGISTRY_SNAPSHOT_SHA,
  auditedSha256: process.env.AUDITED_REGISTRY_SNAPSHOT_SHA,
  confirmProductionApply: process.env.CONFIRM_PRODUCTION_APPLY_INPUT,
  secretConfirmation: process.env.CONFIRM_PRODUCTION_REGISTRY_APPLY,
});
const summary = formatRegistryApplyConfirmationSummary(result);

appendOutput(
  process.env.GITHUB_OUTPUT,
  `confirmation_passed=${result.passed}\nconfirmation_reason=${result.reason}\n`,
);
appendOutput(process.env.GITHUB_STEP_SUMMARY, summary);
process.stdout.write(summary);

if (!result.passed) process.exitCode = 1;
