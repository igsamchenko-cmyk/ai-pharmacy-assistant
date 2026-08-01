import { describe, expect, it } from "vitest";
import { GetInteractionInstructionSignalsResponse } from "@workspace/api-zod";
import type { DrugInstructionSnapshot } from "../../knowledge/instructions/model";
import {
  RegistryInteractionSelectionError,
  type RegistryInteractionCatalogProduct,
} from "../interactionService";
import { getInteractionInstructionSignals } from "../interactionInstructionSignalService";

const WARFARIN_ID = "A".repeat(32);
const IBUPROFEN_ID = "B".repeat(32);

function product(
  id: string,
  registration: string,
  tradeName: string,
  inn: string,
  mappingStatus: "approved" | "unmapped" = "approved",
): RegistryInteractionCatalogProduct {
  return {
    id,
    tradeName,
    inn,
    activeIngredient: inn,
    atcCode: inn === "Ibuprofen" ? "M01AE01" : "B01AA03",
    dosageForm: "tablets",
    strength: "10 mg",
    registration: { number: registration },
    mappingStatus,
    approvedMapping: mappingStatus === "approved" ? { inn } : null,
  };
}

function snapshot(
  id: string,
  registrationNumber: string,
  tradeName: string,
  inn: string,
  interactions: string,
  hashCharacter: string,
): DrugInstructionSnapshot {
  return {
    version: "1.0",
    registryProductId: id,
    registrationNumber,
    tradeName,
    inn,
    activeIngredient: inn,
    dosageForm: "tablets",
    strength: "10 mg",
    manufacturer: "Official manufacturer",
    manufacturerCountry: "Ukraine",
    registrationStartDate: "01.01.2024",
    registrationEndDate: "unlimited",
    status: "available",
    sections: {
      indications: null,
      contraindications: null,
      adverseReactions: null,
      interactions,
      specialWarnings: null,
      pregnancyAndLactation: null,
      administration: null,
      overdose: null,
      storage: null,
    },
    source: {
      url: `https://www.drlz.com.ua/ibp/lz_www.nsf/id/${hashCharacter.repeat(32)}/$file/${registrationNumber.replace(/\//gu, "")}_${hashCharacter.repeat(4)}.mht`,
      documentId: hashCharacter.repeat(32),
      documentDate: "2026-07-01T00:00:00.000Z",
      checkedAt: "2026-08-01T00:00:00.000Z",
      documentHash: hashCharacter.toLowerCase().repeat(64),
      contentLength: 2_000,
      parserVersion: "ua-drlz-mht-v1",
      datasetTitle: "State Register",
      datasetUrl: "https://data.gov.ua/dataset/example",
      license: "CC BY 4.0",
    },
    provenance: {
      sourceAllowed: true,
      registrationMatched: true,
      contentLocationMatched: true,
      availableSectionCount: 1,
      coveragePct: 11,
    },
    warnings: [],
  };
}

const products = new Map<string, RegistryInteractionCatalogProduct>([
  [WARFARIN_ID, product(WARFARIN_ID, "UA/1000/01/01", "WARFARIN", "Warfarin")],
  [
    IBUPROFEN_ID,
    product(IBUPROFEN_ID, "UA/2000/01/01", "IBUPROFEN", "Ibuprofen"),
  ],
]);

const references = [
  { productId: WARFARIN_ID, registrationNumber: "UA/1000/01/01" },
  { productId: IBUPROFEN_ID, registrationNumber: "UA/2000/01/01" },
];

