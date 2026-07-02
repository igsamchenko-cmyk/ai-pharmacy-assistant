import OpenAI from "openai";

/**
 * The app uses the pharmacist's own OpenAI key. AI features are strictly
 * optional: when no key is configured every AI-backed service must degrade
 * gracefully instead of failing.
 */
export function hasAiKey(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return typeof key === "string" && key.length > 0;
}

/** Shared model used across AI reference and OCR. */
export const OPENAI_MODEL = "gpt-4o-mini";

let client: OpenAI | null = null;

/**
 * Lazily construct a single OpenAI client. Returns null when no key is set so
 * callers can fall back without throwing.
 */
export function getOpenAiClient(): OpenAI | null {
  if (!hasAiKey()) return null;
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}
