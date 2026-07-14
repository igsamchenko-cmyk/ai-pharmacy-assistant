import { describe, expect, it } from "vitest";
import {
  getInstructionForProduct,
  hasInstructionForProduct,
  loadInstructionManifest,
  loadInstructionSources,
} from "../instructions/catalog";
import {
  isAllowedInstructionSource,
  parseOfficialInstructionMht,
} from "../instructions/parser";
import type { InstructionSourceProduct } from "../instructions/model";

const source: InstructionSourceProduct = {
  registryProductId: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  registrationNumber: "UA/12345/01/01",
  tradeName: "ТЕСТОВИЙ ПРЕПАРАТ",
  inn: "Test substance",
  activeIngredient: "Test substance 10 mg",
  dosageForm: "таблетки",
  strength: "10 мг",
  manufacturer: "Test Manufacturer",
  manufacturerCountry: "Україна",
  registrationStartDate: "01.01.2026",
  registrationEndDate: "необмежений",
  sourceUrl: "https://www.drlz.com.ua/ibp/lz_www.nsf/id/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB/$file/UA123450101_ABCD.mht",
};

const sectionParagraphs = [
  ["Показання", "Офіційний текст показань."],
  ["Протипоказання", "Офіційний текст протипоказань."],
  ["Побічні реакції", "Офіційний текст побічних реакцій."],
  ["Взаємодія з іншими лікарськими засобами та інші види взаємодій", "Офіційний текст взаємодій."],
  ["Особливості застосування", "Офіційний текст особливих застережень."],
  ["Застосування у період вагітності або годування груддю", "Офіційний текст для вагітності й годування."],
  ["Спосіб застосування та дози", "Офіційний текст способу застосування."],
  ["Передозування", "Офіційний текст передозування."],
  ["Умови зберігання", "Офіційний текст умов зберігання."],
] as const;

function syntheticMht(
  paragraphs: ReadonlyArray<readonly [string, string]> = sectionParagraphs,
  contentLocation = "file:///UA123450101_instruction.htm",
): Buffer {
  const html = [
    "<html><head><o:LastSaved>2026-07-01T00:00:00Z</o:LastSaved></head><body>",
    ...paragraphs.flatMap(([heading, content]) => [
      `<p>${heading}</p>`,
      `<p>${content}</p>`,
    ]),
    "</body></html>",
  ].join("");
  return Buffer.from([
    "MIME-Version: 1.0",
    'Content-Type: multipart/related; boundary="FARMASSIST_TEST"',
    "",
    "--FARMASSIST_TEST",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    `Content-Location: ${contentLocation}`,
    "",
    Buffer.from(html, "utf8").toString("base64"),
    "--FARMASSIST_TEST--",
  ].join("\r\n"), "latin1");
}

function parse(raw = syntheticMht(), product = source) {
  return parseOfficialInstructionMht(raw, {
    source: product,
    dataset: {
      title: "Official registry dataset",
      url: "https://data.gov.ua/dataset/fded13b8-4e2c-4c48-bf14-65d0e3106463",
      license: "Creative Commons Attribution 4.0",
    },
    checkedAt: new Date("2026-07-14T00:00:00Z"),
  });
}

describe("official drug instruction parser", () => {
  it("extracts all required sections with reproducible provenance", () => {
    const result = parse();
    expect(result.status).toBe("available");
    expect(result.provenance).toMatchObject({
      sourceAllowed: true,
      registrationMatched: true,
      contentLocationMatched: true,
      availableSectionCount: 9,
      coveragePct: 100,
    });
    expect(result.sections.indications).toBe("Офіційний текст показань.");
    expect(result.sections.contraindications).toBe("Офіційний текст протипоказань.");
    expect(result.source.documentDate).toBe("2026-07-01T00:00:00.000Z");
    expect(result.source.documentHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("marks a registration mismatch for review instead of reusing text", () => {
    const result = parse(syntheticMht(), {
      ...source,
      registrationNumber: "UA/54321/01/01",
    });
    expect(result.status).toBe("needs_review");
    expect(result.provenance.registrationMatched).toBe(false);
  });

  it("keeps a missing section null and reports partial coverage", () => {
    const result = parse(syntheticMht(sectionParagraphs.slice(0, -1)));
    expect(result.status).toBe("partial");
    expect(result.sections.storage).toBeNull();
    expect(result.warnings).toContain("missing_section:storage");
  });

  it("reports an unavailable document without inventing medical text", () => {
    const result = parse(syntheticMht([["Загальна інформація", "Немає підтримуваних розділів."]]));
    expect(result.status).toBe("unavailable");
    expect(Object.values(result.sections)).toEqual(Array(9).fill(null));
    expect(result.provenance.availableSectionCount).toBe(0);
  });

  it("does not mistake dosage-table subheadings for the indications section", () => {
    const result = parse(syntheticMht([
      ["П оказання", "Правильний текст показань."],
      ["Протипоказання", "Правильний текст протипоказань."],
      ["Спосіб застосування та дози", "Початок офіційного дозування."],
      ["Показання у новонароджених, що потребують особливих схем дозування", "Продовження офіційного дозування."],
      ["Показання", "Табличний стовпчик дозування, а не розділ показань."],
      ["Передозування", "Офіційний текст передозування."],
    ]));
    expect(result.sections.indications).toBe("Правильний текст показань.");
    expect(result.sections.administration).toContain("Показання у новонароджених");
    expect(result.sections.administration).toContain("Продовження офіційного дозування.");
    expect(result.sections.administration).toContain("Табличний стовпчик дозування");
  });

  it("changes the document hash when official content changes", () => {
    const original = parse();
    const changed = parse(syntheticMht([
      ...sectionParagraphs.slice(0, -1),
      ["Умови зберігання", "Змінений офіційний текст."],
    ]));
    expect(changed.source.documentHash).not.toBe(original.source.documentHash);
  });

  it("blocks an unapproved source with a sanitized error", () => {
    expect(isAllowedInstructionSource("https://example.com/instruction.mht")).toBe(false);
    expect(() => parse(syntheticMht(), {
      ...source,
      sourceUrl: "https://example.com/instruction.mht",
    })).toThrowError("instruction_source_not_allowed");
  });
});

describe("committed instruction catalog", () => {
  it("binds every snapshot to one exact product and registration", () => {
    const sources = loadInstructionSources();
    const manifest = loadInstructionManifest();
    expect(sources.products).toHaveLength(10);
    expect(manifest.products).toHaveLength(10);

    for (const product of sources.products) {
      expect(hasInstructionForProduct(
        product.registryProductId,
        product.registrationNumber,
      )).toBe(true);
      expect(hasInstructionForProduct(
        product.registryProductId,
        "UA/99999/99/99",
      )).toBe(false);
      const snapshot = getInstructionForProduct(product.registryProductId);
      expect(snapshot?.registrationNumber).toBe(product.registrationNumber);
      expect(snapshot?.registryProductId).toBe(product.registryProductId);
      expect(snapshot?.provenance.registrationMatched).toBe(true);
    }
  });

  it("does not reuse one instruction for a different product", () => {
    expect(getInstructionForProduct("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF")).toBeNull();
  });
});
