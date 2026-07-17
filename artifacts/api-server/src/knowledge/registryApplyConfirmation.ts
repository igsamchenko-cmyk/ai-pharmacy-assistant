export interface RegistryApplyConfirmationInput {
  mode?: string;
  confirmSha256?: string;
  auditedSha256?: string;
  confirmProductionApply?: string;
  secretConfirmation?: string;
}

export type RegistryApplyConfirmationReason =
  | "confirmed"
  | "mode_not_apply"
  | "missing_confirmation"
  | "invalid_audited_sha"
  | "snapshot_sha_mismatch"
  | "environment_secret_mismatch"
  | "dispatch_confirmation_mismatch";

export interface RegistryApplyConfirmationResult {
  passed: boolean;
  reason: RegistryApplyConfirmationReason;
}

const SHA256 = /^[0-9a-f]{64}$/;

export function verifyRegistryApplyConfirmation(
  input: RegistryApplyConfirmationInput,
): RegistryApplyConfirmationResult {
  if (input.mode !== "apply") {
    return { passed: false, reason: "mode_not_apply" };
  }

  if (
    !input.confirmSha256 ||
    !input.auditedSha256 ||
    !input.confirmProductionApply ||
    !input.secretConfirmation
  ) {
    return { passed: false, reason: "missing_confirmation" };
  }

  if (!SHA256.test(input.auditedSha256)) {
    return { passed: false, reason: "invalid_audited_sha" };
  }

  if (input.confirmSha256 !== input.auditedSha256) {
    return { passed: false, reason: "snapshot_sha_mismatch" };
  }

  if (input.secretConfirmation !== input.auditedSha256) {
    return { passed: false, reason: "environment_secret_mismatch" };
  }

  if (input.confirmProductionApply !== input.secretConfirmation) {
    return { passed: false, reason: "dispatch_confirmation_mismatch" };
  }

  return { passed: true, reason: "confirmed" };
}

export function formatRegistryApplyConfirmationSummary(
  result: RegistryApplyConfirmationResult,
): string {
  return [
    "## Production registry confirmation gate",
    "",
    `- Confirmation gate passed: **${result.passed}**`,
    `- Result: \`${result.reason}\``,
    "",
  ].join("\n");
}
