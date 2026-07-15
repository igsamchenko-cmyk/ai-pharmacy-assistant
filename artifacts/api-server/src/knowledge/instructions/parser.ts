import { createHash } from "node:crypto";
import {
  INSTRUCTION_SECTION_KEYS,
  type DrugInstructionSnapshot,
  type InstructionSectionKey,
  type InstructionSections,
  type InstructionSourceProduct,
  registrationKey,
} from "./model";

export const INSTRUCTION_PARSER_VERSION = "ua-drlz-mht-v1" as const;
const MAX_DOCUMENT_BYTES = 3_000_000;
const MAX_SECTION_CHARS = 60_000;

const HEADING_ALIASES: Record<InstructionSectionKey, string[]> = {
  indications: ["показання"],
  contraindications: ["протипоказання"],
  adverseReactions: ["побічні реакції"],
  interactions: [
    "взаємодія з іншими лікарськими засобами та інші види взаємодій",
    "взаємодії з іншими лікарськими засобами",
  ],
  specialWarnings: ["особливості застосування"],
  pregnancyAndLactation: [
    "застосування у період вагітності або годування груддю",
    "застосування в період вагітності або годування груддю",
    "застосування у період вагітності та годування груддю",
    "застосування в період вагітності та годування груддю",
  ],
  administration: ["спосіб застосування та дози", "спосіб застосування"],
  overdose: ["передозування"],
  storage: ["умови зберігання", "зберігання"],
};

const OTHER_BOUNDARIES = [
  /^клінічні характеристики$/iu,
  /^фармакологічні властивості$/iu,
  /^діти$/iu,
  /^несумісність$/iu,
  /^здатність впливати на швидкість реакції/iu,
  /^термін придатності$/iu,
  /^упаковка$/iu,
  /^категорія відпуску$/iu,
  /^виробник$/iu,
  /^місцезнаходження виробника/iu,
  /^дата останнього перегляду/iu,
];

export interface ParseInstructionOptions {
  source: InstructionSourceProduct;
  dataset: {
    title: string;
    url: string;
    license: string;
  };
  checkedAt?: Date;
  lastModified?: string | null;
}

function normalizeHeading(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u00a0\s]+/gu, " ")
    .replace(/п\s+оказання/giu, "показання")
    .replace(/вза\s+ємод/giu, "взаємод")
    .replace(/спос\s+іб/giu, "спосіб")
    .replace(/\s+([.:])/gu, "$1")
    .trim();
}

