import { describe, expect, it } from "vitest";
import type { RegistryRawRow } from "../ingestion";
import type { InstructionSourceProduct } from "./model";
import {
  buildInstructionExpansionPlan,
  literalStrengthFromRegistryRow,
} from "./expansion";

function row(
  id: string,
  registrationNumber: string,
  tradeName: string,
  inn: string,
  options: { sourceUrl?: string; registrationEndDate?: string } = {},
): RegistryRawRow {
  const registrationKey = registrationNumber.replace(/[^A-Z0-9]/giu, "");
  return {
    registryId: id,
    tradeName,
    inn,
    activeIngredient: `${inn} 10 мг`,
    ingredientParse: {
      rawIngredientExpression: inn,
      parsedIngredients: [inn],
      ingredientCount: 1,
      combinationProduct: false,
      parseConfidence: "high",
      parseWarnings: [],
      baseIngredientCandidates: [inn],
      saltOrDerivativeFlags: [],
    },
    atcCode: "A01AA01",
    form: "таблетки по 10 мг",
    strength: "10 мг",
    applicantName: "Заявник",
    applicantCountry: "Україна",
    manufacturer: "Виробник",
    country: "Україна",
    manufacturers: [{ name: "Виробник", country: "Україна" }],
    registrationNumber,
    registrationStartDate: "01.01.2025",
    registrationEndDate: options.registrationEndDate ?? "необмежений",
    status: "",
    earlyTermination: "",
    instructionUrl:
      options.sourceUrl ??
      `http://www.drlz.com.ua/ibp/lz_www.nsf/id/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/$file/${registrationKey}_${id.slice(0, 4)}.mht`,
    sourceId: "ukraine_state_drug_registry",
    rawIndex: 1,
    warnings: [],
  };
}

function retainedSource(sourceRow: RegistryRawRow): InstructionSourceProduct {
  return {
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
    sourceUrl: sourceRow.instructionUrl,
  };
}

describe("official instruction expansion plan", () => {
  const retainedRow = row(
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "UA/1000/01/01",
    "МЕТФОРМІН",
    "Metformin",
  );
  const registryRows = [
    retainedRow,
    row(
      "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      "UA/2000/01/01",
      "КСАРЕЛТО®",
      "Rivaroxaban",
    ),
    row(
      "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
      "UA/3000/01/01",
      "АЛЬФА",
      "Common ingredient",
    ),
    row(
      "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
      "UA/3001/01/01",
      "БЕТА",
      "Common ingredient",
    ),
    row(
      "EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE",
      "UA/4000/01/01",
      "ГАММА",
      "Rare ingredient",
    ),
    row(
      "77777777777777777777777777777777",
      "UA/4500/01/01",
      "СЛУЖБОВИЙ МНН",
      "Mono",
    ),
    row(
      "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
      "UA/5000/01/01",
      "НЕВАЛІДНИЙ URL",
      "Rejected ingredient",
      { sourceUrl: "https://example.com/instruction.mht" },
    ),
  ];

  it("extracts only a literal strength expression from official registry text", () => {
    const infusion = row(
      "99999999999999999999999999999999",
      "UA/9999/01/01",
      "ІНФУЗІЯ",
      "Example",
    );
    infusion.strength = "";
    infusion.form = "розчин для інфузій, 400 мг/100 мл, по 1 флакону";
    expect(literalStrengthFromRegistryRow(infusion)).toBe("400 мг/100 мл");

    infusion.form = "таблетки, вкриті оболонкою, 875 мг/125 мг";
    expect(literalStrengthFromRegistryRow(infusion)).toBe("875 мг/125 мг");

    infusion.form = "таблетки без зазначеного дозування";
    infusion.activeIngredient = "речовина без кількісного складу";
    expect(literalStrengthFromRegistryRow(infusion)).toBeNull();
  });

  it("retains exact products, prioritizes operational names and then broad INN coverage", () => {
    const plan = buildInstructionExpansionPlan(
      registryRows,
      [retainedSource(retainedRow)],
      4,
    );

    expect(plan).toMatchObject({
      retainedCount: 1,
      retainedInCurrentRegistry: 1,
      requiredAcceptedCount: 3,
      eligibleDistinctInnCount: 3,
      rejectedNonStructuredSourceCount: 1,
      rejectedNonSpecificInnCount: 1,
    });
    expect(plan.candidates[0]).toMatchObject({
      priorityReason: "operational_search",
      priorityQuery: "ксарелто",
      source: { tradeName: "КСАРЕЛТО®" },
    });
    expect(plan.candidates.slice(1, 3).map((item) => item.source.inn)).toEqual([
      "Common ingredient",
      "Rare ingredient",
    ]);
  });

  it("is deterministic and rejects an invalid target", () => {
    const retained = [retainedSource(retainedRow)];
    const first = buildInstructionExpansionPlan(registryRows, retained, 4);
    const second = buildInstructionExpansionPlan(registryRows, retained, 4);
    expect(second.candidates).toEqual(first.candidates);
    expect(() =>
      buildInstructionExpansionPlan(registryRows, retained, 0),
    ).toThrow("instruction_expansion_target_invalid");
  });
});
