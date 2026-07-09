import { normalize } from "../../lib/text";

const CYRILLIC_TO_LATIN = new Map<string, string>([
  ["а", "a"],
  ["б", "b"],
  ["в", "v"],
  ["г", "h"],
  ["ґ", "g"],
  ["д", "d"],
  ["е", "e"],
  ["є", "ie"],
  ["ж", "zh"],
  ["з", "z"],
  ["и", "y"],
  ["і", "i"],
  ["ї", "i"],
  ["й", "i"],
  ["к", "k"],
  ["л", "l"],
  ["м", "m"],
  ["н", "n"],
  ["о", "o"],
  ["п", "p"],
  ["р", "r"],
  ["с", "s"],
  ["т", "t"],
  ["у", "u"],
  ["ф", "f"],
  ["х", "kh"],
  ["ц", "ts"],
  ["ч", "ch"],
  ["ш", "sh"],
  ["щ", "shch"],
  ["ь", ""],
  ["ю", "iu"],
  ["я", "ia"],
]);

export function hasCyrillic(value: string): boolean {
  return /[А-Яа-яІіЇїЄєҐґ]/.test(value);
}

export function transliterateUkrainianToLatin(value: string): string {
  return [...value]
    .map((ch) => {
      const lower = ch.toLowerCase();
      if (CYRILLIC_TO_LATIN.has(lower)) return CYRILLIC_TO_LATIN.get(lower)!;
      if (/[\u2019\u02bc'`]/.test(ch)) return "";
      if (/[\s\-+/]/.test(ch)) return " ";
      if (/[a-z0-9]/i.test(ch)) return ch.toLowerCase();
      return "";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugifyName(value: string): string {
  const transliterated = hasCyrillic(value)
    ? transliterateUkrainianToLatin(value)
    : value;
  const slug = transliterated
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || normalize(value);
}

export function ingredientIdForInn(canonicalInn: string): string {
  return `ing-${slugifyName(canonicalInn)}`;
}

export function generateTypoCandidates(name: string, limit = 4): string[] {
  const out = new Set<string>();
  const trimmed = name.trim();
  if (!trimmed || trimmed.length < 5) return [];

  const lower = trimmed.toLowerCase();
  const replacements: Array<[RegExp, string]> = [
    [/і/g, "и"],
    [/и/g, "і"],
    [/е/g, "є"],
    [/є/g, "е"],
    [/о/g, "а"],
    [/а/g, "о"],
    [/ph/gi, "f"],
    [/y/gi, "i"],
  ];

  for (const [pattern, replacement] of replacements) {
    const candidate = lower.replace(pattern, replacement);
    if (normalize(candidate) !== normalize(trimmed)) out.add(candidate);
    if (out.size >= limit) break;
  }

  const noSoftSign = lower.replace(/ь/g, "");
  if (normalize(noSoftSign) !== normalize(trimmed)) out.add(noSoftSign);

  return [...out].slice(0, limit);
}
