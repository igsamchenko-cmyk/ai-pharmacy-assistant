import { findDrugsInText } from "./drugService";
import type { DrugRecord } from "../data/drugs";
import { getOpenAiClient, hasAiKey, OPENAI_MODEL } from "../lib/openai";
import { logger } from "../lib/logger";

export interface OcrResult {
  text: string;
  ocrAvailable: boolean;
  detectedName: string | null;
  matches: DrugRecord[];
}

function empty(): OcrResult {
  return { text: "", ocrAvailable: false, detectedName: null, matches: [] };
}

async function readImageWithAi(imageBase64: string): Promise<string> {
  const client = getOpenAiClient();
  if (!client) return "";

  const dataUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const completion = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Розпізнай і випиши весь видимий текст з упаковки лікарського засобу (назва, діюча речовина, дозування). Поверни лише розпізнаний текст без коментарів.",
          },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    temperature: 0,
  });

  return completion.choices[0]?.message?.content ?? "";
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

  if (!hasAiKey()) return empty();

  try {
    const text = await readImageWithAi(input.imageBase64);
    const { detectedName, matches } = findDrugsInText(text);
    return { text, ocrAvailable: true, detectedName, matches };
  } catch (err) {
    logger.error({ err }, "OCR scan failed; OCR unavailable");
    return empty();
  }
}
