import { describe, expect, it } from "vitest";
import type { Drug } from "@workspace/api-client-react";
import { filterDrugSearchOptions } from "./drug-search-select";

function drug(id: string, brandName: string, inn: string): Drug {
  return {
    id,
    brandName,
    inn,
    atcCode: "M01AE01",
    form: "таблетки",
    dosage: "200 мг",
    pharmacologicalGroup: "НПЗЗ",
    indications: "",
    contraindications: "",
    sideEffects: "",
    warnings: "",
    storage: "",
    source: "test",
  };
}

describe("filterDrugSearchOptions", () => {
  const drugs = [
    drug("1", "НУРОФЕН", "Ібупрофен"),
    drug("2", "ІБУПРОФЕН", "Ібупрофен"),
    drug("3", "ПАРАЦЕТАМОЛ", "Парацетамол"),
  ];

  it("filters the cached dictionary without waiting for another request", () => {
    expect(
      filterDrugSearchOptions(drugs, "ібупрофен").map((item) => item.id),
    ).toEqual(["2", "1"]);
  });

  it("supports punctuation-insensitive brand lookup", () => {
    expect(filterDrugSearchOptions(drugs, "нурофен®")[0]?.id).toBe("1");
  });

  it("returns no options for an empty query", () => {
    expect(filterDrugSearchOptions(drugs, "   ")).toEqual([]);
  });
});
