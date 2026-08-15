import { describe, expect, it } from "vitest";
import type { DrugRef } from "@/hooks/use-favorites";
import {
  buildQuickProductChips,
  quickProductChipLabel,
} from "./quick-product-chips";

function card(id: string, name: string, dosage = ""): DrugRef {
  return {
    id,
    brandName: name,
    inn: "МНН",
    dosage,
    registration: "UA/1/01/01",
    href: `/products/${id}?registration=UA%2F1%2F01%2F01`,
  };
}

describe("quick product card chips", () => {
  it("puts favorites first, deduplicates and limits the result to five", () => {
    const favorite = card("A".repeat(32), "Обраний", "10 мг");
    const recent = Array.from({ length: 6 }, (_, index) =>
      card(String(index).repeat(32), `Недавній ${index}`),
    );
    expect(
      buildQuickProductChips([favorite], [recent[0]!, favorite, ...recent]),
    ).toEqual([favorite, recent[0], recent[1], recent[2], recent[3]]);
  });

  it("excludes legacy IDs that would require an intermediate search screen", () => {
    const legacy: DrugRef = {
      id: "demo-1",
      brandName: "Демо",
      inn: "",
      href: "/drug/demo-1",
    };
    expect(buildQuickProductChips([], [legacy])).toEqual([]);
  });

  it("labels a card with its dosage when available", () => {
    expect(
      quickProductChipLabel(card("B".repeat(32), "Креон", "10000 ОД")),
    ).toBe("Креон 10000 ОД");
  });
});
