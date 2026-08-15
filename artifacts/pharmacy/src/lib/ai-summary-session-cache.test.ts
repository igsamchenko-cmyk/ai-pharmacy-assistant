import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSummary } from "@workspace/api-client-react";
import {
  clearSessionAiSummaryCache,
  loadSessionAiSummary,
  readSessionAiSummary,
} from "./ai-summary-session-cache";

const summary: AiSummary = {
  blocked: false,
  isFallback: false,
  drugName: "Креон",
  disclaimer: "Довідкова інформація.",
};

describe("AI summary session cache", () => {
  beforeEach(clearSessionAiSummaryCache);

  it("does not run anything until the explicit loader function is called", () => {
    expect(readSessionAiSummary("product-1")).toBeNull();
  });

  it("deduplicates repeated and concurrent requests for one product", async () => {
    const loader = vi.fn(async () => summary);
    const first = loadSessionAiSummary("product-1", loader);
    const second = loadSessionAiSummary("product-1", loader);
    await expect(Promise.all([first, second])).resolves.toEqual([
      summary,
      summary,
    ]);
    await expect(loadSessionAiSummary("product-1", loader)).resolves.toBe(
      summary,
    );
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("allows a retry after a failed request", async () => {
    const loader = vi
      .fn<() => Promise<AiSummary>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(summary);
    await expect(loadSessionAiSummary("product-1", loader)).rejects.toThrow(
      "offline",
    );
    await expect(loadSessionAiSummary("product-1", loader)).resolves.toBe(
      summary,
    );
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
