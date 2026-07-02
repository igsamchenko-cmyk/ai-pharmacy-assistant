import { z } from "zod/v4";
import { getDrugById } from "./drugService";
import {
  GLOBAL_DISCLAIMER,
  BLOCKED_MESSAGE,
  isTreatmentRequest,
} from "./safety";
import type { DrugRecord } from "../data/drugs";
import { getOpenAiClient, hasAiKey, OPENAI_MODEL } from "../lib/openai";
import { logger } from "../lib/logger";

export interface AiSummary {
  blocked: boolean;
  blockedMessage: string | null;
  isFallback: boolean;
  drugName: string | null;
  whatItIs: string | null;
  whatFor: string | null;
  mainRisks: string | null;
  pharmacistChecklist: string | null;
  patientExplanation: string | null;
  disclaimer: string;
}

const nullableString = z
  .string()
  .nullish()
  .transform((v: string | null | undefined) => v ?? null);

// Shape the model is instructed to return. Validated before use so malformed
// output falls back instead of leaking undefined fields.
const aiResponseSchema = z.object({
  blocked: z.boolean().optional().default(false),
  drugName: nullableString,
  whatItIs: nullableString,
  whatFor: nullableString,
  mainRisks: nullableString,
  pharmacistChecklist: nullableString,
  patientExplanation: nullableString,
});

function buildFallback(drug: DrugRecord): AiSummary {
  return {
    blocked: false,
    blockedMessage: null,
    isFallback: true,
    drugName: `${drug.brandName} (${drug.inn})`,
    whatItIs: `${drug.brandName} — ${drug.pharmacologicalGroup.toLowerCase()}. Діюча речовина: ${drug.inn}. Форма: ${drug.form}, ${drug.dosage}.`,
    whatFor: drug.indications,
    mainRisks: `Протипоказання: ${drug.contraindications} Можливі побічні ефекти: ${drug.sideEffects}`,
    pharmacistChecklist: `Зверніть увагу: ${drug.warnings} Перевірте можливі взаємодії з іншими препаратами пацієнта та відповідність дозування.`,
    patientExplanation: `Це ${drug.pharmacologicalGroup.toLowerCase()}. Застосовується за призначенням і згідно з інструкцією. ${drug.storage}`,
    disclaimer: GLOBAL_DISCLAIMER,
  };
}

function blockedSummary(): AiSummary {
  return {
    blocked: true,
    blockedMessage: BLOCKED_MESSAGE,
    isFallback: false,
    drugName: null,
    whatItIs: null,
    whatFor: null,
    mainRisks: null,
    pharmacistChecklist: null,
    patientExplanation: null,
    disclaimer: GLOBAL_DISCLAIMER,
  };
}

const SYSTEM_PROMPT = `Ти — довідковий асистент для дипломованих фармацевтів. Відповідай ВИКЛЮЧНО українською мовою, стисло, професійно і по суті.

Роль і межі:
- Надавай лише довідкову інформацію про лікарські засоби (склад, показання, протипоказання, взаємодії, застереження).
- Аудиторія — фахівець, тому використовуй коректну фармацевтичну термінологію, але без «води».
- НЕ став діагнозів, НЕ підбирай терапію і НЕ давай індивідуальних рекомендацій для конкретного пацієнта.
- Якщо запит стосується симптомів, самопочуття, підбору чи зміни лікування — НЕ відповідай по суті, а поверни {"blocked": true} і залиш решту полів null.
- Не вигадуй фактів. Якщо даних недостатньо — коротко зазнач це у відповідному полі та наголоси на перевірці за офіційною інструкцією.

Формат кожного поля:
- whatItIs: 1 речення — що це за препарат і фармакологічна група.
- whatFor: показання, стисло.
- mainRisks: ключові протипоказання та серйозні побічні ефекти.
- pharmacistChecklist: 2–4 конкретні пункти, що перевірити фармацевту перед відпуском.
- patientExplanation: 1–2 речення простою мовою для пацієнта, без вказівок щодо дозування.

Повертай ТІЛЬКИ валідний JSON без markdown і без додаткового тексту.`;

