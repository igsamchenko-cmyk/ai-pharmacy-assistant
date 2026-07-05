/**
 * Normalize user-entered drug names for dictionary matching.
 *
 * Search is forgiving about casing, apostrophe variants, soft separators,
 * hyphens and spaces. Letters and digits stay intact; punctuation-like
 * separators collapse so hyphenated and spaced variants share one key.
 */
export function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\u2019\u02bc\u2018\u0060\u00b4\u02b9\u2032']/g, "")
    .replace(/[\s\-_\u2010\u2011\u2012\u2013\u2014\u2015./\\()+]+/g, "");
}
