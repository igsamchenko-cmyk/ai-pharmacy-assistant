import { describe, expect, it } from "vitest";
import { BLOCKED_MESSAGE, GLOBAL_DISCLAIMER, isTreatmentRequest } from "../safety";
import { generateSummary } from "../aiService";

describe("closed beta safety hardening", () => {
  it("blocks treatment requests about fever", () => {
    expect(isTreatmentRequest("що приймати при температурі")).toBe(true);
  });

  it("blocks pediatric dose requests", () => {
    expect(isTreatmentRequest("яка доза дитині")).toBe(true);
  });

  it("blocks medication cancellation requests", () => {
    expect(isTreatmentRequest("чи можна скасувати препарат")).toBe(true);
  });

  it("allows informational instruction explanation", () => {
    expect(isTreatmentRequest("поясни інструкцію до препарату")).toBe(false);
  });

  it("explains allowed use and urgent escalation in blocked copy", () => {
    expect(BLOCKED_MESSAGE).toContain("довідник");
    expect(BLOCKED_MESSAGE).toContain("екстреної допомоги");
  });

  it("keeps the global disclaimer present on blocked AI summaries", async () => {
    const result = await generateSummary({
      query: "що приймати при температурі",
    });
    expect(result.blocked).toBe(true);
    expect(result.disclaimer).toBe(GLOBAL_DISCLAIMER);
    expect(result.blockedMessage).toBe(BLOCKED_MESSAGE);
  });
});

