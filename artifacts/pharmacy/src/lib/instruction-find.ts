/**
 * PR-I, I.1: "Знайти в тексті" -- a purely local, case-insensitive
 * substring search across the already-loaded structured instruction
 * sections, plus the shared fragment-highlighting used both by find
 * matches and by the pre-existing exact-quote anchors (hospital facts,
 * `#instruction-quote-{key}-{start}-{end}` deep links). This never calls
 * the server: it only searches text the card has already fetched.
 */

export interface TextMatch {
  start: number;
  end: number;
}

const MIN_FIND_TERM_LENGTH = 2;

/**
 * Finds every non-overlapping occurrence of `term` in `content`,
 * case-insensitively under Ukrainian collation. Terms shorter than two
 * characters are ignored (consistent with the two-character minimum the
 * server-side full-text search already enforces) to avoid highlighting
 * near-every letter in a section.
 */
export function findTextMatches(
  content: string,
  term: string,
): TextMatch[] {
  const normalizedTerm = term.trim().toLocaleLowerCase("uk-UA");
  if (normalizedTerm.length < MIN_FIND_TERM_LENGTH) return [];
  const normalizedContent = content.toLocaleLowerCase("uk-UA");
  if (normalizedContent.length !== content.length) {
    // A locale-sensitive lowercase changed the string length (rare Unicode
    // special-casing) -- offsets would no longer line up with `content`,
    // so skip highlighting rather than mark the wrong characters.
    return [];
  }
  const matches: TextMatch[] = [];
  let cursor = 0;
  while (cursor <= normalizedContent.length) {
    const index = normalizedContent.indexOf(normalizedTerm, cursor);
    if (index === -1) break;
    matches.push({ start: index, end: index + normalizedTerm.length });
    cursor = index + normalizedTerm.length;
  }
  return matches;
}

export interface ContentMark {
  id: string;
  start: number;
  end: number;
  className: string;
  /** Extra `data-*` attributes the caller wants rendered on the `<mark>`
   * (e.g. the exact-quote anchor's `data-char-start`/`data-char-end`). */
  dataset?: Record<string, string>;
}

/**
 * Splits `content` into an ordered list of plain-text and marked segments
 * for rendering. Marks are deduplicated by exact `start:end` range (the
 * last occurrence in `marks` wins, matching plain `Map` semantics) and any
 * mark that would start before the current cursor
 * (an overlap with an earlier, already-placed mark) is dropped rather than
 * corrupting the slice order -- the same conservative rule the pre-existing
 * quote-anchor renderer used.
 */
export function buildHighlightFragments(
  content: string,
  marks: readonly ContentMark[],
): Array<{ text: string; mark: ContentMark | null }> {
  const validSorted = [
    ...new Map(
      marks
        .filter(
          (mark) =>
            mark.start >= 0 &&
            mark.end <= content.length &&
            mark.end > mark.start,
        )
        .map((mark) => [`${mark.start}:${mark.end}`, mark]),
    ).values(),
  ].sort((left, right) => left.start - right.start);

  const fragments: Array<{ text: string; mark: ContentMark | null }> = [];
  let cursor = 0;
  for (const mark of validSorted) {
    if (mark.start < cursor) continue;
    if (mark.start > cursor) {
      fragments.push({ text: content.slice(cursor, mark.start), mark: null });
    }
    fragments.push({ text: content.slice(mark.start, mark.end), mark });
    cursor = mark.end;
  }
  if (cursor < content.length) {
    fragments.push({ text: content.slice(cursor), mark: null });
  }
  return fragments;
}

export interface SectionMatchGroup {
  sectionKey: string;
  matches: TextMatch[];
}

/** A single match's position within the flattened, cross-section match list
 * used to drive the prev/next "match X/Y" navigation. */
export interface FlatMatch {
  sectionKey: string;
  matchIndexInSection: number;
}

export function flattenSectionMatches(
  groups: readonly SectionMatchGroup[],
): FlatMatch[] {
  const flat: FlatMatch[] = [];
  for (const group of groups) {
    group.matches.forEach((_, matchIndexInSection) => {
      flat.push({ sectionKey: group.sectionKey, matchIndexInSection });
    });
  }
  return flat;
}

export function findMatchElementId(
  sectionKey: string,
  matchIndexInSection: number,
): string {
  return `instruction-find-match-${sectionKey}-${matchIndexInSection}`;
}
