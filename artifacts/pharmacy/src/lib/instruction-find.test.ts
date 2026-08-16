import { describe, expect, it } from "vitest";
import {
  buildHighlightFragments,
  findMatchElementId,
  findTextMatches,
  flattenSectionMatches,
  type ContentMark,
} from "./instruction-find";

describe("findTextMatches", () => {
  it("finds every case-insensitive, non-overlapping occurrence", () => {
    const content = "Не застосовувати при лактації. Лактація потребує огляду.";
    expect(findTextMatches(content, "лактаці")).toEqual([
      { start: 21, end: 28 },
      { start: 31, end: 38 },
    ]);
  });

  it("ignores terms shorter than two characters", () => {
    expect(findTextMatches("Доза 5 мг двічі на добу.", "5")).toEqual([]);
    expect(findTextMatches("Доза 5 мг двічі на добу.", " ")).toEqual([]);
  });

  it("returns nothing for a term that never occurs", () => {
    expect(findTextMatches("Зберігати при температурі до 25°C.", "нирки")).toEqual(
      [],
    );
  });

  it("trims the search term before matching", () => {
    expect(findTextMatches("Взаємодія з варфарином.", "  варфарин  ")).toEqual([
      { start: 12, end: 20 },
    ]);
  });
});

describe("buildHighlightFragments", () => {
  const content = "Взаємодія з варфарином і аспірином.";

  it("splits content around marks and keeps unmatched text plain", () => {
    const marks: ContentMark[] = [
      { id: "m1", start: 12, end: 22, className: "mark-a" },
      { id: "m2", start: 25, end: 34, className: "mark-b" },
    ];
    const fragments = buildHighlightFragments(content, marks);
    expect(fragments.map((f) => f.text).join("")).toBe(content);
    expect(fragments.filter((f) => f.mark)).toHaveLength(2);
    expect(fragments[1]).toEqual({
      text: "варфарином",
      mark: marks[0],
    });
  });

  it("deduplicates marks sharing the exact same range, keeping the last", () => {
    const marks: ContentMark[] = [
      { id: "first", start: 12, end: 22, className: "a" },
      { id: "second", start: 12, end: 22, className: "b" },
    ];
    const fragments = buildHighlightFragments(content, marks);
    const marked = fragments.filter((f) => f.mark);
    expect(marked).toHaveLength(1);
    expect(marked[0]?.mark?.id).toBe("second");
  });

  it("drops a mark that overlaps one already placed", () => {
    const marks: ContentMark[] = [
      { id: "outer", start: 12, end: 34, className: "a" },
      { id: "inner", start: 15, end: 20, className: "b" },
    ];
    const fragments = buildHighlightFragments(content, marks);
    expect(fragments.filter((f) => f.mark).map((f) => f.mark?.id)).toEqual([
      "outer",
    ]);
  });

  it("ignores out-of-range or empty marks", () => {
    const marks: ContentMark[] = [
      { id: "empty", start: 5, end: 5, className: "a" },
      { id: "too-long", start: 0, end: content.length + 10, className: "b" },
    ];
    expect(buildHighlightFragments(content, marks)).toEqual([
      { text: content, mark: null },
    ]);
  });

  it("returns the whole string as one plain fragment with no marks", () => {
    expect(buildHighlightFragments(content, [])).toEqual([
      { text: content, mark: null },
    ]);
  });
});

describe("flattenSectionMatches / findMatchElementId", () => {
  it("flattens per-section matches into a stable global order", () => {
    const flat = flattenSectionMatches([
      { sectionKey: "indications", matches: [{ start: 0, end: 3 }] },
      {
        sectionKey: "interactions",
        matches: [
          { start: 0, end: 3 },
          { start: 10, end: 13 },
        ],
      },
    ]);
    expect(flat).toEqual([
      { sectionKey: "indications", matchIndexInSection: 0 },
      { sectionKey: "interactions", matchIndexInSection: 0 },
      { sectionKey: "interactions", matchIndexInSection: 1 },
    ]);
  });

  it("builds a stable, section-scoped DOM id per match", () => {
    expect(findMatchElementId("interactions", 1)).toBe(
      "instruction-find-match-interactions-1",
    );
  });
});