async function callOpenAi(
  prompt: string,
  drug: DrugRecord | null,
): Promise<AiSummary> {
  const client = getOpenAiClient();
  if (!client) {
    return drug ? buildFallback(drug) : blockedSummary();
  }

  const context = drug
    ? `Препарат: ${drug.brandName}\nМНН: ${drug.inn}\nATC: ${drug.atcCode ?? "—"}\nГрупа: ${drug.pharmacologicalGroup}\nФорма/доза: ${drug.form}, ${drug.dosage}\nПоказання: ${drug.indications}\nПротипоказання: ${drug.contraindications}\nПобічні: ${drug.sideEffects}\nЗастереження: ${drug.warnings}`
    : `Вільний запит фармацевта: ${prompt}`;

  const userPrompt = `${context}

Сформуй довідку у форматі JSON з полями:
{
  "blocked": boolean,            // true, якщо це запит на діагностику/лікування симптомів
  "drugName": string|null,
  "whatItIs": string|null,       // що це за препарат
  "whatFor": string|null,        // для чого застосовується
  "mainRisks": string|null,      // основні ризики, протипоказання, важливі побічні ефекти
  "pharmacistChecklist": string|null, // що перевірити фармацевту перед відпуском
  "patientExplanation": string|null   // коротке пояснення простою мовою для пацієнта
}`;

  const completion = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = aiResponseSchema.parse(JSON.parse(raw));

  if (parsed.blocked) {
    return blockedSummary();
  }

  return {
    blocked: false,
    blockedMessage: null,
    isFallback: false,
    drugName:
      parsed.drugName ?? (drug ? `${drug.brandName} (${drug.inn})` : null),
    whatItIs: parsed.whatItIs,
    whatFor: parsed.whatFor,
    mainRisks: parsed.mainRisks,
    pharmacistChecklist: parsed.pharmacistChecklist,
    patientExplanation: parsed.patientExplanation,
    disclaimer: GLOBAL_DISCLAIMER,
  };
}

export async function generateSummary(input: {
  drugId?: string;
  query?: string;
}): Promise<AiSummary> {
  const drug = input.drugId ? (getDrugById(input.drugId) ?? null) : null;

  // Safety: block treatment/symptom requests in the free-text query no matter
  // what — even when a drug is also selected, the symptom text must not be
  // answered.
  if (isTreatmentRequest(input.query)) {
    return blockedSummary();
  }

  // No drug and no usable query.
  if (!drug && (!input.query || input.query.trim() === "")) {
    return {
      ...blockedSummary(),
      blocked: false,
      blockedMessage: null,
      whatItIs:
        "Оберіть препарат зі списку або сформулюйте довідковий запит про конкретний лікарський засіб.",
    };
  }

  if (!hasAiKey()) {
    if (drug) return buildFallback(drug);
    return {
      blocked: false,
      blockedMessage: null,
      isFallback: true,
      drugName: null,
      whatItIs:
        "AI-генерацію вимкнено: не налаштовано ключ OPENAI_API_KEY. Оберіть препарат зі списку, щоб переглянути довідку з демонстраційної бази.",
      whatFor: null,
      mainRisks: null,
      pharmacistChecklist: null,
      patientExplanation: null,
      disclaimer: GLOBAL_DISCLAIMER,
    };
  }

  try {
    return await callOpenAi(input.query ?? "", drug);
  } catch (err) {
    logger.error({ err }, "AI summary generation failed; using fallback");
    if (drug) return buildFallback(drug);
    return {
      blocked: false,
      blockedMessage: null,
      isFallback: true,
      drugName: null,
      whatItIs:
        "Не вдалося згенерувати AI-відповідь зараз. Спробуйте пізніше або оберіть препарат зі списку для довідки з бази.",
      whatFor: null,
      mainRisks: null,
      pharmacistChecklist: null,
      patientExplanation: null,
      disclaimer: GLOBAL_DISCLAIMER,
    };
  }
}
