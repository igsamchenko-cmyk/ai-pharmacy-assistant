import { findDrugsInText } from "./drugService";
import type { DrugRecord } from "../data/drugs";
import { getOpenAiClient, OPENAI_MODEL } from "../lib/openai";
import { getGeminiClient, GEMINI_MODEL } from "../lib/gemini";
import { aiProviderChain, hasAnyAiProvider } from "../lib/aiProvider";
import { logger } from "../lib/logger";

export interface OcrResult {
  text: string;
  ocrAvailable: boolean;
  detectedName: string | null;
  matches: DrugRecord[];
}

const OCR_PROMPT =
  "Розпізнай і випиши весь видимий текст з упаковки лікарського засобу (назва, діюча речовина, дозування). Поверни лише розпізнаний текст без коментарів.";

function empty(): OcrResult {
  return { text: "", ocrAvailable: false, detectedName: null, matches: [] };
}

/** Split a data URL / raw base64 into mime type + payload for Gemini inlineData. */
function parseImage(imageBase64: string): { mimeType: string; data: string } {
  const match = imageBase64.match(/^data:(.+?);base64,(.*)$/s);
  if (match) return { mimeType: match[1], data: match[2] };
  return { mimeType: "image/jpeg", data: imageBase64 };
}

async function readWithGemini(imageBase64: string): Promise<string> {
  const client = getGeminiClient();
  if (!client) throw new Error("Gemini client unavailable");
  const { mimeType, data } = parseImage(imageBase64);
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: OCR_PROMPT }, { inlineData: { mimeType, data } }],
      },
    ],
    config: { temperature: 0 },
  });
  return response.text ?? "";
}

async function readWithOpenAi(imageBase64: string): Promise<string> {
  const client = getOpenAiClient();
  if (!client) throw new Error("OpenAI client unavailable");
  const dataUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const completion = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: OCR_PROMPT },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    temperature: 0,
  });

  return completion.choices[0]?.message?.content ?? "";
}

/** Read package text via the first working AI provider (Gemini first). */
async function readImageWithAi(imageBase64: string): Promise<string> {
  let lastError: unknown = null;
  for (const provider of aiProviderChain()) {
    try {
      return provider === "gemini"
        ? await readWithGemini(imageBase64)
        : await readWithOpenAi(imageBase64);
    } catch (err) {
      lastError = err;
      logger.warn({ err, provider }, "OCR provider failed; trying next");
    }
  }
  throw lastError ?? new Error("No AI provider configured");
}

export async function scanPackage(input: {
  imageBase64: string;
  manualText?: string;
}): Promise<OcrResult> {
  // Manual text always takes priority and is fully reliable.
  if (input.manualText && input.manualText.trim() !== "") {
    const { detectedName, matches } = findDrugsInText(input.manualText);
    return {
      text: input.manualText,
      ocrAvailable: true,
      detectedName,
      matches,
    };
  }

  if (!hasAnyAiProvider()) return empty();

  try {
    const text = await readImageWithAi(input.imageBase64);
    const { detectedName, matches } = findDrugsInText(text);
    return { text, ocrAvailable: true, detectedName, matches };
  } catch (err) {
    logger.error({ err }, "OCR scan failed; OCR unavailable");
    return empty();
  }
}
