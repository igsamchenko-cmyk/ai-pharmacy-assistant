import { describe, expect, it } from "vitest";
import {
  atcSubgroup,
  buildAnalogCoverageReport,
  resolveAnalogMode,
  type AnalogCoverageRow,
} from "./analogCoverage";

function row(overrides: Partial<AnalogCoverageRow> = {}): AnalogCoverageRow {
  return {
    registrationNumber: "UA/1/01/01",
    tradeName: "ПРЕПАРАТ",
    inn: "Ібупрофен",
    activeIngredient: "",
    atcCode: "M01AE01",
    ...overrides,
  };
}

describe("resolveAnalogMode", () => {
  it("mirrors what the analogs tab will show", () => {
    // A real substance groups by МНН and never consults the price catalog.
    expect(resolveAnalogMode(row(), "")).toBe("inn");
    // РЕГІДРОН: the registry stores the literal placeholder "Comb drug", so the
    // МОЗ price catalog composition is what makes the group real.
    expect(
      resolveAnalogMode(
        row({ inn: "Comb drug", registrationNumber: "UA/2065/01/01" }),
        "глюкоза;каліюхлорид;натріюхлорид;натріюцитрат",
      ),
    ).toBe("composition");
    // КОРВАЛОЛ: names one substance plus an unresolved class.
    expect(
      resolveAnalogMode(
        row({ inn: "Barbiturates in combination with other drugs" }),
        "",
      ),
    ).toBe("inn_class");
    // A placeholder with no composition shows nothing at all — the gap this
    // report exists to size.
    expect(resolveAnalogMode(row({ inn: "Comb drug" }), "")).toBe("unresolved");
  });

  it("falls back to the active ingredient exactly as the client does", () => {
    expect(
      resolveAnalogMode(row({ inn: "", activeIngredient: "Парацетамол" }), ""),
    ).toBe("inn");
  });
});

describe("atcSubgroup", () => {
  it("keeps the therapeutic subgroup and rejects malformed codes", () => {
    expect(atcSubgroup("N02BE01")).toBe("N02B");
    expect(atcSubgroup("m01ae01")).toBe("M01A");
    expect(atcSubgroup("")).toBe("");
    expect(atcSubgroup("не вказано")).toBe("");
  });
});

describe("buildAnalogCoverageReport", () => {
  it("counts every position by what the pharmacist will actually get", () => {
    const report = buildAnalogCoverageReport(
      [
        row(),
        row({ inn: "Comb drug", registrationNumber: "UA/2065/01/01" }),
        row({ inn: "Comb drug", registrationNumber: "UA/9/09/09" }),
        row({ inn: "Timolol, combinations" }),
      ],
      new Map([["UA/2065/01/01", "глюкоза;каліюхлорид"]]),
    );
    expect(report.resolution).toEqual({
      inn: 1,
      composition: 1,
      inn_class: 1,
      unresolved: 1,
    });
    expect(report.totals).toEqual({ products: 4, withCompositionKey: 1 });
    expect(report.unresolvedSample).toEqual([
      {
        registrationNumber: "UA/9/09/09",
        tradeName: "ПРЕПАРАТ",
        inn: "Comb drug",
      },
    ]);
  });

  it("surfaces an unknown placeholder by its therapeutic incoherence", () => {
    // The next "Comb drug" will not be found by hand. A label attached to
    // products across unrelated ATC subgroups is not naming a substance.
    const spread = Array.from({ length: 14 }, (_, index) =>
      row({
        inn: "Комбінований препарат",
        atcCode: `${"ABCDEFGHJLMNPR"[index]}0${index % 9}A${index % 9}1`,
        tradeName: `БРЕНД ${index}`,
      }),
    );
    const report = buildAnalogCoverageReport(
      [...spread, ...Array.from({ length: 20 }, () => row())],
      new Map(),
    );
    expect(report.suspectedPlaceholders).toHaveLength(1);
    expect(report.suspectedPlaceholders[0]?.inn).toBe("Комбінований препарат");
    expect(
      report.suspectedPlaceholders[0]?.distinctAtcSubgroups,
    ).toBeGreaterThanOrEqual(6);
  });

  it("never flags a real INN that simply has many products in one subgroup", () => {
    // Ібупрофен really does have ~120 registrations; size alone is not evidence.
    const report = buildAnalogCoverageReport(
      Array.from({ length: 120 }, (_, index) =>
        row({ tradeName: `ІБУПРОФЕН ${index}` }),
      ),
      new Map(),
    );
    expect(report.suspectedPlaceholders).toEqual([]);
  });
});
