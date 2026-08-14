import { describe, expect, it } from "vitest";
import {
  normalizeSearchHistoryQuery,
  updateSearchQueryHistory,
} from "./search-query-history";

describe("search query history", () => {
  it("keeps five unique recent queries in recency order", () => {
    let history: string[] = [];
    for (const query of [
      "Креон",
      "Нурофен",
      "Панадол",
      "Но-шпа",
      "Карсил",
      "Креон",
    ]) {
      history = updateSearchQueryHistory(history, query);
    }

    expect(history).toEqual([
      "Креон",
      "Карсил",
      "Но-шпа",
      "Панадол",
      "Нурофен",
    ]);
  });

  it("normalizes whitespace and removes control characters", () => {
    expect(normalizeSearchHistoryQuery("  Креон\n\t 10000  ")).toBe(
      "Креон 10000",
    );
  });

  it("does not store too-short input", () => {
    expect(updateSearchQueryHistory(["Креон"], "Іб")).toEqual(["Креон"]);
  });
});
