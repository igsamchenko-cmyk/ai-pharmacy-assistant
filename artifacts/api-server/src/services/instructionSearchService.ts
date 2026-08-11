import {
  getInstructionForProduct,
  loadInstructionManifest,
} from "../knowledge/instructions/catalog";
import {
  INSTRUCTION_SECTION_KEYS,
  type DrugInstructionSnapshot,
  type InstructionSectionKey,
} from "../knowledge/instructions/model";
import { transliterateUkrainianToLatin } from "../knowledge/ingestion/transliteration";

const MAX_PASSAGE_LENGTH = 1_600;
const MIN_PASSAGE_LENGTH = 240;
const MAX_RESULTS = 30;
const MAX_QUERY_TERMS = 12;

const STOP_WORDS = new Set([
  "і",
  "й",
  "та",
  "або",
  "з",
  "із",
  "зі",
  "у",
  "в",
  "на",
  "до",
  "для",
  "при",
  "про",
  "по",
  "чи",
  "чим",
  "як",
  "який",
  "яка",
  "які",
  "що",
  "це",
]);

const SECTION_PRIORITY: Record<InstructionSectionKey, number> = {
  administration: 0,
  interactions: 2,
  specialWarnings: 4,
  contraindications: 6,
  overdose: 8,
  storage: 10,
  indications: 12,
  adverseReactions: 14,
  pregnancyAndLactation: 16,
};

