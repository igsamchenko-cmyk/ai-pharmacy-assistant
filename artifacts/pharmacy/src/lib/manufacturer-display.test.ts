import { describe, expect, it } from "vitest";
import {
  conciseManufacturerEntries,
  conciseManufacturerText,
  manufacturerHeading,
} from "./manufacturer-display";

describe("concise manufacturer display", () => {
  it("keeps official company names and removes packaging or release roles", () => {
    const manufacturers = [
      {
        name: 'АТ "Лубнифарм" (відповідальний за виробництво, первинне, вторинне пакування, контроль якості)',
        country: "Україна",
      },
      {
        name: 'ПрАТ "ФІТОФАРМ" (відповідальний за виробництво, первинне, вторинне пакування, контроль та випуск серій)',
        country: "Україна",
      },
    ];

    expect(conciseManufacturerEntries(manufacturers)).toEqual([
      'АТ "Лубнифарм", Україна',
      'ПрАТ "ФІТОФАРМ", Україна',
    ]);
    expect(conciseManufacturerText(manufacturers)).not.toMatch(
      /пакування|контроль|випуск/iu,
    );
    expect(manufacturerHeading(manufacturers)).toBe("Виробники");
  });

  it("removes balanced nested role details and deduplicates repeated sites", () => {
    const manufacturers = [
      {
        name: "КРКА, д.д., Ново место (виробник, відповідальний за виробництво нерозфасованої продукції (підготовка, наповнення)); КРКА, д.д., Ново место (контроль та випуск серії)",
        country: "Словенія",
      },
    ];

    expect(conciseManufacturerText(manufacturers)).toBe(
      "КРКА, д.д., Ново место, Словенія",
    );
  });

  it("preserves non-role parentheticals in a legal company name", () => {
    expect(
      conciseManufacturerText([
        { name: "Bayer (Schweiz) AG", country: "Швейцарія" },
      ]),
    ).toBe("Bayer (Schweiz) AG, Швейцарія");
  });

  it("returns a concise fallback when no manufacturer is available", () => {
    expect(conciseManufacturerText([])).toBe("Не зазначено");
    expect(manufacturerHeading([])).toBe("Виробник");
  });
});
