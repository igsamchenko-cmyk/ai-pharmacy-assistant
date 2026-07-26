import { describe, expect, it } from "vitest";
import { CheckInteractionsResponse } from "@workspace/api-zod";
import {
  INTERACTION_DISCLAIMER,
  RegistryInteractionSelectionError,
  checkInteractions,
  checkRegistryInteractions,
  type RegistryInteractionCatalogProduct,
  type RegistryInteractionProductRef,
} from "../interactionService";
import {
  normalizedInteractionPairKey,
  type VerifiedInteractionRule,
} from "../../interactions/model";

const WARFARIN_ID = "A".repeat(32);
const IBUPROFEN_ID = "B".repeat(32);
const ENALAPRIL_ID = "C".repeat(32);

function catalogProduct(
  id: string,
  registrationNumber: string,
  tradeName: string,
  inn: string,
  overrides: Partial<RegistryInteractionCatalogProduct> = {},
): RegistryInteractionCatalogProduct {
  return {
    id,
    tradeName,
    inn,
    activeIngredient: inn,
    dosageForm: "таблетки",
    strength: "10 мг",
    registration: { number: registrationNumber },
    mappingStatus: "approved",
    approvedMapping: { inn },
    ...overrides,
  };
}

function approvedRule(a: string, b: string): VerifiedInteractionRule {
  return {
    id: "reviewed-rule",
    ingredientA: a,
    ingredientB: b,
    pairKey: normalizedInteractionPairKey(a, b),
    directionality: "symmetric",
    therapeuticGroupsA: [],
    therapeuticGroupsB: [],
    severity: "major",
    clinicalEffect: "Підтверджений тестовий клінічний ефект.",
    mechanism: "Підтверджений тестовий механізм.",
    explanation: "Пояснення з перевіреного джерела.",
    actionCategory: "specialist_review",
    evidenceLevel: "established",
    source: {
      key: "official-regulatory-interaction-source",
      label: "Official test source",
      url: "https://example.invalid/official-interaction",
      documentReference: null,
      version: "2026-01",
      publishedAt: "2026-01-01",
      accessedAt: "2026-07-26",
    },
    reviewStatus: "approved",
    reviewedAt: "2026-07-26",
    unresolvedConflict: false,
    provenance: {
      datasetVersion: "reviewed-test-v1",
      importedAt: null,
      origin: "curated",
      sourceRecordId: "source-record-1",
    },
    populationContext: null,
  };
}

function resolver(products: readonly RegistryInteractionCatalogProduct[]) {
  return async (reference: RegistryInteractionProductRef) =>
    products.find(
      (product) =>
        product.id === reference.productId &&
        product.registration.number === reference.registrationNumber,
    ) ?? null;
}

const warfarin = catalogProduct(
  WARFARIN_ID,
  "UA/1000/01/01",
  "ВАРФАРИН-ТЕСТ",
  "Варфарин",
);
const ibuprofen = catalogProduct(
  IBUPROFEN_ID,
  "UA/2000/01/01",
  "ІБУПРОФЕН-ТЕСТ",
  "Ібупрофен",
);
const enalapril = catalogProduct(
  ENALAPRIL_ID,
  "UA/3000/01/01",
  "ЕНАЛАПРИЛ-ТЕСТ",
  "Еналаприл",
);

const refs = (products: readonly RegistryInteractionCatalogProduct[]) =>
  products.map((product) => ({
    productId: product.id,
    registrationNumber: product.registration.number,
  }));

describe("legacy interactionService.checkInteractions", () => {
  it("retains the demo-only beta scenario behavior", () => {
    const result = checkInteractions(["warfarin-5", "ibuprofen-200"]);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]?.riskLevel).toBe("critical");
    expect(result.disclaimer).toBe(INTERACTION_DISCLAIMER);
  });
});