function sourceDocumentId(sourceUrl: string): string | null {
  try {
    const url = new URL(sourceUrl);
    const match = url.pathname.match(/\/id\/([A-F0-9]{32})\/\$file\//iu);
    return match?.[1]?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

function sourceRegistrationKey(sourceUrl: string): string | null {
  try {
    const url = new URL(sourceUrl);
    const match = decodeURIComponent(url.pathname).match(
      /\/\$file\/(UA\d+)_[A-F0-9]+\.mht$/iu,
    );
    return match?.[1]?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

export function isAllowedInstructionSource(sourceUrl: string): boolean {
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.toLowerCase();
    return (url.protocol === "http:" || url.protocol === "https:") &&
      (host === "drlz.com.ua" || host === "www.drlz.com.ua") &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/ibp\/lz_www\.nsf\/id\/[A-F0-9]{32}\/\$file\/UA\d+_[A-F0-9]+\.mht$/iu.test(
        decodeURIComponent(url.pathname),
      );
  } catch {
    return false;
  }
}

function parsePartHeaders(value: string): Record<string, string> {
  const headers: Record<string, string> = {};
  let current = "";
  for (const line of value.split(/\r?\n/u)) {
    if (/^[ \t]/u.test(line) && current) {
      headers[current] = `${headers[current]} ${line.trim()}`;
      continue;
    }
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    current = line.slice(0, separator).trim().toLowerCase();
    headers[current] = line.slice(separator + 1).trim();
  }
  return headers;
}

function decodeQuotedPrintable(value: string): Buffer {
  const compact = value.replace(/=\r?\n/gu, "");
  const bytes: number[] = [];
  for (let index = 0; index < compact.length; index += 1) {
    const current = compact[index] ?? "";
    const hex = compact.slice(index + 1, index + 3);
    if (current === "=" && /^[A-F0-9]{2}$/iu.test(hex)) {
      bytes.push(Number.parseInt(hex, 16));
      index += 2;
      continue;
    }
    bytes.push(current.charCodeAt(0) & 0xff);
  }
  return Buffer.from(bytes);
}

function decodeMimeBody(body: string, headers: Record<string, string>): string {
  const transfer = headers["content-transfer-encoding"]?.toLowerCase() ?? "";
  const contentType = headers["content-type"] ?? "";
  const charset = contentType.match(/charset=["']?([^;"'\s]+)/iu)?.[1] ?? "utf-8";
  const bytes = transfer.includes("quoted-printable")
    ? decodeQuotedPrintable(body)
    : transfer.includes("base64")
      ? Buffer.from(body.replace(/\s+/gu, ""), "base64")
      : Buffer.from(body, "latin1");
  const encoding = /^us-ascii$/iu.test(charset) ? "utf-8" : charset;
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export function extractHtmlFromMht(raw: Buffer): string {
  const source = raw.toString("latin1");
  const boundary = source.match(/boundary=["']?([^;"'\r\n]+)/iu)?.[1];
  if (!boundary) throw new Error("unsupported_mht_boundary");

  for (const part of source.split(`--${boundary}`)) {
    const normalized = part.replace(/^\r?\n/u, "");
    const separator = normalized.search(/\r?\n\r?\n/u);
    if (separator < 0) continue;
    const headerText = normalized.slice(0, separator);
    const body = normalized.slice(separator).replace(/^\r?\n\r?\n/u, "");
    const headers = parsePartHeaders(headerText);
    if (!headers["content-type"]?.toLowerCase().includes("text/html")) continue;
    return decodeMimeBody(body, headers);
  }
  throw new Error("unsupported_mht_html_missing");
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    deg: "°",
    gt: ">",
    laquo: "«",
    lt: "<",
    middot: "·",
    nbsp: " ",
    ordm: "º",
    quot: '"',
    raquo: "»",
    reg: "®",
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (entity, key: string) => {
    if (key.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
    }
    if (key.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
    }
    return named[key.toLowerCase()] ?? entity;
  });
}

function textFromHtmlFragment(value: string): string {
  return normalizeHeading(
    decodeHtmlEntities(
      value
        .replace(/<!--.*?-->/gsu, " ")
        .replace(/<br\s*\/?>/giu, " ")
        .replace(/<[^>]+>/gu, " "),
    ),
  );
}

export function extractInstructionParagraphs(html: string): string[] {
  const content = html
    .replace(/<(script|style|xml)\b[^>]*>[\s\S]*?<\/\1>/giu, " ")
    .replace(/<!--.*?-->/gsu, " ");
  const paragraphs = [...content.matchAll(/<(?:p|li)\b[^>]*>([\s\S]*?)<\/(?:p|li)>/giu)]
    .map((match) => textFromHtmlFragment(match[1] ?? ""))
    .filter(Boolean);
  if (!paragraphs.length) throw new Error("unsupported_mht_paragraphs_missing");
  return paragraphs;
}

interface SectionHeadingMatch {
  key: InstructionSectionKey;
  inlineContent: string;
}

function sectionHeading(value: string): SectionHeadingMatch | null {
  const normalized = normalizeHeading(value);
  const lower = normalized.toLocaleLowerCase("uk-UA");
  for (const key of INSTRUCTION_SECTION_KEYS) {
    for (const alias of HEADING_ALIASES[key]) {
      if (lower === alias || lower === `${alias}.` || lower === `${alias}:`) {
        return { key, inlineContent: "" };
      }
      if (lower.startsWith(`${alias}. `) || lower.startsWith(`${alias}: `)) {
        return {
          key,
          inlineContent: normalized.slice(alias.length + 1).trim(),
        };
      }
    }
  }
  return null;
}

function isOtherBoundary(value: string): boolean {
  const normalized = normalizeHeading(value).replace(/[.:]+$/u, "");
  return OTHER_BOUNDARIES.some((pattern) => pattern.test(normalized));
}

function boundedSection(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, MAX_SECTION_CHARS);
}

export function extractInstructionSections(paragraphs: string[]): InstructionSections {
  const result = Object.fromEntries(
    INSTRUCTION_SECTION_KEYS.map((key) => [key, null]),
  ) as InstructionSections;
  const firstHeadings = new Map<InstructionSectionKey, {
    index: number;
    heading: SectionHeadingMatch;
  }>();

  for (let index = 0; index < paragraphs.length; index += 1) {
    const heading = sectionHeading(paragraphs[index] ?? "");
    if (heading && !firstHeadings.has(heading.key)) {
      firstHeadings.set(heading.key, { index, heading });
    }
  }
  const canonicalHeadingIndexes = new Set(
    [...firstHeadings.values()].map(({ index }) => index),
  );

  for (const key of INSTRUCTION_SECTION_KEYS) {
    const selected = firstHeadings.get(key);
    if (!selected) continue;
    let end = selected.index + 1;
    while (
      end < paragraphs.length &&
      !canonicalHeadingIndexes.has(end) &&
      !isOtherBoundary(paragraphs[end] ?? "")
    ) end += 1;
    result[key] = boundedSection([
      selected.heading.inlineContent,
      ...paragraphs.slice(selected.index + 1, end),
    ].filter(Boolean).join("\n\n"));
  }
  return result;
}

function parsedDocumentDate(html: string, lastModified?: string | null): string | null {
  const value = html.match(/<o:(?:LastSaved|Created)>([^<]+)<\/o:(?:LastSaved|Created)>/iu)?.[1]
    ?? lastModified
    ?? null;
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function contentLocationMatches(html: string, registrationNumber: string): boolean {
  const key = registrationKey(registrationNumber);
  return [...html.matchAll(/Content-Location:\s*([^\r\n]+)/giu)]
    .some((match) => [...(match[1] ?? "").matchAll(
      /(?:^|[^A-Z0-9])(UA\d+)(?=[^0-9]|$)/giu,
    )].some((token) => token[1]?.toUpperCase() === key));
}

export function parseOfficialInstructionMht(
  raw: Buffer,
  options: ParseInstructionOptions,
): DrugInstructionSnapshot {
  if (!raw.length || raw.length > MAX_DOCUMENT_BYTES) {
    throw new Error("instruction_document_size_invalid");
  }
  const sourceAllowed = isAllowedInstructionSource(options.source.sourceUrl);
  const documentId = sourceDocumentId(options.source.sourceUrl);
  if (!sourceAllowed || !documentId) throw new Error("instruction_source_not_allowed");

  const sourceKey = registrationKey(options.source.registrationNumber);
  const sourceRegistrationMatched = sourceRegistrationKey(options.source.sourceUrl) === sourceKey;
  const html = extractHtmlFromMht(raw);
  const locationMatched = contentLocationMatches(raw.toString("latin1"), options.source.registrationNumber);
  const registrationMatched = sourceRegistrationMatched && locationMatched;
  const sections = extractInstructionSections(extractInstructionParagraphs(html));
  const availableSectionCount = INSTRUCTION_SECTION_KEYS.filter((key) => sections[key]).length;
  const warnings = INSTRUCTION_SECTION_KEYS
    .filter((key) => !sections[key])
    .map((key) => `missing_section:${key.replace(/[A-Z]/gu, (value) => `_${value.toLowerCase()}`)}`);
  const status = !registrationMatched
    ? "needs_review" as const
    : availableSectionCount === INSTRUCTION_SECTION_KEYS.length
      ? "available" as const
      : availableSectionCount > 0
        ? "partial" as const
        : "unavailable" as const;

  return {
    version: "1.0",
    registryProductId: options.source.registryProductId,
    registrationNumber: options.source.registrationNumber,
    tradeName: options.source.tradeName,
    inn: options.source.inn,
    activeIngredient: options.source.activeIngredient,
    dosageForm: options.source.dosageForm,
    strength: options.source.strength,
    manufacturer: options.source.manufacturer,
    manufacturerCountry: options.source.manufacturerCountry,
    registrationStartDate: options.source.registrationStartDate,
    registrationEndDate: options.source.registrationEndDate,
    status,
    sections,
    source: {
      url: options.source.sourceUrl,
      documentId,
      documentDate: parsedDocumentDate(html, options.lastModified),
      checkedAt: (options.checkedAt ?? new Date()).toISOString(),
      documentHash: createHash("sha256").update(raw).digest("hex"),
      contentLength: raw.length,
      parserVersion: INSTRUCTION_PARSER_VERSION,
      datasetTitle: options.dataset.title,
      datasetUrl: options.dataset.url,
      license: options.dataset.license,
    },
    provenance: {
      sourceAllowed,
      registrationMatched,
      contentLocationMatched: locationMatched,
      availableSectionCount,
      coveragePct: Math.round((availableSectionCount / INSTRUCTION_SECTION_KEYS.length) * 100),
    },
    warnings,
  };
}
