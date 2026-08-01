import { describe, expect, it } from "vitest";
import {
  extractAtcCodes,
  interactionClassMembershipPolicy,
  resolveInteractionClassMembership,
} from "../classMembership";

const IBUPROFEN = {
  id: "B".repeat(32),
  tradeName: "IBUPROFEN",
  atcCode: "M01AE01",
  dosageForm: "tablets",
};

describe("interaction class membership", () => {
  it("maps only a supported official ATC prefix", () => {
    expect(
      resolveInteractionClassMembership("class:nsaids", IBUPROFEN),
    ).toMatchObject({
      classId: "class:nsaids",
      atcCode: "M01AE01",
      matchedAtcRule: "M01A",
      basis: "official_atc_prefix",
      sourceVersion: "ATC/DDD Index 2026",
    });
    expect(
      resolveInteractionClassMembership("class:cyp3a4-inhibitors", IBUPROFEN),
    ).toBeNull();
    expect(interactionClassMembershipPolicy).toMatchObject({
      candidateOnly: true,
      changesRuntimeRules: false,
      unsupportedClassesAreNotInferred: true,
    });
  });

  it("requires an oral form for the broad oral-anticoagulant phrase", () => {
    const rivaroxaban = {
      id: "C".repeat(32),
      tradeName: "RIVAROXABAN",
      atcCode: "B01AF01",
      dosageForm: "tablets",
    };
    expect(
      resolveInteractionClassMembership(
        "class:oral-anticoagulants",
        rivaroxaban,
      ),
    ).toMatchObject({
      matchedAtcRule: "B01AF",
      basis: "official_atc_and_oral_form",
    });
    expect(
      resolveInteractionClassMembership("class:oral-anticoagulants", {
        ...rivaroxaban,
        dosageForm: "solution for injection",
      }),
    ).toBeNull();
  });

  it("covers both official potassium-sparing ATC branches", () => {
    for (const atcCode of ["C03DA01", "C03EA01"]) {
      expect(
        resolveInteractionClassMembership("class:potassium-sparing-diuretics", {
          id: "D".repeat(32),
          tradeName: "TEST",
          atcCode,
          dosageForm: "tablets",
        }),
      ).toMatchObject({ atcCode, matchedAtcRule: atcCode.slice(0, 4) });
    }
  });

  it("extracts multiple exact ATC codes and ignores malformed text", () => {
    expect(extractAtcCodes("M01AE01; B01AA03 / invalid")).toEqual([
      "M01AE01",
      "B01AA03",
    ]);
    expect(extractAtcCodes(null)).toEqual([]);
  });
});
