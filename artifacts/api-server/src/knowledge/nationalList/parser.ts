import { createHash } from "node:crypto";
import {
  NATIONAL_LIST_ACT_DATE,
  NATIONAL_LIST_ACT_NUMBER,
  NATIONAL_LIST_CANONICAL_URL,
  NATIONAL_LIST_EFFECTIVE_DATE,
  NATIONAL_LIST_EXPECTED_DOCUMENT_HASH,
  NATIONAL_LIST_PARSER_VERSION,
  NATIONAL_LIST_REVISION_DATE,
  NATIONAL_LIST_TITLE,
  type NationalListEntry,
  type NationalListSnapshot,
} from "./model";

const ROMAN_SECTION = /^[IVXLCDM]+\.\s+/u;
const NUMBERED_SECTION = /^\d+(?:[.-]\d+)*\.\s+/u;

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    laquo: "«",
    lt: "<",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    quot: '"',
    raquo: "»",
  };
  return value
    .replace(/&#(\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/giu, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/giu, (entity, name: string) => named[name] ?? entity);
}

function textFromHtml(value: string): string {
  return decodeHtml(
    value
      .replace(/<br\s*\/?\s*>/giu, "\n")
      .replace(/<[^>]+>/gu, " "),
  )
    .replace(/[\t\r ]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{2,}/gu, "\n")
    .trim();
}

