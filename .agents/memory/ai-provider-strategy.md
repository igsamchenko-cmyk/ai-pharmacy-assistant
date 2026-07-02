---
name: AI provider strategy
description: How FarmAssist selects between Gemini and OpenAI for AI reference + OCR.
---

# AI provider strategy

The app supports two optional AI providers, both keyed by the user's own key via
direct SDKs (never the Replit AI proxy):

- **Gemini** — PRIMARY. `GEMINI_API_KEY` + `@google/genai` (`lib/gemini.ts`),
  model overridable via `GEMINI_MODEL` (default `gemini-2.5-flash`).
- **OpenAI** — opt-in fallback only. Used only when `ENABLE_OPENAI` is truthy
  (1/true/yes/on) AND `OPENAI_API_KEY` is set.

Selection is centralized and pure in `lib/aiProvider.ts` (`aiProviderChain(env)`
returns providers primary-first). Both `aiService` and `ocrService` loop the
chain and fall through on error; if all fail or none configured, they use the
demo-data fallback. Never let a missing key crash the app.

**Why:** replit.md mandates user-supplied keys and forbids the Replit OpenAI
proxy; keeping both providers key-based and optional preserves the "works with
zero keys" guarantee. OpenAI is disabled by default so it costs nothing unless
explicitly enabled.

**How to apply:** add new AI features by consuming `aiProviderChain()` and
adding a `generateWith<Provider>` branch — do not re-check env vars ad hoc.
