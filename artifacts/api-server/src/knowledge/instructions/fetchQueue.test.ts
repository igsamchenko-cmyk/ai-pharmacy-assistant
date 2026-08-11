import { describe, expect, it } from "vitest";
import type { RegistryRawRow } from "../ingestion";
import type { NationalListEntry } from "../nationalList";
import type { DrugInstructionSnapshot } from "./model";
import {
  buildInstructionFetchQueuePlan,
  evaluateInstructionFetchQueuePlan,
  instructionFetchFailureTransition,
  isParenteralDosageForm,
} from "./fetchQueue";
import { classifyInstructionFetchError } from "./fetchQueueWorker";

function row(input: {
  id: string;
  registrationNumber: string;
  tradeName: string;
  inn: string;
  form: string;
  sourceUrl?: string;
}): RegistryRawRow {
  const registrationKey = input.registrationNumber.replace(/[^A-Z0-9]/giu, "");
  return {
    registryId: input.id,
    tradeName: input.tradeName,
    inn: input.inn,
    activeIngredient: `${input.inn} 10 мг`,
    ingredientParse: {
      rawIngredientExpression: input.inn,
      parsedIngredients: [input.inn],
      ingredientCount: 1,
      combinationProduct: false,
      parseConfidence: "high",
      parseWarnings: [],
      baseIngredientCandidates: [input.inn],
      saltOrDerivativeFlags: [],
    },
    atcCode: "A01AA01",
    form: input.form,
    strength: "10 мг",
    applicantName: "Заявник",
    applicantCountry: "Україна",
    manufacturer: "Виробник",
    country: "Україна",
    manufacturers: [{ name: "Виробник", country: "Україна" }],
    registrationNumber: input.registrationNumber,
    registrationStartDate: "01.01.2025",
    registrationEndDate: "необмежений",
    status: "",
    earlyTermination: "",
    instructionUrl:
      input.sourceUrl ??
      `http://www.drlz.com.ua/ibp/lz_www.nsf/id/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/$file/${registrationKey}_${input.id.slice(0, 4)}.mht`,
    sourceId: "ukraine_state_drug_registry",
    rawIndex: 1,
    warnings: [],
  };
}

function listedEntry(ingredient: string): NationalListEntry {
  return {
    stableKey: `listed-${ingredient.toLowerCase()}`,
    officialNameUa: ingredient,
    officialNameEn: ingredient,
    ingredients: [ingredient],
    compositionSignature: ingredient.toLowerCase(),
    dosageForms: [],
    routes: [],
    strengths: [],
    dosageText: "",
    section: "I",
    category: "test",
    restrictions: "",
    sourceUrl: "https://zakon.rada.gov.ua/laws/show/333-2009-%D0%BF#Text",
    sourceHash: "a".repeat(64),
    sourceLocator: "test",
    reviewStatus: "reviewed",
  };
}

function existingSnapshot(sourceRow: RegistryRawRow): DrugInstructionSnapshot {
  return {
    version: "1.0",
    registryProductId: sourceRow.registryId,
    registrationNumber: sourceRow.registrationNumber,
    tradeName: sourceRow.tradeName,
    inn: sourceRow.inn,
    activeIngredient: sourceRow.activeIngredient,
    dosageForm: sourceRow.form,
    strength: sourceRow.strength,
    manufacturer: sourceRow.manufacturer,
    manufacturerCountry: sourceRow.country,
    registrationStartDate: sourceRow.registrationStartDate,
    registrationEndDate: sourceRow.registrationEndDate,
    status: "available",
    sections: {
      indications: "text",
      contraindications: "text",
      adverseReactions: "text",
      interactions: "text",
      specialWarnings: "text",
      pregnancyAndLactation: "text",
      administration: "text",
      overdose: "text",
      storage: "text",
    },
    source: {
      url: sourceRow.instructionUrl,
      documentId: "A".repeat(32),
      documentDate: null,
      checkedAt: "2026-08-11T00:00:00.000Z",
      documentHash: "b".repeat(64),
      contentLength: 1_000,
      parserVersion: "ua-drlz-mht-v2",
      datasetTitle: "Registry",
      datasetUrl: "https://example.gov.ua/registry",
      license: "official public data",
    },
    provenance: {
      sourceAllowed: true,
      registrationMatched: true,
      contentLocationMatched: true,
      availableSectionCount: 9,
      coveragePct: 100,
    },
    warnings: [],
  };
}