export function normalizeNationalListText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("uk-UA")
    .replace(/[’`]/gu, "'")
    .replace(/[^\p{L}\p{N}%/+.,'-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function ingredientSignature(value: string): string {
  const components = value
    .replace(/\*/gu, "")
    .split(/\s*(?:\+|;|\/(?!\d)|\b(?:and|with)\b)\s*/iu)
    .map((item) => normalizeNationalListText(item))
    .filter(Boolean);
  return [...new Set(components)].sort().join("+");
}

function matchingParenthesis(value: string, start: number): number {
  let depth = 0;
  for (let index = start; index < value.length; index++) {
    if (value[index] === "(") depth++;
    if (value[index] === ")") depth--;
    if (depth === 0) return index;
  }
  return -1;
}

function parseOfficialName(value: string): {
  ua: string;
  en: string;
  restrictions: string;
  trailing: string;
} | null {
  const candidates: Array<{ start: number; end: number; score: number }> = [];
  for (let start = value.indexOf("("); start >= 0; start = value.indexOf("(", start + 1)) {
    const end = matchingParenthesis(value, start);
    if (end < 0) continue;
    const content = value.slice(start + 1, end);
    const asciiLetters = content.match(/[A-Za-z]/gu)?.length ?? 0;
    if (asciiLetters < 3 || !/[\p{Script=Cyrillic}]/u.test(value.slice(0, start))) continue;
    candidates.push({ start, end, score: asciiLetters * 10 + content.length });
  }
  const selected = candidates.sort((a, b) => b.score - a.score || a.start - b.start)[0];
  if (!selected) {
    const separator = value.indexOf("*");
    if (separator <= 0) return null;
    const ua = value.slice(0, separator).replace(/\n/gu, " ").trim();
    const trailing = value.slice(separator + 1).replace(/\n/gu, " ").trim();
    return ua && trailing ? { ua, en: "", restrictions: "", trailing } : null;
  }
  const ua = value.slice(0, selected.start).replace(/\n/gu, " ").trim();
  const en = value.slice(selected.start + 1, selected.end).replace(/\n/gu, " ")
    .replace(/\*$/u, "").trim();
  let trailing = value.slice(selected.end + 1).replace(/^\s*\*\s*/u, "").trim();
  const restrictionMatches = [...trailing.matchAll(/\(може бути[^)]*\)/giu)];
  const restrictions = restrictionMatches.map((match) => match[0]).join(" ");
  for (const restriction of restrictionMatches) trailing = trailing.replace(restriction[0], " ");
  if (!ua || !en || !/[A-Za-z]/u.test(en)) return null;
  return {
    ua: ua.replace(/\*$/u, "").trim(),
    en,
    restrictions,
    trailing: trailing.replace(/\s+/gu, " ").trim(),
  };
}

function dosageForms(value: string): string[] {
  const forms: string[] = [];
  for (const line of value.split("\n")) {
    const beforeColon = line.includes(":") ? line.slice(0, line.indexOf(":")) : line;
    const cleaned = beforeColon
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:мкг|мг|г|мл|мо|од|%|mcg|mg|g|ml|iu)\b.*$/iu, "")
      .trim();
    if (cleaned && /\p{L}/u.test(cleaned)) forms.push(normalizeNationalListText(cleaned));
  }
  return [...new Set(forms)];
}

export function extractNationalListStrengths(value: string): string[] {
  const matches = value.match(
    /\b\d+(?:[.,]\d+)?\s*(?:мкг|мг|г|мл|мо|од|%|mcg|mg|g|ml|iu)(?:\s*\/\s*\d*(?:[.,]\d+)?\s*(?:мкг|мг|г|мл|мо|од|%|mcg|mg|g|ml|iu|доз(?:у|и)?|dose))?/giu,
  ) ?? [];
  return [...new Set(matches.map((item) =>
    normalizeNationalListText(item).replace(/,/gu, ".")))];
}

export function inferNationalListRoutes(value: string): string[] {
  const normalized = normalizeNationalListText(value);
  const routes: string[] = [];
  const add = (route: string, pattern: RegExp) => {
    if (pattern.test(normalized)) routes.push(route);
  };
  add("inhalation", /інгал|inhal/u);
  add("parenteral", /ін'єк|інфуз|inject|infus/u);
  add("oral", /таблет|капсул|перорал|ораль|сироп|гранул|oral/u);
  add("rectal", /ректал|супозитор|rectal|suppos/u);
  add("topical", /крем|мазь|гель|нашкір|topical|ointment/u);
  add("ophthalmic", /очн|офтальм|ophthalm/u);
  add("otic", /вуш|otic/u);
  add("nasal", /назал|nasal/u);
  add("vaginal", /вагін|vaginal/u);
  return [...new Set(routes)];
}

export function nationalListEntryStableKey(
  name: string,
  section: string,
  category: string,
  forms: string[],
  routes: string[],
): string {
  return createHash("sha256")
    .update(JSON.stringify([
      normalizeNationalListText(name),
      normalizeNationalListText(section),
      normalizeNationalListText(category),
      [...forms].sort(),
      [...routes].sort(),
    ]))
    .digest("hex");
}

export function parseNationalListHtml(
  html: string,
  options: { checkedAt?: string; expectedDocumentHash?: string | null } = {},
): NationalListSnapshot {
  const bytes = Buffer.from(html, "utf8");
  const releaseId = `ua-national-list-${NATIONAL_LIST_REVISION_DATE}`;
  const marker = html.indexOf("НАЦІОНАЛЬНИЙ ПЕРЕЛІК");
  const tableStart = marker >= 0 ? html.indexOf("<table", marker) : -1;
  const tableEnd = tableStart >= 0 ? html.indexOf("</table>", tableStart) : -1;
  const table = tableStart >= 0 && tableEnd >= 0
    ? html.slice(tableStart, tableEnd + 8)
    : "";
  const canonicalDocumentText = textFromHtml(table)
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
  const documentHash = createHash("sha256")
    .update(canonicalDocumentText, "utf8")
    .digest("hex");
  const errors: string[] = [];
  const expectedDocumentHash = options.expectedDocumentHash === undefined
    ? NATIONAL_LIST_EXPECTED_DOCUMENT_HASH
    : options.expectedDocumentHash;
  if (expectedDocumentHash && documentHash !== expectedDocumentHash) {
    errors.push("Official document hash changed; source review is required.");
  }
  const documentHeader = textFromHtml(html.slice(0, Math.max(marker, 0)));
  const hasReviewedAmendment = /№\s*1268\b/u.test(documentHeader) &&
    /08\.10\.2025/u.test(documentHeader);
  if (!hasReviewedAmendment) {
    errors.push("Official document revision changed; source metadata and parser review are required.");
  }
  if (marker < 0 || tableStart < 0 || tableEnd < 0) {
    errors.push("National list table was not found in the official document.");
  }
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)];
  const entries: NationalListEntry[] = [];
  let section = "";
  let category = "";
  let raw = 0;
  let invalid = 0;

  for (const [rowIndex, rowMatch] of rows.entries()) {
    const rowHtml = rowMatch[1];
    const cells = [...rowHtml.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/giu)]
      .map((match) => ({ attrs: match[1], text: textFromHtml(match[2]) }));
    if (cells.length === 1 || cells.some((cell) => /colspan\s*=\s*["']?2/iu.test(cell.attrs))) {
      const heading = cells.map((cell) => cell.text).join(" ").trim();
      if (!heading) continue;
      if (ROMAN_SECTION.test(heading)) {
        section = heading;
        category = "";
      } else if (NUMBERED_SECTION.test(heading) || heading !== "Додатковий перелік") {
        category = heading;
      }
      continue;
    }
    if (cells.length !== 2 || cells[0].text.startsWith("Клас, група")) continue;
    raw++;
    const name = parseOfficialName(`${cells[0].text}\n${cells[1].text}`);
    const dosageText = name?.trailing ?? "";
    if (!name || !section) {
      invalid++;
      errors.push(`Unable to parse national-list row ${rowIndex + 1}.`);
      continue;
    }
    const compositionName = name.en || name.ua.split(":").slice(1).join(":").trim();
    const ingredients = compositionName
      .split(/\s*(?:\+|;|\/(?!\d)|\b(?:and|with)\b)\s*/iu)
      .map((item) => item.trim())
      .filter(Boolean);
    const compositionSignature = ingredientSignature(compositionName);
    if (!compositionSignature || !ingredients.length) {
      invalid++;
      errors.push(`Unable to normalize national-list row ${rowIndex + 1}.`);
      continue;
    }
    const parsedDosageForms = dosageForms(dosageText);
    const parsedRoutes = inferNationalListRoutes(dosageText);
    entries.push({
      stableKey: nationalListEntryStableKey(
        name.en || name.ua,
        section,
        category,
        parsedDosageForms,
        parsedRoutes,
      ),
      officialNameUa: name.ua,
      officialNameEn: name.en,
      ingredients,
      compositionSignature,
      dosageForms: parsedDosageForms,
      routes: parsedRoutes,
      strengths: extractNationalListStrengths(dosageText),
      dosageText,
      section,
      category,
      restrictions: name.restrictions,
      sourceUrl: NATIONAL_LIST_CANONICAL_URL,
      sourceHash: documentHash,
      sourceLocator: `table-row:${rowIndex + 1}`,
      reviewStatus: "reviewed",
    });
  }

  const valid = entries.length;
  const provenanceCoverage = valid > 0 && entries.every((entry) =>
    entry.sourceUrl && entry.sourceHash && entry.sourceLocator)
    ? 100
    : 0;
  return {
    releaseId,
    status: errors.length ? "draft" : "reviewed",
    source: {
      title: NATIONAL_LIST_TITLE,
      actNumber: NATIONAL_LIST_ACT_NUMBER,
      actDate: NATIONAL_LIST_ACT_DATE,
      revisionDate: NATIONAL_LIST_REVISION_DATE,
      effectiveDate: NATIONAL_LIST_EFFECTIVE_DATE,
      sourceUrl: NATIONAL_LIST_CANONICAL_URL,
      canonicalUrl: NATIONAL_LIST_CANONICAL_URL,
      sourceDomain: "zakon.rada.gov.ua",
      checkedAt: options.checkedAt ?? new Date().toISOString(),
      sourceFormat: "html",
      documentHash,
      byteSize: bytes.length,
      parserVersion: NATIONAL_LIST_PARSER_VERSION,
    },
    counts: {
      raw,
      parsed: valid + invalid,
      valid,
      invalid,
      provenanceCoverage,
    },
    errors,
    entries,
  };
}
