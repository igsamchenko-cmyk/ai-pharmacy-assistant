import { describe, it, expect } from "vitest";
import {
  aiProviderChain,
  hasAnyAiProvider,
  isOpenAiEnabled,
  hasGeminiKey,
} from "../aiProvider";

describe("aiProvider selection", () => {
  it("uses no provider when nothing is configured", () => {
    expect(aiProviderChain({})).toEqual([]);
    expect(hasAnyAiProvider({})).toBe(false);
  });

  it("makes Gemini the primary provider when only GEMINI_API_KEY is set", () => {
    const env = { GEMINI_API_KEY: "g-key" };
    expect(aiProviderChain(env)).toEqual(["gemini"]);
    expect(hasAnyAiProvider(env)).toBe(true);
    expect(hasGeminiKey(env)).toBe(true);
  });

  it("keeps OpenAI disabled by default even when its key is present", () => {
    const env = { OPENAI_API_KEY: "o-key" };
    expect(isOpenAiEnabled(env)).toBe(false);
    expect(aiProviderChain(env)).toEqual([]);
  });

  it("enables OpenAI only when explicitly opted in AND keyed", () => {
    expect(aiProviderChain({ ENABLE_OPENAI: "true" })).toEqual([]);
    expect(
      aiProviderChain({ ENABLE_OPENAI: "true", OPENAI_API_KEY: "o-key" }),
    ).toEqual(["openai"]);
  });

  it("prefers Gemini and falls back to OpenAI when both are available", () => {
    const env = {
      GEMINI_API_KEY: "g-key",
      OPENAI_API_KEY: "o-key",
      ENABLE_OPENAI: "1",
    };
    expect(aiProviderChain(env)).toEqual(["gemini", "openai"]);
  });

  it("treats common truthy strings as enabling OpenAI", () => {
    for (const v of ["1", "true", "TRUE", "yes", "on"]) {
      expect(isOpenAiEnabled({ ENABLE_OPENAI: v })).toBe(true);
    }
    for (const v of ["0", "false", "off", "", "no"]) {
      expect(isOpenAiEnabled({ ENABLE_OPENAI: v })).toBe(false);
    }
  });
});
