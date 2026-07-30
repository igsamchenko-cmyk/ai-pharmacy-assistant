import { describe, expect, it } from "vitest";
import { checkReimbursement } from "./catalog";

const CHECKED_AT = new Date("2026-07-29T00:00:00.000Z");

describe("NSZU reimbursement catalog", () => {
  it("selects the only exact package for a registration number", () => {
    const result = checkReimbursement("UA/16891/01/01", undefined, {
      now: CHECKED_AT,
    });

    expect(result).toMatchObject({
      status: "listed",
      registrationNumber: "UA/16891/01/01",
      selected: {
        packageKey: "nszu-0ea2749e0286062db95d904a",
        tradeName: "АЗИТЕР®",
        copayUah: "0.00",
      },
      source: { recordCount: 1_009, freshness: "current" },
    });
  });

  it("requires an exact package when one registration has several rows", () => {
    const ambiguous = checkReimbursement("UA/20616/01/01", undefined, {
      now: CHECKED_AT,
    });

    expect(ambiguous.status).toBe("requires_package");
    expect(ambiguous.selected).toBeNull();
    expect(ambiguous.candidates.length).toBeGreaterThan(1);

    const selected = checkReimbursement(
      "UA/20616/01/01",
      "nszu-1a2a107e9db901fa5beac55a",
      { now: CHECKED_AT },
    );
    expect(selected.status).toBe("listed");
    expect(selected.selected?.packageKey).toBe("nszu-1a2a107e9db901fa5beac55a");
  });

  it("never turns an unknown registration into a positive result", () => {
    const result = checkReimbursement("UA/999999/99/99", undefined, {
      now: CHECKED_AT,
    });

    expect(result.status).toBe("not_listed");
    expect(result.selected).toBeNull();
    expect(result.candidates).toEqual([]);
  });
});
