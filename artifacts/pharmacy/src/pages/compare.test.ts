import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DrugInstruction, RegistryProductResult } from "@workspace/api-client-react";

import {
  ProductComparisonGrid,
  exactComparisonProductSearchParams,
  exactComparisonRegistryProduct,
  exactComparisonInstruction,
} from "./compare";
import type { ComparisonProductRef } from "@/hooks/use-product-comparison";

function product(
  productId: string,
  registrationNumber: string,
  tradeName: string,
  inn: string,
): ComparisonProductRef {
  return {
    productId,
    registrationNumber,
    tradeName,
    inn,
    atcCode: null,
    activeIngredient: inn,
    strength: "10 мг",
    dosageForm: "таблетки",
    manufacturer: "Офіційний виробник",
    nationalListStatus: "exact",
    instructionAvailable: true,
    href: "/products/" + productId + "?registration=" + encodeURIComponent(registrationNumber),
  };
}

function instruction(
  item: ComparisonProductRef,
  sectionPrefix: string,
): DrugInstruction {
  return {
    registryProductId: item.productId,
    registrationNumber: item.registrationNumber,
    sections: {
      indications: sectionPrefix + ": показання",
      contraindications: sectionPrefix + ": протипоказання",
      interactions: sectionPrefix + ": взаємодії",
      specialWarnings: sectionPrefix + ": особливості",
      adverseReactions: null,
      pregnancyAndLactation: null,
      administration: null,
      overdose: null,
      storage: null,
    },
  } as DrugInstruction;
}

const pairs = [
  [
    product("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "UA/10001/01/01", "ЕНАП", "еналаприл"),
    product("BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", "UA/10002/01/01", "ЕНАЛАПРИЛ КРКА", "еналаприл"),
  ],
  [
    product("CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", "UA/13699/01/01", "ЕЛІКВІС", "апіксабан"),
    product("DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD", "UA/14678/01/01", "КСАРЕЛТО", "ривароксабан"),
  ],
  [
    product("EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE", "UA/10005/01/01", "НУРОФЕН", "ібупрофен"),
    product("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF", "UA/10006/01/01", "ІБУПРОФЕН", "ібупрофен"),
  ],
] as const;

describe("exact registry product comparison", () => {
  it("rehydrates only the exact selected productId and registration", () => {
    const [selected] = pairs[0];
    const exact = { id: selected.productId, registration: { number: selected.registrationNumber } } as RegistryProductResult;
    expect(exactComparisonRegistryProduct(selected, [exact])).toBe(exact);
    expect(exactComparisonRegistryProduct(selected, [{ ...exact, registration: { number: pairs[0][1].registrationNumber } }])).toBeNull();
    expect(exactComparisonRegistryProduct(selected, [{ ...exact, id: pairs[0][1].productId }])).toBeNull();
    expect(exactComparisonRegistryProduct(selected, [exact, exact])).toBeNull();
  });

  it("builds the fail-closed exact catalog lookup contract", () => {
    const [selected] = pairs[1];
    expect(exactComparisonProductSearchParams(selected)).toEqual({
      q: selected.registrationNumber,
      productId: selected.productId,
      type: "registry_products",
      view: "grouped",
      page: 1,
      pageSize: 25,
    });
  });
  it.each(pairs)("renders an exact mobile-first registry pair", (left, right) => {
    const html = renderToStaticMarkup(
      createElement(ProductComparisonGrid, {
        products: [left, right],
        instructions: {
          [left.productId]: instruction(left, left.tradeName),
          [right.productId]: instruction(right, right.tradeName),
        },
      }),
    );

    expect(html).toContain(left.tradeName);
    expect(html).toContain(right.tradeName);
    expect(html).toContain(left.registrationNumber);
    expect(html).toContain(right.registrationNumber);
    expect(html).toContain("Показати текст");
    expect(html).toContain("<details");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("overflow-x-hidden");
    expect(html).not.toContain("overflow-x-auto");
    expect(html).not.toContain("<table");
  });

  it("rejects instruction content for another product or registration", () => {
    const [left, right] = pairs[0];
    const wrongProduct = instruction({ ...left, productId: right.productId }, "ЧУЖИЙ ТЕКСТ");
    const wrongRegistration = instruction(
      { ...left, registrationNumber: right.registrationNumber },
      "НЕПРАВИЛЬНА РЕЄСТРАЦІЯ",
    );

    expect(exactComparisonInstruction(left, wrongProduct)).toBeNull();
    expect(exactComparisonInstruction(left, wrongRegistration)).toBeNull();

    const html = renderToStaticMarkup(
      createElement(ProductComparisonGrid, {
        products: [left, right],
        instructions: {
          [left.productId]: wrongProduct,
          [right.productId]: undefined,
        },
      }),
    );
    expect(html).not.toContain("ЧУЖИЙ ТЕКСТ");
    expect(html).toContain("Немає даних");
  });

  it("does not state or infer therapeutic interchangeability", () => {
    const [left, right] = pairs[1];
    const html = renderToStaticMarkup(
      createElement(ProductComparisonGrid, {
        products: [left, right],
        instructions: {},
      }),
    );
    expect(html).not.toContain("взаємозамінні");
    expect(html).not.toContain("Значущих взаємодій не виявлено");
    expect((html.match(/Немає даних/g) ?? []).length).toBeGreaterThan(0);
  });
});