describe("registry interaction checks", () => {
  it("uses exact productId plus registration and returns every selected pair", async () => {
    const result = await checkRegistryInteractions(
      refs([warfarin, ibuprofen, enalapril]),
      {
        resolveProduct: resolver([warfarin, ibuprofen, enalapril]),
        rules: [],
      },
    );

    expect(result.products.map((product) => product.productId)).toEqual([
      WARFARIN_ID,
      IBUPROFEN_ID,
      ENALAPRIL_ID,
    ]);
    expect(CheckInteractionsResponse.parse(result)).toEqual(result);
    expect(result.pairs).toHaveLength(3);
    expect(
      result.pairs.every((pair) => pair.status === "insufficient_evidence"),
    ).toBe(true);
    expect(result.pairs[0]?.message).toContain("не гарантує сумісність");
  });

  it("returns verified evidence only from an eligible reviewed rule", async () => {
    const result = await checkRegistryInteractions(
      refs([warfarin, ibuprofen]),
      {
        resolveProduct: resolver([warfarin, ibuprofen]),
        rules: [approvedRule("Варфарин", "Ібупрофен")],
      },
    );

    expect(result.pairs[0]?.status).toBe("verified_interaction");
    expect(result.pairs[0]?.findings).toHaveLength(1);
    expect(result.pairs[0]?.findings[0]?.source).toMatchObject({
      label: "Official test source",
      reviewedAt: "2026-07-26",
    });
    expect(result.coverage.runtimeEligibleRules).toBe(1);
  });

  it("uses the reviewed registry batch in the default runtime path", async () => {
    const resolvedWarfarin = catalogProduct(
      WARFARIN_ID,
      "UA/1000/01/01",
      "ВАРФАРИН-ТЕСТ",
      "Warfarin",
    );
    const resolvedIbuprofen = catalogProduct(
      IBUPROFEN_ID,
      "UA/2000/01/01",
      "ІБУПРОФЕН-ТЕСТ",
      "Ibuprofen",
    );
    const result = await checkRegistryInteractions(
      refs([resolvedWarfarin, resolvedIbuprofen]),
      { resolveProduct: resolver([resolvedWarfarin, resolvedIbuprofen]) },
    );

    expect(result.pairs[0]?.status).toBe("verified_interaction");
    expect(result.pairs[0]?.findings[0]?.source.label).toContain("DailyMed");
  });

  it("does not activate unreviewed legacy-style medical content", async () => {
    const pending = approvedRule("Варфарин", "Ібупрофен");
    pending.reviewStatus = "needs_review";
    pending.reviewedAt = null;
    const result = await checkRegistryInteractions(
      refs([warfarin, ibuprofen]),
      {
        resolveProduct: resolver([warfarin, ibuprofen]),
        rules: [pending],
      },
    );

    expect(result.pairs[0]?.status).toBe("insufficient_evidence");
    expect(result.pairs[0]?.findings).toEqual([]);
    expect(result.coverage.runtimeEligibleRules).toBe(0);
  });

  it("fails closed for unmapped and combination expressions", async () => {
    const combination = catalogProduct(
      "D".repeat(32),
      "UA/4000/01/01",
      "КОМБІНАЦІЯ-ТЕСТ",
      "Компонент A + Компонент B",
      {
        mappingStatus: "ambiguous",
        approvedMapping: null,
      },
    );
    const result = await checkRegistryInteractions(
      refs([combination, ibuprofen]),
      {
        resolveProduct: resolver([combination, ibuprofen]),
        rules: [approvedRule("Компонент A", "Ібупрофен")],
      },
    );

    expect(result.products[0]?.ingredientResolution).toBe("unresolved");
    expect(result.pairs[0]?.status).toBe("incomplete_composition");
    expect(result.pairs[0]?.findings).toEqual([]);
  });

  it("identifies the same approved ingredient without claiming interchangeability", async () => {
    const secondWarfarin = catalogProduct(
      "E".repeat(32),
      "UA/5000/01/01",
      "ІНШИЙ ВАРФАРИН",
      "Варфарин",
    );
    const result = await checkRegistryInteractions(
      refs([warfarin, secondWarfarin]),
      {
        resolveProduct: resolver([warfarin, secondWarfarin]),
        rules: [],
      },
    );

    expect(result.pairs[0]?.status).toBe("same_ingredient");
    expect(result.pairs[0]?.duplicateIngredients).toEqual(["Варфарин"]);
    expect(result.pairs[0]?.message).toContain(
      "не є висновком про взаємозамінність",
    );
  });

  it("rejects duplicate products and mismatched registrations", async () => {
    await expect(
      checkRegistryInteractions([refs([warfarin])[0], refs([warfarin])[0]], {
        resolveProduct: resolver([warfarin]),
        rules: [],
      }),
    ).rejects.toMatchObject({ code: "duplicate_product" });

    await expect(
      checkRegistryInteractions(
        [
          { productId: WARFARIN_ID, registrationNumber: "UA/9999/01/01" },
          refs([ibuprofen])[0],
        ],
        { resolveProduct: resolver([warfarin, ibuprofen]), rules: [] },
      ),
    ).rejects.toBeInstanceOf(RegistryInteractionSelectionError);
  });

  it("does not leak secrets or local paths", async () => {
    const result = await checkRegistryInteractions(
      refs([warfarin, ibuprofen]),
      {
        resolveProduct: resolver([warfarin, ibuprofen]),
        rules: [],
      },
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toMatch(/[A-Z]:\\|\/home\//);
  });
});
