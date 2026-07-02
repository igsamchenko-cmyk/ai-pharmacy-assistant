import { GoogleGenAI } from "@google/genai";

/**
 * Gemini is the primary optional AI provider. It uses the pharmacist's own
 * GEMINI_API_KEY via the direct Google GenAI SDK (NOT the Replit AI proxy), so
 * that AI features stay optional and never bill anyone by default. When no key
 * is set every caller must degrade gracefully instead of failing.
 */

/** Model used for AI reference + OCR. Overridable via GEMINI_MODEL. */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

let client: GoogleGenAI | null = null;

/**
 * Lazily construct a single Gemini client. Returns null when no key is set so
 * callers can fall back without throwing.
 */
export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) return null;
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}