describe("instruction fetch queue planner", () => {
  const parenteral = row({
    id: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    registrationNumber: "UA/1000/01/01",
    tradeName: "ЦЕФТРИАКСОН",
    inn: "Ceftriaxone",
    form: "порошок для розчину для ін'єкцій",
  });
  const nationalList = row({
    id: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    registrationNumber: "UA/2000/01/01",
    tradeName: "МЕТФОРМІН",
    inn: "Metformin",
    form: "таблетки",
  });
  const remainder = row({
    id: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
    registrationNumber: "UA/3000/01/01",
    tradeName: "РЕШТА",
    inn: "Unlisted",
    form: "капсули",
  });

  it("prioritizes parenteral products, then National List and registry remainder", () => {
    const plan = buildInstructionFetchQueuePlan(
      [remainder, nationalList, parenteral],
      [existingSnapshot(parenteral)],
      [listedEntry("Metformin")],
      {
        sourceUrl: "https://example.gov.ua/registry",
        sha256: "c".repeat(64),
        checkedAt: "2026-08-11T00:00:00.000Z",
      },
      3,
    );

    expect(
      plan.candidates.map((candidate) => candidate.priorityReason),
    ).toEqual(["parenteral", "national_list", "registry_remainder"]);
    expect(plan.candidates[0]).toMatchObject({
      status: "fetched",
      fetchedDocumentHash: "b".repeat(64),
    });
    expect(plan.summary).toMatchObject({
      eligibleQueueCount: 3,
      existingSnapshotCount: 1,
      existingCurrentSnapshotCount: 1,
      remainingToTarget: 2,
      parenteralEligibleCount: 1,
      parenteralFetchedCount: 1,
      parenteralCoveragePct: 100,
      nationalListEligibleCount: 1,
      nationalListFetchedCount: 0,
    });
  });

  it("does not classify oral powder as parenteral without an administration marker", () => {
    expect(isParenteralDosageForm("порошок для орального розчину")).toBe(false);
    expect(isParenteralDosageForm("концентрат для розчину для інфузій")).toBe(
      true,
    );
    expect(isParenteralDosageForm("розчин для підшкірного введення")).toBe(
      true,
    );
  });

  it("keeps the exact validated product when a registration number is duplicated", () => {
    const duplicate = row({
      id: "00000000000000000000000000000000",
      registrationNumber: parenteral.registrationNumber,
      tradeName: "ДУБЛЬ РЕЄСТРУ",
      inn: parenteral.inn,
      form: parenteral.form,
    });
    const plan = buildInstructionFetchQueuePlan(
      [duplicate, parenteral],
      [existingSnapshot(parenteral)],
      [],
      {
        sourceUrl: "https://example.gov.ua/registry",
        sha256: "c".repeat(64),
        checkedAt: "2026-08-11T00:00:00.000Z",
      },
      1,
    );

    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]).toMatchObject({
      source: { registryProductId: parenteral.registryId },
      status: "fetched",
    });
    expect(plan.summary).toMatchObject({
      existingCurrentSnapshotCount: 1,
      rejectedDuplicateRegistrationCount: 1,
    });
  });

  it("is deterministic regardless of registry input order", () => {
    const input = {
      sourceUrl: "https://example.gov.ua/registry",
      sha256: "c".repeat(64),
      checkedAt: "2026-08-11T00:00:00.000Z",
    };
    const first = buildInstructionFetchQueuePlan(
      [parenteral, remainder, nationalList],
      [],
      [listedEntry("Metformin")],
      input,
      3,
    );
    const second = buildInstructionFetchQueuePlan(
      [nationalList, parenteral, remainder],
      [],
      [listedEntry("Metformin")],
      input,
      3,
    );
    expect(second.candidates).toEqual(first.candidates);
  });

  it("fails closed when production queue dimensions are anomalous", () => {
    const base = buildInstructionFetchQueuePlan(
      [parenteral, nationalList, remainder],
      [existingSnapshot(parenteral)],
      [listedEntry("Metformin")],
      {
        sourceUrl: "https://example.gov.ua/registry",
        sha256: "c".repeat(64),
        checkedAt: "2026-08-11T00:00:00.000Z",
      },
      3,
    );
    const acceptable = {
      ...base,
      summary: {
        ...base.summary,
        registryRowCount: 16_000,
        eligibleQueueCount: 8_000,
        existingSnapshotCount: 200,
        existingCurrentSnapshotCount: 190,
        parenteralEligibleCount: 1_000,
        nationalListEligibleCount: 1_000,
        rejectedInvalidMetadataCount: 25,
        targetReachable: true,
      },
    };
    expect(evaluateInstructionFetchQueuePlan(acceptable)).toEqual({
      ready: true,
      blockers: [],
    });

    const anomalous = {
      ...acceptable,
      summary: {
        ...acceptable.summary,
        registryRowCount: 15_999,
        existingCurrentSnapshotCount: 189,
        rejectedInvalidMetadataCount: 26,
        targetReachable: false,
      },
    };
    expect(evaluateInstructionFetchQueuePlan(anomalous)).toEqual({
      ready: false,
      blockers: [
        "registry_row_count_below_16000",
        "existing_current_snapshot_count_below_190",
        "invalid_metadata_count_above_25",
        "instruction_queue_target_unreachable",
      ],
    });
  });
});

describe("instruction fetch queue failures", () => {
  it("schedules bounded retries and terminates non-retryable failures", () => {
    const now = new Date("2026-08-11T00:00:00.000Z");
    expect(
      instructionFetchFailureTransition({
        attempts: 1,
        maxAttempts: 3,
        retryable: true,
        now,
      }),
    ).toEqual({
      status: "pending",
      nextAttemptAt: new Date("2026-08-11T00:01:00.000Z"),
    });
    expect(
      instructionFetchFailureTransition({
        attempts: 1,
        maxAttempts: 3,
        retryable: false,
        now,
      }),
    ).toEqual({ status: "parse_failed", nextAttemptAt: null });
    expect(
      instructionFetchFailureTransition({
        attempts: 3,
        maxAttempts: 3,
        retryable: true,
        now,
      }),
    ).toEqual({ status: "parse_failed", nextAttemptAt: null });
  });

  it("retries network errors but not validation errors", () => {
    expect(classifyInstructionFetchError(new TypeError("network"))).toEqual({
      code: "download_network_error",
      retryable: true,
    });
    expect(
      classifyInstructionFetchError(new Error("provenance_validation_failed")),
    ).toEqual({
      code: "provenance_validation_failed",
      retryable: false,
    });
  });
});
