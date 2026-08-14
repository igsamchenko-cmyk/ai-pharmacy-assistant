export const LATIN_TO_UKRAINIAN_LAYOUT: Readonly<Record<string, string>> = {
  q: "й",
  w: "ц",
  e: "у",
  r: "к",
  t: "е",
  y: "н",
  u: "г",
  i: "ш",
  o: "щ",
  p: "з",
  "[": "х",
  "]": "ї",
  a: "ф",
  s: "і",
  d: "в",
  f: "а",
  g: "п",
  h: "р",
  j: "о",
  k: "л",
  l: "д",
  ";": "ж",
  z: "я",
  x: "ч",
  c: "с",
  v: "м",
  b: "и",
  n: "т",
  m: "ь",
  ",": "б",
  ".": "ю",
};

export const UKRAINIAN_TO_LATIN_LAYOUT: Readonly<Record<string, string>> =
  Object.freeze(
    Object.fromEntries(
      Object.entries(LATIN_TO_UKRAINIAN_LAYOUT).map(([latin, ukrainian]) => [
        ukrainian,
        latin,
      ]),
    ),
  );

const LATIN_LETTER = /[a-z]/u;
const UKRAINIAN_LETTER = /[а-щьюяєіїґ]/u;
const LETTER = /\p{L}/u;

/**
 * Convert a query typed with the wrong physical keyboard layout.
 *
 * Numbers deliberately disable conversion: registration numbers and dosage
 * fragments are safety-sensitive identifiers, not spelling suggestions.
 */
export function convertCatalogKeyboardLayout(value: string): string | null {
  const normalized = value
    .normalize("NFKD")
    .toLocaleLowerCase("uk-UA")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/ґ/gu, "г")
    .replace(/[\u2019\u02bc\u2018\u0060\u00b4\u02b9\u2032']/gu, "")
    .replace(/[\-\u2010\u2011\u2012\u2013\u2014\u2015]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (!normalized || /\d/u.test(normalized)) return null;

  const letters = [...normalized].filter((character) => LETTER.test(character));
  if (!letters.length) return null;
  const latinShare =
    letters.filter((character) => LATIN_LETTER.test(character)).length /
    letters.length;
  const ukrainianShare =
    letters.filter((character) => UKRAINIAN_LETTER.test(character)).length /
    letters.length;
  const map =
    latinShare >= 0.8
      ? LATIN_TO_UKRAINIAN_LAYOUT
      : ukrainianShare >= 0.8
        ? UKRAINIAN_TO_LATIN_LAYOUT
        : null;
  if (!map) return null;

  const converted = [...normalized]
    .map((character) => map[character] ?? character)
    .join("");
  return converted && converted !== normalized ? converted : null;
}
