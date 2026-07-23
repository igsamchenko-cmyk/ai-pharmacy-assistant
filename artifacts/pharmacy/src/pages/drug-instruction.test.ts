import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DrugInstructionSections } from "@workspace/api-client-react";
import {
  filterInstructionSections,
  INSTRUCTION_SAFETY_COPY,
  InstructionEssentials,
  InstructionSectionContent,
  OfficialInstructionLink,
} from "./drug-instruction";

const sections: DrugInstructionSections = {
  indications: "Офіційний текст показань.",
  contraindications: "Офіційний текст протипоказань.",
  adverseReactions: null,
  interactions: "Взаємодія з перевіреним лікарським засобом.",
  specialWarnings: "Особливе застереження.",
  pregnancyAndLactation: null,
  administration: "Офіційний спосіб застосування.",
  overdose: null,
  storage: "Зберігати відповідно до офіційного документа.",
};

describe("drug instruction UI helpers", () => {
  it("shows only exact indications and contraindications in the essentials view", () => {
    const html = renderToStaticMarkup(
      createElement(InstructionEssentials, { sections }),
    );

    expect(html).toContain('data-testid="instruction-essentials"');
    expect(html).toContain('data-testid="instruction-essential-indications"');
    expect(html).toContain(
      'data-testid="instruction-essential-contraindications"',
    );
    expect(html).toContain("Основне");
    expect(html).toContain("Для чого застосовують");
    expect(html).toContain("Коли не застосовувати");
    expect(html).toContain(sections.indications);
    expect(html).toContain(sections.contraindications);
    expect(html).not.toContain(sections.interactions);
    expect(html).not.toContain(sections.specialWarnings);
    expect(html).not.toContain(sections.storage);
    expect(html).toContain("min-w-0");
    expect(html).not.toContain("overflow-x-auto");
  });

  it("fails closed when an essential official section is missing", () => {
    const html = renderToStaticMarkup(
      createElement(InstructionEssentials, {
        sections: {
          ...sections,
          indications: null,
          contraindications: null,
        },
      }),
    );

    expect(html).toContain("Показання ще не структуровано");
    expect(html).toContain("Це не означає, що протипоказань немає");
    expect(html).not.toContain("Протипоказань немає");
  });

  it("filters official sections without changing their text", () => {
    const filtered = filterInstructionSections(sections, "взаємодія");
    expect(filtered.map((item) => item.key)).toEqual(["interactions"]);
    expect(sections.interactions).toBe(
      "Взаємодія з перевіреним лікарським засобом.",
    );
  });

  it("keeps long official text mobile-safe and reports missing content", () => {
    const longText = `ДовгийОфіційнийТекст${"а".repeat(2_000)}`;
    const available = renderToStaticMarkup(
      createElement(InstructionSectionContent, { content: longText }),
    );
    expect(available).toContain("whitespace-pre-wrap");
    expect(available).toContain("break-words");
    expect(available).toContain(longText);

    const missing = renderToStaticMarkup(
      createElement(InstructionSectionContent, { content: null }),
    );
    expect(missing).toContain("Розділ ще не структуровано");
  });

  it("opens only the supplied official source in a new tab", () => {
    const url =
      "https://www.drlz.com.ua/ibp/lz_www.nsf/id/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB/$file/UA123450101_ABCD.mht";
    const html = renderToStaticMarkup(
      createElement(OfficialInstructionLink, { url }),
    );
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
  });

  it("keeps the medical safety warning explicit", () => {
    expect(INSTRUCTION_SAFETY_COPY).toContain("Не змінюйте лікування");
    expect(INSTRUCTION_SAFETY_COPY).toContain("консультації лікаря");
  });
});