describe("interaction instruction signals", () => {
  it("finds an exact ingredient mention without promoting it to a runtime rule", async () => {
    const snapshots = new Map<string, DrugInstructionSnapshot>([
      [
        WARFARIN_ID,
        snapshot(
          WARFARIN_ID,
          "UA/1000/01/01",
          "WARFARIN",
          "Warfarin",
          "Concomitant use with ibuprofen should be avoided and monitored.",
          "C",
        ),
      ],
      [
        IBUPROFEN_ID,
        snapshot(
          IBUPROFEN_ID,
          "UA/2000/01/01",
          "IBUPROFEN",
          "Ibuprofen",
          "Refer to the official prescribing information.",
          "D",
        ),
      ],
    ]);

    const result = await getInteractionInstructionSignals(references, {
      resolveProduct: async (reference) =>
        products.get(reference.productId) ?? null,
      loadInstruction: async (id) => snapshots.get(id) ?? null,
      rules: [],
    });

    expect(result.coverage).toMatchObject({
      selectedCount: 2,
      instructionAvailableCount: 2,
      evaluatedIngredientPairs: 1,
      signalPairCount: 1,
      candidateCount: 1,
    });
    expect(GetInteractionInstructionSignalsResponse.parse(result)).toEqual(
      result,
    );
    expect(result.pairs[0]).toMatchObject({
      status: "signals_found",
      signals: [
        {
          ingredientA: "Ibuprofen",
          ingredientB: "Warfarin",
          matchBasis: "exact_ingredient",
          classMatch: null,
          triageSignal: "avoidance_language",
          reviewStatus: "needs_review",
        },
      ],
    });
    expect(result.disclaimer).toContain("не підтверджує сумісність");
  });

  it("links an instruction class phrase to the other exact product through official ATC", async () => {
    const snapshots = new Map<string, DrugInstructionSnapshot>([
      [
        WARFARIN_ID,
        snapshot(
          WARFARIN_ID,
          "UA/1000/01/01",
          "WARFARIN",
          "Warfarin",
          "Слід уникати одночасного застосування з нестероїдними протизапальними засобами.",
          "E",
        ),
      ],
    ]);

    const result = await getInteractionInstructionSignals(references, {
      resolveProduct: async (reference) =>
        products.get(reference.productId) ?? null,
      loadInstruction: async (id) => snapshots.get(id) ?? null,
      rules: [],
    });

    expect(GetInteractionInstructionSignalsResponse.parse(result)).toEqual(
      result,
    );
    expect(result.pairs[0]).toMatchObject({
      status: "signals_found",
      signals: [
        {
          matchBasis: "official_atc_class",
          reviewStatus: "needs_review",
          classMatch: {
            classId: "class:nsaids",
            matchedProductId: IBUPROFEN_ID,
            matchedProductName: "IBUPROFEN",
            atcCode: "M01AE01",
            matchedAtcRule: "M01A",
            basis: "official_atc_prefix",
            sourceVersion: "ATC/DDD Index 2026",
          },
        },
      ],
    });
  });

  it("does not infer unsupported CYP membership from ATC", async () => {
    const result = await getInteractionInstructionSignals(references, {
      resolveProduct: async (reference) =>
        products.get(reference.productId) ?? null,
      loadInstruction: async (id) =>
        id === WARFARIN_ID
          ? snapshot(
              WARFARIN_ID,
              "UA/1000/01/01",
              "WARFARIN",
              "Warfarin",
              "Use with CYP3A4 inhibitors requires monitoring.",
              "F",
            )
          : null,
      rules: [],
    });

    expect(result.pairs[0]).toMatchObject({
      status: "no_signal_in_loaded_instructions",
      signals: [],
    });
  });

  it("does not infer class membership when the selected product has no ATC", async () => {
    const noAtcProducts = new Map(products);
    noAtcProducts.set(IBUPROFEN_ID, {
      ...noAtcProducts.get(IBUPROFEN_ID)!,
      atcCode: null,
    });
    const result = await getInteractionInstructionSignals(references, {
      resolveProduct: async (reference) =>
        noAtcProducts.get(reference.productId) ?? null,
      loadInstruction: async (id) =>
        id === WARFARIN_ID
          ? snapshot(
              WARFARIN_ID,
              "UA/1000/01/01",
              "WARFARIN",
              "Warfarin",
              "NSAIDs should be avoided.",
              "G",
            )
          : null,
      rules: [],
    });

    expect(result.pairs[0]).toMatchObject({
      status: "no_signal_in_loaded_instructions",
      signals: [],
    });
  });

  it("fails open for instruction download errors without inventing evidence", async () => {
    const result = await getInteractionInstructionSignals(references, {
      resolveProduct: async (reference) =>
        products.get(reference.productId) ?? null,
      loadInstruction: async () => {
        throw new Error("network unavailable");
      },
      rules: [],
    });

    expect(result.pairs[0]).toMatchObject({
      status: "instructions_unavailable",
      signals: [],
    });
    expect(result.coverage.instructionAvailableCount).toBe(0);
  });

  it("does not infer signals when an exact composition is unresolved", async () => {
    const unresolvedProducts = new Map(products);
    unresolvedProducts.set(
      IBUPROFEN_ID,
      product(
        IBUPROFEN_ID,
        "UA/2000/01/01",
        "IBUPROFEN",
        "Ibuprofen",
        "unmapped",
      ),
    );

    const result = await getInteractionInstructionSignals(references, {
      resolveProduct: async (reference) =>
        unresolvedProducts.get(reference.productId) ?? null,
      loadInstruction: async () => null,
      rules: [],
    });

    expect(result.pairs[0]).toMatchObject({
      status: "composition_unresolved",
      signals: [],
    });
    expect(result.coverage.evaluatedIngredientPairs).toBe(0);
  });

  it("rejects a duplicate exact registry position", async () => {
    await expect(
      getInteractionInstructionSignals([references[0]!, references[0]!], {
        resolveProduct: async (reference) =>
          products.get(reference.productId) ?? null,
        loadInstruction: async () => null,
        rules: [],
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<RegistryInteractionSelectionError>>({
        code: "duplicate_product",
      }),
    );
  });
});
