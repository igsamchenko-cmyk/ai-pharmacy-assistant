import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { isTreatmentRequest, GLOBAL_DISCLAIMER } from "../safety";
import { generateSummary } from "../aiService";

describe("safety.isTreatmentRequest", () => {
  it("detects symptom / treatment-seeking queries", () => {
    expect(isTreatmentRequest("у мене болить голова, що приймати?")).toBe(true);
    expect(isTreatmentRequest("чим лікувати застуду")).toBe(true);
    expect(isTreatmentRequest("порадьте препарат від кашлю")).toBe(true);
  });

  it("allows neutral reference queries", () => {
    expect(isTreatmentRequest("ібупрофен дозування")).toBe(false);
    expect(isTreatmentRequest("механізм дії метформіну")).toBe(false);
    expect(isTreatmentRequest("")).toBe(false);
    expect(isTreatmentRequest(undefined)).toBe(false);
  });
});

describe("aiService.generateSummary (no AI key)", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeAll(() => {
    delete process.env.OPENAI_API_KEY;
  });

  afterAll(() => {
    if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
  });

  it("blocks treatment requests instead of answering", async () => {
    const result = await generateSummary({
      query: "що приймати від температури",
    });
    expect(result.blocked).toBe(true);
    expect(result.blockedMessage).toBeTruthy();
  });

  it("blocks a treatment query even when a drug is also selected", async () => {
    const result = await generateSummary({
      drugId: "ibuprofen-200",
      query: "у мене болить голова, що приймати?",
    });
    expect(result.blocked).toBe(true);
    expect(result.blockedMessage).toBeTruthy();
  });

  it("returns a fallback summary for a known drug without an AI key", async () => {
    const result = await generateSummary({ drugId: "ibuprofen-200" });
    expect(result.blocked).toBe(false);
    expect(result.isFallback).toBe(true);
    expect(result.whatFor).toBeTruthy();
    expect(result.disclaimer).toBe(GLOBAL_DISCLAIMER);
  });
});
