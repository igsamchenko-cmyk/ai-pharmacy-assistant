import { searchRxNorm, type RxNormInfo } from "./providers/rxnorm";
import { searchOpenFda, type OpenFdaInfo } from "./providers/openfda";
import { getDrugById } from "./drugService";
import {
  aiProviderChain,
  hasGeminiKey,
  hasOpenAiKey,
  isOpenAiEnabled,
} from "../lib/aiProvider";

/**
 * Aggregates supplementary drug data from external providers and reports the
 * live status of every data source for the "data sources" page. Everything is
 * best-effort: providers that fail simply return null and the app keeps working
 * on its bundled demo catalog.
 */

export interface ExternalDrugReference {
  name: string;
  rxnorm: RxNormInfo | null;
  openfda: OpenFdaInfo | null;
  fetchedAt: string;
}

export type SourceCategory = "catalog" | "external" | "ai";
export type SourceStatus = "active" | "optional" | "disabled";

export interface DataSourceStatus {
  id: string;
  name: string;
  category: SourceCategory;
  status: SourceStatus;
  requiresKey: boolean;
  detail: string;
}

/** Resolve the best lookup name: prefer a demo drug's INN, else the raw query. */
function resolveLookupName(input: { drugId?: string; name?: string }): string {
  if (input.drugId) {
    const drug = getDrugById(input.drugId);
    if (drug) return drug.inn || drug.brandName;
  }
  return (input.name ?? "").trim();
}

export async function getExternalReference(input: {
  drugId?: string;
  name?: string;
}): Promise<ExternalDrugReference> {
  const name = resolveLookupName(input);
  if (!name) {
    return { name: "", rxnorm: null, openfda: null, fetchedAt: new Date().toISOString() };
  }

  // Run both providers concurrently; each already degrades to null on failure.
  const [rxnorm, openfda] = await Promise.all([
    searchRxNorm(name),
    searchOpenFda(name),
  ]);

  return { name, rxnorm, openfda, fetchedAt: new Date().toISOString() };
}

export function getSourceStatuses(): DataSourceStatus[] {
  const chain = aiProviderChain();
  const primaryAi = chain[0] ?? null;

  return [
    {
      id: "demo-catalog",
      name: "Демонстраційний каталог",
      category: "catalog",
      status: "active",
      requiresKey: false,
      detail:
        "Вбудований довідник препаратів і правил взаємодій. Джерело істини для роботи без інтернету.",
    },
    {
      id: "rxnorm",
      name: "RxNorm (NIH/NLM)",
      category: "external",
      status: "active",
      requiresKey: false,
      detail:
        "Публічний API нормалізованої номенклатури лікарських засобів. Ключ не потрібен. Використовується для звірки діючих речовин і торгових назв.",
    },
    {
      id: "openfda",
      name: "openFDA (U.S. FDA)",
      category: "external",
      status: "active",
      requiresKey: false,
      detail: process.env.OPENFDA_API_KEY
        ? "Публічні дані етикеток FDA. Налаштовано ключ для підвищених лімітів."
        : "Публічні дані етикеток FDA. Працює без ключа; OPENFDA_API_KEY підвищує ліміти запитів.",
    },
    {
      id: "gemini",
      name: "Gemini (Google)",
      category: "ai",
      status: hasGeminiKey() ? "active" : "optional",
      requiresKey: true,
      detail: hasGeminiKey()
        ? "Основний AI-провайдер для структурування довідки та розпізнавання упаковок."
        : "Основний AI-провайдер. Вимкнено: додайте GEMINI_API_KEY, щоб увімкнути AI-довідку та скан.",
    },
    {
      id: "openai",
      name: "OpenAI",
      category: "ai",
      status:
        isOpenAiEnabled() && hasOpenAiKey()
          ? primaryAi === "openai"
            ? "active"
            : "optional"
          : "disabled",
      requiresKey: true,
      detail:
        isOpenAiEnabled() && hasOpenAiKey()
          ? "Увімкнено як резервний AI-провайдер (ENABLE_OPENAI)."
          : "Резервний AI-провайдер, вимкнений за замовчуванням. Увімкніть через ENABLE_OPENAI=true разом із OPENAI_API_KEY.",
    },
  ];
}