const ENGLISH_TO_UKRAINIAN_KEYBOARD: Readonly<Record<string, string>> = {
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
  "'": "є",
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

const UKRAINIAN_TO_ENGLISH_KEYBOARD = Object.fromEntries(
  Object.entries(ENGLISH_TO_UKRAINIAN_KEYBOARD).map(([latin, ukrainian]) => [
    ukrainian,
    latin,
  ]),
) as Readonly<Record<string, string>>;

export type InstructionSearchSection = InstructionSectionKey | "all";
export type InstructionSearchMatchMode =
  | "exact_phrase"
  | "all_terms"
  | "transliteration"
  | "keyboard_layout"
  | "approximate";

export interface InstructionSearchInput {
  q: string;
  section?: InstructionSearchSection;
  limit?: number;
}

export interface InstructionSearchHighlight {
  charStart: number;
  charEnd: number;
}

export interface InstructionSearchItem {
  registryProductId: string;
  registrationNumber: string;
  tradeName: string;
  inn: string;
  dosageForm: string;
  strength: string;
  sectionKey: InstructionSectionKey;
  quote: {
    text: string;
    sectionKey: InstructionSectionKey;
    charStart: number;
    charEnd: number;
  };
  highlights: InstructionSearchHighlight[];
  matchedTerms: string[];
  matchMode: InstructionSearchMatchMode;
  source: {
    url: string;
    documentDate: string | null;
    checkedAt: string;
    coveragePct: number;
  };
}

export interface InstructionSearchResponse {
  query: string;
  normalizedQuery: string;
  section: InstructionSearchSection;
  total: number;
  indexedInstructionCount: number;
  snapshotGeneratedAt: string;
  durationMs: number;
  items: InstructionSearchItem[];
}

interface TextToken {
  text: string;
  normalized: string;
  latin: string;
  charStart: number;
  charEnd: number;
}

interface IndexedPassage {
  id: number;
  snapshot: DrugInstructionSnapshot;
  sectionKey: InstructionSectionKey;
  text: string;
  charStart: number;
  charEnd: number;
  tokens: TextToken[];
  metadataTokens: TextToken[];
}

interface IndexedSection {
  id: number;
  sectionKey: InstructionSectionKey;
  passageIds: number[];
}

interface InstructionSearchIndex {
  passages: IndexedPassage[];
  sections: IndexedSection[];
  exactPostings: Map<string, Set<number>>;
  prefixPostings: Map<string, Set<number>>;
  vocabulary: Set<string>;
  generatedAt: string;
  instructionCount: number;
}

interface QueryPlan {
  mode: "direct" | "keyboard_layout";
  allTerms: string[];
  terms: string[];
}

interface TokenMatch {
  token: TextToken;
  quality: number;
  usedLatin: boolean;
  metadata: boolean;
}

interface ScoredPassage {
  passage: IndexedPassage;
  score: number;
  matchMode: InstructionSearchMatchMode;
  matches: TokenMatch[];
}

function normalizeToken(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("uk-UA")
    .replace(/[’ʼ'`]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function normalizeInstructionSearchQuery(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("uk-UA")
    .replace(/[’ʼ'`]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function tokenize(value: string, offset = 0): TextToken[] {
  return [...value.matchAll(/[\p{L}\p{N}]+/gu)]
    .map((match) => {
      const text = match[0];
      const normalized = normalizeToken(text);
      const start = offset + (match.index ?? 0);
      return {
        text,
        normalized,
        latin: normalizeToken(transliterateUkrainianToLatin(text)),
        charStart: start,
        charEnd: start + text.length,
      };
    })
    .filter((token) => token.normalized.length > 0);
}

function trimSpan(text: string, start: number, end: number) {
  while (start < end && /\s/u.test(text[start] ?? "")) start++;
  while (end > start && /\s/u.test(text[end - 1] ?? "")) end--;
  return { start, end };
}

function splitLongSpan(text: string, start: number, end: number) {
  const spans: Array<{ start: number; end: number }> = [];
  let cursor = start;
  while (end - cursor > MAX_PASSAGE_LENGTH) {
    const hardEnd = cursor + MAX_PASSAGE_LENGTH;
    const minimumEnd = cursor + MIN_PASSAGE_LENGTH;
    const candidate = text.slice(cursor, hardEnd);
    let splitAt = -1;
    for (const marker of candidate.matchAll(/[.!?](?=\s|$)/gu)) {
      const absolute = cursor + (marker.index ?? 0) + marker[0].length;
      if (absolute >= minimumEnd) splitAt = absolute;
    }
    if (splitAt < minimumEnd) {
      const whitespace = candidate.lastIndexOf(" ");
      splitAt =
        whitespace >= MIN_PASSAGE_LENGTH ? cursor + whitespace : hardEnd;
    }
    const span = trimSpan(text, cursor, splitAt);
    if (span.end > span.start) spans.push(span);
    cursor = splitAt;
  }
  const tail = trimSpan(text, cursor, end);
  if (tail.end > tail.start) spans.push(tail);
  return spans;
}

function splitIntoPassages(text: string) {
  const spans: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const separator of text.matchAll(/\n\s*\n/gu)) {
    const end = separator.index ?? cursor;
    const paragraph = trimSpan(text, cursor, end);
    if (paragraph.end > paragraph.start) {
      spans.push(...splitLongSpan(text, paragraph.start, paragraph.end));
    }
    cursor = end + separator[0].length;
  }
  const tail = trimSpan(text, cursor, text.length);
  if (tail.end > tail.start) {
    spans.push(...splitLongSpan(text, tail.start, tail.end));
  }
  const combined: Array<{ start: number; end: number }> = [];
  for (const span of spans) {
    const previous = combined.at(-1);
    if (previous && span.end - previous.start <= MAX_PASSAGE_LENGTH) {
      previous.end = span.end;
    } else {
      combined.push({ ...span });
    }
  }
  return combined;
}

function addPosting(map: Map<string, Set<number>>, key: string, id: number) {
  if (!key) return;
  const posting = map.get(key) ?? new Set<number>();
  posting.add(id);
  map.set(key, posting);
}

function indexSearchKey(
  index: InstructionSearchIndex,
  value: string,
  passageId: number,
) {
  if (!value) return;
  const firstOccurrence = !index.exactPostings.has(value);
  addPosting(index.exactPostings, value, passageId);
  const maximumPrefix = Math.min(8, value.length);
  for (let length = 2; length <= maximumPrefix; length++) {
    addPosting(index.prefixPostings, value.slice(0, length), passageId);
  }
  if (!firstOccurrence) return;
  index.vocabulary.add(value);
}

function metadataTokens(snapshot: DrugInstructionSnapshot): TextToken[] {
  return tokenize(
    [
      snapshot.tradeName,
      snapshot.inn,
      snapshot.activeIngredient,
      snapshot.dosageForm,
      snapshot.strength,
      snapshot.registrationNumber,
    ].join(" "),
  );
}

export function buildInstructionSearchIndex(
  snapshots: readonly DrugInstructionSnapshot[],
  generatedAt = new Date(0).toISOString(),
): InstructionSearchIndex {
  const index: InstructionSearchIndex = {
    passages: [],
    sections: [],
    exactPostings: new Map(),
    prefixPostings: new Map(),
    vocabulary: new Set(),
    generatedAt,
    instructionCount: snapshots.length,
  };

  for (const snapshot of snapshots) {
    const metadata = metadataTokens(snapshot);
    for (const sectionKey of INSTRUCTION_SECTION_KEYS) {
      const section = snapshot.sections[sectionKey];
      if (!section) continue;
      const indexedSection: IndexedSection = {
        id: index.sections.length,
        sectionKey,
        passageIds: [],
      };
      const keys = new Set<string>();
      for (const span of splitIntoPassages(section)) {
        const passage: IndexedPassage = {
          id: index.passages.length,
          snapshot,
          sectionKey,
          text: section.slice(span.start, span.end),
          charStart: span.start,
          charEnd: span.end,
          tokens: tokenize(section.slice(span.start, span.end), span.start),
          metadataTokens: metadata,
        };
        index.passages.push(passage);
        indexedSection.passageIds.push(passage.id);
        for (const token of [...passage.tokens, ...metadata]) {
          keys.add(token.normalized);
          keys.add(token.latin);
        }
      }
      if (!indexedSection.passageIds.length) continue;
      index.sections.push(indexedSection);
      for (const key of keys) indexSearchKey(index, key, indexedSection.id);
    }
  }

  return index;
}

function convertKeyboard(
  value: string,
  layout: Readonly<Record<string, string>>,
) {
  return [...value]
    .map(
      (character) => layout[character.toLocaleLowerCase("uk-UA")] ?? character,
    )
    .join("");
}

function queryTerms(value: string): { allTerms: string[]; terms: string[] } {
  const allTerms = tokenize(value)
    .map((token) => token.normalized)
    .filter(Boolean)
    .slice(0, MAX_QUERY_TERMS);
  const meaningful = allTerms.filter((term) => !STOP_WORDS.has(term));
  return { allTerms, terms: meaningful.length ? meaningful : allTerms };
}

function queryPlans(query: string): QueryPlan[] {
  const plans: QueryPlan[] = [];
  const seen = new Set<string>();
  const add = (value: string, mode: QueryPlan["mode"]) => {
    const parsed = queryTerms(value);
    const key = parsed.terms.join(" ");
    if (!key || seen.has(key)) return;
    seen.add(key);
    plans.push({ mode, ...parsed });
  };
  add(query, "direct");
  if (/[a-z]/iu.test(query)) {
    add(
      convertKeyboard(query, ENGLISH_TO_UKRAINIAN_KEYBOARD),
      "keyboard_layout",
    );
  }
  if (/[а-яіїєґ]/iu.test(query)) {
    add(
      convertKeyboard(query, UKRAINIAN_TO_ENGLISH_KEYBOARD),
      "keyboard_layout",
    );
  }
  return plans;
}

function stemLength(value: string): number {
  if (/^\d+$/u.test(value)) return value.length;
  if (value.length <= 4) return value.length;
  return Math.min(8, Math.max(5, value.length - 3));
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let first = left;
  let second = right;
  if (first.length > second.length) [first, second] = [second, first];
  let indexFirst = 0;
  let indexSecond = 0;
  let edits = 0;
  while (indexFirst < first.length && indexSecond < second.length) {
    if (first[indexFirst] === second[indexSecond]) {
      indexFirst++;
      indexSecond++;
      continue;
    }
    edits++;
    if (edits > 1) return false;
    if (first.length === second.length) indexFirst++;
    indexSecond++;
  }
  if (indexFirst < first.length || indexSecond < second.length) edits++;
  return edits <= 1;
}

function tokenMatch(
  term: string,
  token: TextToken,
  metadata: boolean,
): TokenMatch | null {
  const keys = [
    { value: token.normalized, usedLatin: false },
    { value: token.latin, usedLatin: token.latin !== token.normalized },
  ].filter(
    (entry, index, values) =>
      Boolean(entry.value) &&
      values.findIndex((value) => value.value === entry.value) === index,
  );
  let best: TokenMatch | null = null;
  for (const key of keys) {
    let quality = Number.POSITIVE_INFINITY;
    if (term === key.value) quality = 0;
    else {
      const length = stemLength(term);
      if (
        term.length >= 2 &&
        key.value.length >= length &&
        term.slice(0, length) === key.value.slice(0, length)
      ) {
        quality = 2;
      } else if (
        term.length >= 5 &&
        key.value.length >= 5 &&
        editDistanceAtMostOne(term, key.value)
      ) {
        quality = 3;
      }
    }
    if (Number.isFinite(quality) && (!best || quality < best.quality)) {
      best = { token, quality, usedLatin: key.usedLatin, metadata };
    }
  }
  return best;
}

function candidateIdsForTerm(
  index: InstructionSearchIndex,
  term: string,
): Set<number> {
  const ids = new Set<number>();
  const add = (posting?: ReadonlySet<number>) => {
    if (posting) for (const id of posting) ids.add(id);
  };
  add(index.exactPostings.get(term));
  add(index.prefixPostings.get(term.slice(0, stemLength(term))));
  if (!ids.size && term.length >= 5 && term.length <= 32) {
    let fuzzyMatches = 0;
    for (const word of index.vocabulary) {
      if (editDistanceAtMostOne(term, word)) {
        add(index.exactPostings.get(word));
        fuzzyMatches++;
        if (fuzzyMatches >= 64) break;
      }
    }
  }
  return ids;
}

function intersect(left: Set<number> | null, right: ReadonlySet<number>) {
  if (!left) return new Set(right);
  for (const value of left) if (!right.has(value)) left.delete(value);
  return left;
}

function bestTokenMatch(
  term: string,
  passage: IndexedPassage,
): TokenMatch | null {
  let best: TokenMatch | null = null;
  for (const token of passage.tokens) {
    const match = tokenMatch(term, token, false);
    if (match && (!best || match.quality < best.quality)) best = match;
    if (best?.quality === 0) break;
  }
  if (best?.quality === 0) return best;
  for (const token of passage.metadataTokens) {
    const match = tokenMatch(term, token, true);
    if (match && (!best || match.quality < best.quality)) best = match;
    if (best?.quality === 0) break;
  }
  return best;
}

function containsPhrase(passage: IndexedPassage, terms: string[]): boolean {
  if (terms.length < 2) return false;
  const phrase = terms.join(" ");
  const normalized = passage.tokens.map((token) => token.normalized).join(" ");
  if (normalized.includes(phrase)) return true;
  const latin = passage.tokens.map((token) => token.latin).join(" ");
  return latin.includes(phrase);
}

function scorePassage(
  passage: IndexedPassage,
  plan: QueryPlan,
): ScoredPassage | null {
  const matches = plan.terms
    .map((term) => bestTokenMatch(term, passage))
    .filter((match): match is TokenMatch => Boolean(match));
  if (
    matches.length !== plan.terms.length ||
    !matches.some((match) => !match.metadata)
  ) {
    return null;
  }
  const sectionMatches = matches.filter((match) => !match.metadata);
  const starts = sectionMatches.map((match) => match.token.charStart);
  const ends = sectionMatches.map((match) => match.token.charEnd);
  const spread = Math.max(...ends) - Math.min(...starts);
  const exactPhrase = containsPhrase(passage, plan.allTerms);
  const worstQuality = Math.max(...matches.map((match) => match.quality));
  const usedLatin = matches.some((match) => match.usedLatin);
  const matchMode: InstructionSearchMatchMode =
    plan.mode === "keyboard_layout"
      ? "keyboard_layout"
      : worstQuality >= 3
        ? "approximate"
        : exactPhrase
          ? "exact_phrase"
          : usedLatin
            ? "transliteration"
            : "all_terms";
  const score =
    matches.reduce(
      (sum, match) => sum + match.quality * 18 + (match.metadata ? 8 : 0),
      0,
    ) +
    Math.min(80, spread / 18) +
    SECTION_PRIORITY[passage.sectionKey] +
    (plan.mode === "keyboard_layout" ? 24 : 0) -
    (exactPhrase ? 45 : 0);
  return { passage, score, matchMode, matches };
}

function mergeHighlights(matches: TokenMatch[]): InstructionSearchHighlight[] {
  const sorted = matches
    .filter((match) => !match.metadata)
    .map((match) => ({
      charStart: match.token.charStart,
      charEnd: match.token.charEnd,
    }))
    .sort((left, right) => left.charStart - right.charStart);
  const merged: InstructionSearchHighlight[] = [];
  for (const highlight of sorted) {
    const previous = merged.at(-1);
    if (previous && highlight.charStart <= previous.charEnd + 1) {
      previous.charEnd = Math.max(previous.charEnd, highlight.charEnd);
    } else {
      merged.push({ ...highlight });
    }
  }
  return merged.slice(0, MAX_QUERY_TERMS);
}

function scoredItem(scored: ScoredPassage): InstructionSearchItem {
  const { passage, matches, matchMode } = scored;
  const snapshot = passage.snapshot;
  return {
    registryProductId: snapshot.registryProductId,
    registrationNumber: snapshot.registrationNumber,
    tradeName: snapshot.tradeName,
    inn: snapshot.inn,
    dosageForm: snapshot.dosageForm,
    strength: snapshot.strength,
    sectionKey: passage.sectionKey,
    quote: {
      text: passage.text,
      sectionKey: passage.sectionKey,
      charStart: passage.charStart,
      charEnd: passage.charEnd,
    },
    highlights: mergeHighlights(matches),
    matchedTerms: [
      ...new Set(
        matches
          .filter((match) => !match.metadata)
          .map((match) => match.token.text),
      ),
    ].slice(0, MAX_QUERY_TERMS),
    matchMode,
    source: {
      url: snapshot.source.url,
      documentDate: snapshot.source.documentDate,
      checkedAt: snapshot.source.checkedAt,
      coveragePct: snapshot.provenance.coveragePct,
    },
  };
}

export function searchInstructionIndex(
  index: InstructionSearchIndex,
  input: InstructionSearchInput,
): InstructionSearchResponse {
  const startedAt = performance.now();
  const normalizedQuery = normalizeInstructionSearchQuery(input.q);
  const section = input.section ?? "all";
  const limit = Math.max(1, Math.min(MAX_RESULTS, input.limit ?? 20));
  const scored = new Map<number, ScoredPassage>();

  for (const plan of queryPlans(input.q)) {
    let candidates: Set<number> | null = null;
    for (const term of plan.terms) {
      candidates = intersect(candidates, candidateIdsForTerm(index, term));
      if (!candidates.size) break;
    }
    for (const sectionId of candidates ?? []) {
      const indexedSection = index.sections[sectionId];
      if (
        !indexedSection ||
        (section !== "all" && indexedSection.sectionKey !== section)
      ) {
        continue;
      }
      for (const passageId of indexedSection.passageIds) {
        const passage = index.passages[passageId];
        if (!passage) continue;
        const result = scorePassage(passage, plan);
        const previous = scored.get(passageId);
        if (result && (!previous || result.score < previous.score))
          scored.set(passageId, result);
      }
    }
  }

  const unique = new Map<string, ScoredPassage>();
  for (const result of [...scored.values()].sort(
    (left, right) =>
      left.score - right.score ||
      left.passage.snapshot.tradeName.localeCompare(
        right.passage.snapshot.tradeName,
        "uk-UA",
      ) ||
      left.passage.charStart - right.passage.charStart,
  )) {
    const key = `${result.passage.snapshot.registryProductId}:${result.passage.sectionKey}`;
    if (!unique.has(key)) unique.set(key, result);
  }

  const results = [...unique.values()];
  return {
    query: input.q.trim(),
    normalizedQuery,
    section,
    total: results.length,
    indexedInstructionCount: index.instructionCount,
    snapshotGeneratedAt: index.generatedAt,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    items: results.slice(0, limit).map(scoredItem),
  };
}

let cachedIndex: InstructionSearchIndex | null = null;

function loadInstructionSearchIndex(): InstructionSearchIndex {
  if (cachedIndex) return cachedIndex;
  const manifest = loadInstructionManifest();
  const snapshots = manifest.products
    .filter(
      (product) =>
        product.status === "available" || product.status === "partial",
    )
    .map((product) => getInstructionForProduct(product.registryProductId))
    .filter((snapshot): snapshot is DrugInstructionSnapshot =>
      Boolean(snapshot),
    );
  cachedIndex = buildInstructionSearchIndex(snapshots, manifest.generatedAt);
  return cachedIndex;
}

export function searchOfficialInstructions(
  input: InstructionSearchInput,
): InstructionSearchResponse {
  return searchInstructionIndex(loadInstructionSearchIndex(), input);
}

export function warmInstructionSearchIndex(): void {
  loadInstructionSearchIndex();
}

export function clearInstructionSearchIndex(): void {
  cachedIndex = null;
}
