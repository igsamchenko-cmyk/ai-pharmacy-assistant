import { describe, expect, it } from "vitest";
import {
  formatRegistryApplyConfirmationSummary,
  verifyRegistryApplyConfirmation,
  type RegistryApplyConfirmationInput,
} from "../registryApplyConfirmation";

const SHA = "228b8a201491de53d85788d398143586cd20fcd461731892d5db4ab2d8f4dd96";

function confirmed(
  overrides: RegistryApplyConfirmationInput = {},
): RegistryApplyConfirmationInput {
  return {
    mode: "apply",
    confirmSha256: SHA,
    auditedSha256: SHA,
    confirmProductionApply: SHA,
    secretConfirmation: SHA,
    ...overrides,
  };
}

describe("production registry apply confirmation", () => {
  it("allows only the complete exact confirmation contract", () => {
    expect(verifyRegistryApplyConfirmation(confirmed())).toEqual({
      passed: true,
      reason: "confirmed",
    });
  });

  it("blocks audit and other non-apply modes", () => {
    expect(
      verifyRegistryApplyConfirmation(confirmed({ mode: "audit" })),
    ).toEqual({
      passed: false,
      reason: "mode_not_apply",
    });
  });

  it("blocks a missing dispatch confirmation or environment secret", () => {
    expect(
      verifyRegistryApplyConfirmation(
        confirmed({ confirmProductionApply: "" }),
      ),
    ).toMatchObject({ passed: false, reason: "missing_confirmation" });
    expect(
      verifyRegistryApplyConfirmation(confirmed({ secretConfirmation: "" })),
    ).toMatchObject({ passed: false, reason: "missing_confirmation" });
  });

  it("blocks confirm_sha256 when it differs from the audited export", () => {
    expect(
      verifyRegistryApplyConfirmation(
        confirmed({ confirmSha256: "a".repeat(64) }),
      ),
    ).toEqual({ passed: false, reason: "snapshot_sha_mismatch" });
  });

  it("blocks an environment secret that does not equal the audited export", () => {
    expect(
      verifyRegistryApplyConfirmation(
        confirmed({ secretConfirmation: "a".repeat(64) }),
      ),
    ).toEqual({ passed: false, reason: "environment_secret_mismatch" });
  });

  it("blocks a dispatch confirmation that does not equal the secret", () => {
    expect(
      verifyRegistryApplyConfirmation(
        confirmed({ confirmProductionApply: "a".repeat(64) }),
      ),
    ).toEqual({ passed: false, reason: "dispatch_confirmation_mismatch" });
  });

  it("reports only the outcome and never confirmation values", () => {
    const summary = formatRegistryApplyConfirmationSummary(
      verifyRegistryApplyConfirmation(confirmed()),
    );
    expect(summary).toContain("Confirmation gate passed: **true**");
    expect(summary).not.toContain(SHA);
    expect(summary).not.toMatch(/postgres(?:ql)?:\/\//i);
  });
});
