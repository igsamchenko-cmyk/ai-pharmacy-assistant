/**
 * AI provider selection.
 *
 * The app supports two optional AI providers, both using the pharmacist's own
 * key (no Replit AI proxy):
 *  - Gemini  (GEMINI_API_KEY)  — PRIMARY when configured.
 *  - OpenAI  (OPENAI_API_KEY)  — opt-in only, disabled by default. Enable by
 *    setting ENABLE_OPENAI to a truthy value.
 *
 * All selection is pure and driven by env so it can be unit-tested without
 * touching the network. When no provider is configured the callers must fall
 * back to demo data instead of failing.
 */

export type AiProvider = "gemini" | "openai";

type Env = Record<string, string | undefined>;

const TRUTHY = new Set(["1", "true", "yes", "on"]);

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function hasGeminiKey(env: Env = process.env): boolean {
  return nonEmpty(env.GEMINI_API_KEY);
}

export function hasOpenAiKey(env: Env = process.env): boolean {
  return nonEmpty(env.OPENAI_API_KEY);
}

/** OpenAI is disabled by default; opt in with ENABLE_OPENAI=true. */
export function isOpenAiEnabled(env: Env = process.env): boolean {
  const value = env.ENABLE_OPENAI;
  return typeof value === "string" && TRUTHY.has(value.trim().toLowerCase());
}

/**
 * Ordered list of providers to try, primary first. Gemini leads; OpenAI is
 * appended only when explicitly enabled AND keyed. An empty array means the app
 * should use its demo-data fallback.
 */
export function aiProviderChain(env: Env = process.env): AiProvider[] {
  const chain: AiProvider[] = [];
  if (hasGeminiKey(env)) chain.push("gemini");
  if (isOpenAiEnabled(env) && hasOpenAiKey(env)) chain.push("openai");
  return chain;
}

export function hasAnyAiProvider(env: Env = process.env): boolean {
  return aiProviderChain(env).length > 0;
}
