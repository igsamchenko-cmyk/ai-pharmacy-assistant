import OpenAI from "openai";
import { getAllDrugs } from "./drugService";
import type { DrugRecord } from "../data/drugs";
import { logger } from "../lib/logger";

export interface OcrResult {
  text: string;
  ocrAvailable: boolean;
  detectedName: string | null;
  matches: DrugRecord[];
}

function hasAiKey(): boolean {
  return typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.length > 0;
}

function matchDrugs(text: string): { detectedName: string | null; matches: DrugRecord[] } {
  const normalized = text.toLowerCase();
  const matches: DrugRecord[] = [];
  for (const d of getAllDrugs()) {
    if (
      normalized.includes(d.brandName.toLowerCase()) ||
      normalized.includes(d.inn.toLowerCase())
    ) {
      matches.push(d);
    }
  }
  const detectedName = matches.length > 0 ? matches[0].brandName : null;
  return { detectedName, matches };
}

async function readImageWithAi(imageBase64: string): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const dataUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
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
    const { detectedName, matches } = matchDrugs(input.manualText);
    return {
      text: input.manualText,
      ocrAvailable: true,
      detectedName,
      matches,
    };
  }

  if (!hasAiKey()) {
    return {
      text: "",
      ocrAvailable: false,
      detectedName: null,
      matches: [],
    };
  }

  try {
    const text = await readImageWithAi(input.imageBase64);
    const { detectedName, matches } = matchDrugs(text);
    return { text, ocrAvailable: true, detectedName, matches };
  } catch (err) {
    logger.error({ err }, "OCR scan failed");
    return { text: "", ocrAvailable: false, detectedName: null, matches: [] };
  }
}
