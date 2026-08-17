import { convertCatalogKeyboardLayout } from "./layout-map";
import {
  extractCatalogSectionIntent,
  type CatalogSectionIntentKey,
} from "./section-intent";

export {
  convertCatalogKeyboardLayout,
  LATIN_TO_UKRAINIAN_LAYOUT,
  UKRAINIAN_TO_LATIN_LAYOUT,
} from "./layout-map";

export {
  CATALOG_SECTION_INTENT_DICTIONARY,
  extractCatalogSectionIntent,
  type CatalogSectionIntentExtraction,
  type CatalogSectionIntentGroup,
  type CatalogSectionIntentKey,
} from "./section-intent";

export const CATALOG_CLIENT_INDEX_VERSION = 3 as const;
export const CATALOG_CLIENT_INDEX_MAX_PRODUCTS = 20_000;
export const CATALOG_CLIENT_INDEX_MAX_ALIASES = 5_000;
export const CATALOG_CLIENT_INDEX_MAX_WIRE_BYTES = 8 * 1024 * 1024;
export const CATALOG_CLIENT_INDEX_MAX_MEMORY_BYTES = 32 * 1024 * 1024;
export const CATALOG_CLIENT_INDEX_DEFAULT_LIMIT = 100;

export interface CatalogClientIndexProduct {
  productId: string;
  registration: string;
  tradeName: string;
  inn: string;
  form: string;
  strength: string;
  /**
   * Canonical composition identity for registrations whose registry МНН is a
   * non-specific placeholder. Empty for every other row — see
   * `catalogCompositionKey` and `isNonSpecificInn`.
   */
  compositionKey: string;
  /**
   * Primary manufacturer name. Together with `strength` this is what actually
   * tells two same-name, same-form registrations apart on a pharmacy shelf —
   * the registration number does not.
   */
  manufacturer: string;
  /**
   * Registration validity as recorded by the registry, kept as raw data rather
   * than a precomputed verdict: `"!"` for an explicit early termination, an
   * ISO `YYYY-MM-DD` end date, or `""` when unknown. The status is derived at
   * render time by `catalogRegistrationStatus`, so a registration that lapses
   * between index rebuilds stops reading as active on its own.
   */
  registrationValidity: string;
}

export type CatalogClientIndexRow = readonly [
  productId: string,
  registration: string,
  tradeName: string,
  inn: string,
  form: string,
  strength: string,
  compositionKey: string,
  manufacturer: string,
  registrationValidity: string,
];

export type CatalogClientIndexAliasRow = readonly [
  alias: string,
  canonicalInn: string,
];

export interface CatalogClientIndexPayload {
  version: typeof CATALOG_CLIENT_INDEX_VERSION;
  snapshotHash: string;
  generatedAt: string;
  productCount: number;
  aliasCount: number;
  rows: CatalogClientIndexRow[];
  aliases: CatalogClientIndexAliasRow[];
}

export type CatalogClientIndexMatchKind =
  | "trade_exact"
  | "registration_exact"
  | "product_exact"
  | "trade_prefix"
  | "composition_exact"
  | "inn_exact"
  | "inn_prefix"
  | "trade_transliteration_exact"
  | "trade_transliteration_prefix"
  | "inn_transliteration_exact"
  | "inn_transliteration_prefix"
  | "source_alias"
  | "form_prefix"
  | "strength_prefix";

interface PreparedCatalogProduct extends CatalogClientIndexProduct {
  tradeKey: string;
  innKey: string;
  registrationKey: string;
  productKey: string;
  formKey: string;
  strengthKey: string;
  tradeLatinKey: string;
  innLatinKey: string;
  combination: boolean;
}

interface PreparedCatalogAlias {
  aliasKey: string;
  aliasLatinKey: string;
  targetInnLatinKey: string;
}

export interface CompiledCatalogClientIndex {
  version: typeof CATALOG_CLIENT_INDEX_VERSION;
  snapshotHash: string;
  productCount: number;
  aliasCount: number;
  estimatedMemoryBytes: number;
  products: readonly PreparedCatalogProduct[];
  aliases: readonly PreparedCatalogAlias[];
}

export interface CatalogClientIndexSearchOptions {
  limit?: number;
  form?: string;
  strength?: string;
  compositionType?: "all" | "monotherapy" | "combination";
  scope?: CatalogClientIndexSearchScope;
}

export interface CatalogClientIndexSearchItem {
  product: CatalogClientIndexProduct;
  rank: number;
  matchedBy: CatalogClientIndexMatchKind;
}

export type CatalogClientIndexSearchScope =
  | "all"
  | "ingredients"
  | "registry_products";

export interface CatalogClientIndexSearchResult {
  query: string;
  total: number;
  items: CatalogClientIndexSearchItem[];
  durationMs: number;
}

export type CatalogNormalizedMatchType =
  | "exact"
  | "translit"
  | "layout"
  | "fuzzy";

export interface CatalogNormalizedCandidate extends CatalogClientIndexSearchItem {
  drugId: string;
  registration: string;
  matchType: CatalogNormalizedMatchType;
  matchedToken: string;
  correctedQuery?: string;
  /** Internal rank for diagnostics; larger values are better. */
  score: number;
}

export interface CatalogNormalizedSearchResult {
  query: string;
  primary: CatalogNormalizedCandidate[];
  suggested: CatalogNormalizedCandidate[];
  durationMs: number;
  /**
   * Section-navigation intent extracted from the query (PR-H, H.2). Present
   * only when a section keyword was found AND stripping it left a usable
   * product-name query. Never influences `primary`/`suggested` ranking or
   * membership -- see the H.2.4 invariant in `./section-intent.ts`.
   */
  sectionIntent?: CatalogSectionIntentKey;
}

const UKRAINIAN_TO_LATIN: Readonly<Record<string, string>> = {
  "\u0430": "a",
  "\u0431": "b",
  "\u0432": "v",
  "\u0433": "h",
  "\u0491": "g",
  "\u0434": "d",
  "\u0435": "e",
  "\u0454": "ie",
  "\u0436": "zh",
  "\u0437": "z",
  "\u0438": "y",
  "\u0456": "i",
  "\u0457": "i",
  "\u0439": "i",
  "\u043a": "k",
  "\u043b": "l",
  "\u043c": "m",
  "\u043d": "n",
  "\u043e": "o",
  "\u043f": "p",
  "\u0440": "r",
  "\u0441": "s",
  "\u0442": "t",
  "\u0443": "u",
  "\u0444": "f",
  "\u0445": "kh",
  "\u0446": "ts",
  "\u0447": "ch",
  "\u0448": "sh",
  "\u0449": "shch",
  "\u044c": "",
  "\u044e": "iu",
  "\u044f": "ia",
};

export function normalizeCatalogIndexText(value: string): string {
  return value
    .replace(/[\u00ae\u2122]/gu, "")
    .normalize("NFKD")
    .toLocaleLowerCase("uk-UA")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/\u0454/gu, "\u0435")
    .replace(/[\u2019\u02bc\u2018\u0060\u00b4\u02b9\u2032']/gu, "")
    .replace(/[\s\-_\u2010\u2011\u2012\u2013\u2014\u2015./\\()+]+/gu, "")
    .trim();
}

const CATALOG_SEARCH_TOKEN_VARIANT_LIMIT = 32;

/**
 * Return bounded spellings for matching canonical search tokens against
 * persisted keys created before Ukrainian e/ye equivalence was introduced.
 */
export function catalogSearchTokenVariants(value: string): string[] {
  const canonical = normalizeCatalogIndexText(value);
  if (!canonical) return [];
  const positions = [...canonical].flatMap((character, index) =>
    character === "\u0435" ? [index] : [],
  );
  if (!positions.length) return [canonical];

  const chars = [...canonical];
  const variantCount = Math.min(
    2 ** positions.length,
    CATALOG_SEARCH_TOKEN_VARIANT_LIMIT,
  );
  const variants = new Set<string>();
  for (let mask = 0; mask < variantCount; mask += 1) {
    const candidate = [...chars];
    positions.forEach((position, bit) => {
      if (mask & (1 << bit)) candidate[position] = "\u0454";
    });
    variants.add(candidate.join(""));
  }
  return [...variants];
}

export function transliterateCatalogIndexText(value: string): string {
  return normalizeCatalogIndexText(
    [...value.toLocaleLowerCase("uk-UA")]
      .map((character) => UKRAINIAN_TO_LATIN[character] ?? character)
      .join(""),
  );
}

function comparableLatinKey(value: string): string {
  return transliterateCatalogIndexText(value)
    .replace(/x/gu, "ks")
    .replace(/y/gu, "i")
    .replace(/g/gu, "h");
}

function isCombinationInn(value: string): boolean {
  return /(?:\+|;|\b(?:and|with|combination|combinations)\b|(?:^|\s)(?:\u0442\u0430|\u0456)(?:\s|$))/iu.test(
    value,
  );
}

/**
 * The official registry does not always record a specific active-substance name
 * in the \u041c\u041d\u041d/INN field. For combination products whose composition is not
 * decomposed into one substance it stores a generic placeholder such as
 * "Comb drug" instead, and hundreds of otherwise unrelated products share that
 * exact literal string. Treat these as "no specific INN" rather than as a real
 * substance identity, so nothing is ever grouped by a placeholder.
 */
const NON_SPECIFIC_INN_KEYS = new Set([
  "combdrug",
  "combination",
  "combinations",
  "combined",
  "mono",
  "multiple",
  "other",
  "various",
]);

/**
 * The registry also carries WHO/ATC-style combination names that DO contain a
 * substance but still do not identify the full composition — "Valsartan and
 * diuretics", "Timolol, combinations", "Paracetamol, combinations excl.
 * psycholeptics", "Barbiturates in combination with other drugs". Two products
 * sharing such a string may well contain different second components, so the
 * string is a therapeutic-class label, not an analog identity.
 *
 * A name that actually enumerates its components ("Vitamin B1 in combination
 * with vitamin B6 and/or vitamin B12") stays specific: it identifies exactly
 * what is inside.
 */
const PARTIAL_COMBINATION_INN_PATTERN =
  /(?:,\s*combinations?\b|\band\s+(?:other\s+drugs|diuretics)\b|\bin\s+combination\s+with\s+other\s+drugs\b)/iu;

export type CatalogInnSpecificity =
  | "specific"
  | "placeholder"
  | "partial_combination";

/**
 * How much of a product's identity its registry МНН actually carries.
 *
 * - `specific` — names the substance(s); safe to group by.
 * - `partial_combination` — names one substance plus an unresolved class; may
 *   be shown as a class, never as an analog set.
 * - `placeholder` — carries no substance at all; never groupable.
 */
export function catalogInnSpecificity(inn: string): CatalogInnSpecificity {
  const key = normalizeCatalogIndexText(inn);
  if (key.length < 3 || NON_SPECIFIC_INN_KEYS.has(key)) return "placeholder";
  return PARTIAL_COMBINATION_INN_PATTERN.test(inn)
    ? "partial_combination"
    : "specific";
}

/**
 * True when the МНН cannot stand alone as a composition identity — i.e. a
 * composition key should be resolved for this row if one is available.
 */
export function isNonSpecificInn(inn: string): boolean {
  return catalogInnSpecificity(inn) !== "specific";
}

/**
 * Longest canonical composition accepted as an analog identity. Multi-component
 * homeopathic preparations run into thousands of characters; an exact match on
 * such a list is neither a useful analog group nor worth the wire budget.
 */
export const CATALOG_COMPOSITION_KEY_MAX_LENGTH = 300;

/**
 * Build an order-independent composition identity from a structured composition
 * string such as "\u041a\u0430\u043b\u044c\u0446\u0456\u044e \u043a\u0430\u0440\u0431\u043e\u043d\u0430\u0442 + \u041c\u0410\u0413\u041d\u0406\u042e \u041a\u0410\u0420\u0411\u041e\u041d\u0410\u0422 \u0412\u0410\u0416\u041a\u0418\u0419".
 *
 * Only `+` and `;` are treated as separators: commas occur inside chemical names
 * (for example "2,4-\u0434\u0438\u0445\u043b\u043e\u0440\u0431\u0435\u043d\u0437\u0438\u043b\u043e\u0432\u0438\u0439 \u0441\u043f\u0438\u0440\u0442") and splitting on them would shred
 * a single ingredient into fragments. Components are normalized, deduplicated
 * and sorted, so the same combination written in a different order yields the
 * same key. Joined with `;`, which survives `normalizeCatalogIndexText`, so the
 * key can be used directly as a search query.
 */
export function catalogCompositionKey(composition: string): string {
  const parts = composition
    .split(/[+;]/u)
    .map((part) => normalizeCatalogIndexText(part))
    .filter(Boolean);
  if (!parts.length) return "";
  const key = [...new Set(parts)].sort().join(";");
  return key.length > CATALOG_COMPOSITION_KEY_MAX_LENGTH ? "" : key;
}

/** Marker stored in `registrationValidity` for an explicit early termination. */
export const CATALOG_REGISTRATION_TERMINATED_MARKER = "!";

export type CatalogRegistrationStatus = "active" | "terminated" | "unknown";

/**
 * Derive a registration's status from the raw validity value at read time.
 *
 * Deliberately not precomputed at index-build time: the index is only rebuilt
 * when the source snapshot changes, so a stored verdict would keep calling a
 * lapsed registration "active" indefinitely. An unparseable or missing date
 * yields `unknown` rather than `active` — absence of an end date is not
 * evidence of validity.
 */
export function catalogRegistrationStatus(
  registrationValidity: string,
  now: Date,
): CatalogRegistrationStatus {
  const value = registrationValidity.trim();
  if (!value) return "unknown";
  if (value === CATALOG_REGISTRATION_TERMINATED_MARKER) return "terminated";
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return "unknown";
  const today = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}`;
  return value < today ? "terminated" : "active";
}

/**
 * The certificate a registration line belongs to: `UA/19799/01/03` → `UA/19799`.
 *
 * The registry issues one certificate per product and numbers each dosage or
 * package line under it, so lines sharing a base are the same product rather
 * than competing options. Returns `""` when the number does not follow the
 * canonical shape, so callers fall back to treating the row as standalone.
 */
export function catalogRegistrationCertificate(registration: string): string {
  const match = /^\s*(UA\/\d+)\/\d+\/\d+\s*$/iu.exec(registration);
  return match?.[1]?.toUpperCase() ?? "";
}

export function decodeCatalogClientIndexRow(
  row: CatalogClientIndexRow,
): CatalogClientIndexProduct {
  return {
    productId: row[0],
    registration: row[1],
    tradeName: row[2],
    inn: row[3],
    form: row[4],
    strength: row[5],
    compositionKey: row[6],
    manufacturer: row[7],
    registrationValidity: row[8],
  };
}

export function encodeCatalogClientIndexRow(
  product: CatalogClientIndexProduct,
): CatalogClientIndexRow {
  return [
    product.productId,
    product.registration,
    product.tradeName,
    product.inn,
    product.form,
    product.strength,
    product.compositionKey,
    product.manufacturer,
    product.registrationValidity,
  ];
}

function estimatePreparedProductBytes(product: PreparedCatalogProduct): number {
  return Object.values(product).reduce(
    (total, value) =>
      total + (typeof value === "string" ? value.length * 2 : 8),
    64,
  );
}

export function compileCatalogClientIndex(
  payload: CatalogClientIndexPayload,
): CompiledCatalogClientIndex {
  if (payload.version !== CATALOG_CLIENT_INDEX_VERSION)
    throw new Error("Unsupported catalog client index version.");
  if (!/^[a-f0-9]{64}$/u.test(payload.snapshotHash))
    throw new Error("Catalog client index snapshot hash is invalid.");
  if (
    payload.productCount !== payload.rows.length ||
    payload.rows.length > CATALOG_CLIENT_INDEX_MAX_PRODUCTS
  ) {
    throw new Error("Catalog client index product count is invalid.");
  }
  if (
    payload.aliasCount !== payload.aliases.length ||
    payload.aliases.length > CATALOG_CLIENT_INDEX_MAX_ALIASES
  ) {
    throw new Error("Catalog client index alias count is invalid.");
  }
  const seen = new Set<string>();
  let estimatedMemoryBytes = 0;
  const products = payload.rows.map((row) => {
    if (row.length !== 9)
      throw new Error("Catalog client index row is invalid.");
    const product = decodeCatalogClientIndexRow(row);
    if (!/^[A-F0-9]{32}$/u.test(product.productId) || !product.registration) {
      throw new Error("Catalog client index product identity is invalid.");
    }
    const identity = `${product.productId}\u0000${product.registration}`;
    if (seen.has(identity))
      throw new Error("Catalog client index contains duplicates.");
    seen.add(identity);
    const prepared: PreparedCatalogProduct = {
      ...product,
      tradeKey: normalizeCatalogIndexText(product.tradeName),
      innKey: normalizeCatalogIndexText(product.inn),
      registrationKey: normalizeCatalogIndexText(product.registration),
      productKey: normalizeCatalogIndexText(product.productId),
      formKey: normalizeCatalogIndexText(product.form),
      strengthKey: normalizeCatalogIndexText(product.strength),
      tradeLatinKey: comparableLatinKey(product.tradeName),
      innLatinKey: comparableLatinKey(product.inn),
      combination: isCombinationInn(product.inn),
    };
    if (!prepared.tradeKey && !prepared.innKey && !prepared.registrationKey) {
      throw new Error("Catalog client index product has no searchable key.");
    }
    if (
      typeof prepared.compositionKey !== "string" ||
      prepared.compositionKey.length > CATALOG_COMPOSITION_KEY_MAX_LENGTH
    ) {
      throw new Error("Catalog client index composition key is invalid.");
    }
    if (
      typeof prepared.manufacturer !== "string" ||
      typeof prepared.registrationValidity !== "string" ||
      prepared.manufacturer.length > 500
    ) {
      throw new Error("Catalog client index product identity is invalid.");
    }
    estimatedMemoryBytes += estimatePreparedProductBytes(prepared);
    return prepared;
  });
  const seenAliases = new Map<string, string>();
  const aliases = payload.aliases.map((row) => {
    if (row.length !== 2)
      throw new Error("Catalog client index alias row is invalid.");
    const aliasKey = normalizeCatalogIndexText(row[0]);
    const aliasLatinKey = comparableLatinKey(row[0]);
    const targetInnLatinKey = comparableLatinKey(row[1]);
    if (!aliasKey || !targetInnLatinKey)
      throw new Error("Catalog client index alias is invalid.");
    const previousTarget = seenAliases.get(aliasKey);
    if (previousTarget && previousTarget !== targetInnLatinKey) {
      throw new Error("Catalog client index alias is ambiguous.");
    }
    if (previousTarget)
      throw new Error("Catalog client index contains duplicate aliases.");
    seenAliases.set(aliasKey, targetInnLatinKey);
    const prepared = { aliasKey, aliasLatinKey, targetInnLatinKey };
    estimatedMemoryBytes +=
      (aliasKey.length + aliasLatinKey.length + targetInnLatinKey.length) * 2 +
      32;
    return prepared;
  });
  if (estimatedMemoryBytes > CATALOG_CLIENT_INDEX_MAX_MEMORY_BYTES) {
    throw new Error("Catalog client index exceeds the memory budget.");
  }
  return {
    version: CATALOG_CLIENT_INDEX_VERSION,
    snapshotHash: payload.snapshotHash,
    productCount: payload.productCount,
    aliasCount: payload.aliasCount,
    estimatedMemoryBytes,
    products,
    aliases,
  };
}

function matchRank(
  product: PreparedCatalogProduct,
  queryKey: string,
  queryLatinKey: string,
  scope: CatalogClientIndexSearchScope,
): { rank: number; matchedBy: CatalogClientIndexMatchKind } | null {
  if (scope !== "ingredients") {
    if (product.tradeKey === queryKey)
      return { rank: 0, matchedBy: "trade_exact" };
    if (product.registrationKey === queryKey)
      return { rank: 1, matchedBy: "registration_exact" };
    if (product.productKey === queryKey)
      return { rank: 1, matchedBy: "product_exact" };
    if (product.tradeKey.startsWith(queryKey))
      return { rank: 2, matchedBy: "trade_prefix" };
  }
  if (product.compositionKey && product.compositionKey === queryKey) {
    return {
      rank: scope === "ingredients" ? 0 : 3,
      matchedBy: "composition_exact",
    };
  }
  if (product.innKey === queryKey)
    return { rank: scope === "ingredients" ? 0 : 3, matchedBy: "inn_exact" };
  if (product.innKey.startsWith(queryKey))
    return { rank: scope === "ingredients" ? 1 : 4, matchedBy: "inn_prefix" };
  if (scope !== "ingredients") {
    if (product.tradeLatinKey === queryLatinKey)
      return { rank: 5, matchedBy: "trade_transliteration_exact" };
    if (product.tradeLatinKey.startsWith(queryLatinKey))
      return { rank: 6, matchedBy: "trade_transliteration_prefix" };
  }
  if (product.innLatinKey === queryLatinKey)
    return {
      rank: scope === "ingredients" ? 2 : 7,
      matchedBy: "inn_transliteration_exact",
    };
  if (product.innLatinKey.startsWith(queryLatinKey))
    return {
      rank: scope === "ingredients" ? 3 : 8,
      matchedBy: "inn_transliteration_prefix",
    };
  if (scope !== "ingredients") {
    if (product.formKey.startsWith(queryKey))
      return { rank: 11, matchedBy: "form_prefix" };
    if (product.strengthKey.startsWith(queryKey))
      return { rank: 12, matchedBy: "strength_prefix" };
  }
  return null;
}

function resolveAliasTarget(
  aliases: readonly PreparedCatalogAlias[],
  queryKey: string,
  queryLatinKey: string,
): string | null {
  const exact = aliases.find(
    (alias) =>
      alias.aliasKey === queryKey || alias.aliasLatinKey === queryLatinKey,
  );
  if (exact) return exact.targetInnLatinKey;
  if (queryKey.length < 3) return null;
  const targets = new Set(
    aliases
      .filter(
        (alias) =>
          alias.aliasKey.startsWith(queryKey) ||
          alias.aliasLatinKey.startsWith(queryLatinKey),
      )
      .map((alias) => alias.targetInnLatinKey),
  );
  return targets.size === 1 ? ([...targets][0] ?? null) : null;
}

export function searchCatalogClientIndex(
  index: CompiledCatalogClientIndex,
  query: string,
  options: CatalogClientIndexSearchOptions = {},
): CatalogClientIndexSearchResult {
  const startedAt = performance.now();
  const queryKey = normalizeCatalogIndexText(query);
  const queryLatinKey = comparableLatinKey(query);
  const aliasTargetInnLatinKey = resolveAliasTarget(
    index.aliases,
    queryKey,
    queryLatinKey,
  );
  const formKey = normalizeCatalogIndexText(options.form ?? "");
  const strengthKey = normalizeCatalogIndexText(options.strength ?? "");
  const compositionType = options.compositionType ?? "all";
  const scope = options.scope ?? "all";
  const limit = Math.max(
    1,
    Math.min(options.limit ?? CATALOG_CLIENT_INDEX_DEFAULT_LIMIT, 250),
  );
  if (!queryKey)
    return {
      query,
      total: 0,
      items: [],
      durationMs: performance.now() - startedAt,
    };
  const matches: CatalogClientIndexSearchItem[] = [];
  for (const product of index.products) {
    if (formKey && !product.formKey.startsWith(formKey)) continue;
    if (strengthKey && !product.strengthKey.startsWith(strengthKey)) continue;
    if (compositionType === "combination" && !product.combination) continue;
    if (compositionType === "monotherapy" && product.combination) continue;
    const match = matchRank(product, queryKey, queryLatinKey, scope);
    if (match) {
      matches.push({ product, ...match });
      continue;
    }
    if (aliasTargetInnLatinKey === product.innLatinKey) {
      matches.push({
        product,
        rank:
          scope === "ingredients"
            ? 4
            : product.tradeLatinKey === aliasTargetInnLatinKey
              ? 9
              : 10,
        matchedBy: "source_alias",
      });
    }
  }
  matches.sort(
    (left, right) =>
      left.rank - right.rank ||
      left.product.tradeName.localeCompare(right.product.tradeName, "uk-UA") ||
      left.product.strength.localeCompare(right.product.strength, "uk-UA") ||
      left.product.registration.localeCompare(
        right.product.registration,
        "uk-UA",
      ) ||
      left.product.productId.localeCompare(right.product.productId),
  );
  return {
    query,
    total: matches.length,
    items: matches.slice(0, limit),
    durationMs: performance.now() - startedAt,
  };
}

interface CatalogSymSpellIndex {
  deletes: Map<string, Set<string>>;
}

const catalogSymSpellIndexes = new WeakMap<
  CompiledCatalogClientIndex,
  CatalogSymSpellIndex
>();
const FUZZY_MIN_TOKEN_LENGTH = 4;
const FUZZY_SUGGESTION_LIMIT = 5;

/**
 * Normalization used by the layout and fuzzy layers. It intentionally keeps
 * Ukrainian и/і and е/є distinct. The legacy exact matcher above remains
 * unchanged so its established registry ranking and compatibility stay intact.
 */
export function normalizeCatalogSearchTokenText(value: string): string {
  return value
    .replace(/[\u00ae\u2122]/gu, "")
    .normalize("NFKD")
    .toLocaleLowerCase("uk-UA")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/ґ/gu, "г")
    .replace(/[\u2019\u02bc\u2018\u0060\u00b4\u02b9\u2032']/gu, "")
    .replace(/[\-\u2010\u2011\u2012\u2013\u2014\u2015]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function catalogSearchTokens(value: string): string[] {
  const normalized = normalizeCatalogSearchTokenText(value);
  if (!normalized) return [];
  const parts = normalized.split(" ").filter(Boolean);
  return [...new Set([...parts, parts.join("")].filter(Boolean))];
}

function deletionVariants(token: string): string[] {
  const characters = [...token];
  return characters.map((_, index) =>
    characters
      .filter((__, candidateIndex) => candidateIndex !== index)
      .join(""),
  );
}

function addSymSpellToken(
  deletes: Map<string, Set<string>>,
  token: string,
): void {
  if ([...token].length < FUZZY_MIN_TOKEN_LENGTH) return;
  for (const variant of [token, ...deletionVariants(token)]) {
    const originals = deletes.get(variant);
    if (originals) originals.add(token);
    else deletes.set(variant, new Set([token]));
  }
}

function buildCatalogSymSpellIndex(
  index: CompiledCatalogClientIndex,
): CatalogSymSpellIndex {
  const deletes = new Map<string, Set<string>>();
  const uniqueTokens = new Set<string>();
  for (const product of index.products) {
    for (const token of catalogSearchTokens(product.tradeName))
      uniqueTokens.add(token);
    for (const token of catalogSearchTokens(product.inn))
      uniqueTokens.add(token);
  }
  for (const token of uniqueTokens) addSymSpellToken(deletes, token);
  return { deletes };
}

function getCatalogSymSpellIndex(
  index: CompiledCatalogClientIndex,
): CatalogSymSpellIndex {
  const cached = catalogSymSpellIndexes.get(index);
  if (cached) return cached;
  const built = buildCatalogSymSpellIndex(index);
  catalogSymSpellIndexes.set(index, built);
  return built;
}

function isDamerauLevenshteinAtMostOne(left: string, right: string): boolean {
  const leftCharacters = [...left];
  const rightCharacters = [...right];
  const difference = leftCharacters.length - rightCharacters.length;
  if (Math.abs(difference) > 1) return false;
  if (left === right) return true;

  if (difference === 0) {
    const mismatches: number[] = [];
    for (let index = 0; index < leftCharacters.length; index += 1) {
      if (leftCharacters[index] !== rightCharacters[index])
        mismatches.push(index);
      if (mismatches.length > 2) return false;
    }
    if (mismatches.length === 1) return true;
    if (mismatches.length !== 2) return false;
    const [first, second] = mismatches;
    return (
      second === first + 1 &&
      leftCharacters[first] === rightCharacters[second] &&
      leftCharacters[second] === rightCharacters[first]
    );
  }

  const longer = difference > 0 ? leftCharacters : rightCharacters;
  const shorter = difference > 0 ? rightCharacters : leftCharacters;
  let longerIndex = 0;
  let shorterIndex = 0;
  let skipped = false;
  while (longerIndex < longer.length && shorterIndex < shorter.length) {
    if (longer[longerIndex] === shorter[shorterIndex]) {
      longerIndex += 1;
      shorterIndex += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    longerIndex += 1;
  }
  return true;
}

function commonPrefixLength(left: string, right: string): number {
  const leftCharacters = [...left];
  const rightCharacters = [...right];
  let length = 0;
  while (
    length < leftCharacters.length &&
    length < rightCharacters.length &&
    leftCharacters[length] === rightCharacters[length]
  ) {
    length += 1;
  }
  return length;
}

function isRegistrationOrProductIdentifier(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^[a-f0-9]{32}$/iu.test(trimmed) ||
    (/^(?:[a-zа-яіїєґ]{1,4}\/)?[a-zа-яіїєґ0-9.-]*\d[a-zа-яіїєґ0-9./-]*$/iu.test(
      trimmed,
    ) &&
      trimmed.includes("/"))
  );
}

function candidateIdentity(candidate: CatalogNormalizedCandidate): string {
  return `${candidate.product.productId}\u0000${candidate.product.registration}`;
}

function matchedTokenForItem(
  item: CatalogClientIndexSearchItem,
  query: string,
): string {
  if (item.matchedBy.startsWith("trade_"))
    return catalogSearchTokens(item.product.tradeName)[0] ?? "";
  if (item.matchedBy.startsWith("inn_"))
    return catalogSearchTokens(item.product.inn)[0] ?? "";
  if (item.matchedBy === "registration_exact")
    return normalizeCatalogSearchTokenText(item.product.registration);
  if (item.matchedBy === "product_exact")
    return normalizeCatalogSearchTokenText(item.product.productId);
  if (item.matchedBy === "form_prefix")
    return catalogSearchTokens(item.product.form)[0] ?? "";
  if (item.matchedBy === "strength_prefix")
    return normalizeCatalogSearchTokenText(item.product.strength);
  return normalizeCatalogSearchTokenText(query);
}

function normalizedCandidate(
  item: CatalogClientIndexSearchItem,
  matchType: CatalogNormalizedMatchType,
  position: number,
  query: string,
  correctedQuery?: string,
  scoreBase = 1_000_000,
): CatalogNormalizedCandidate {
  return {
    ...item,
    drugId: item.product.productId,
    registration: item.product.registration,
    matchType,
    matchedToken: matchedTokenForItem(item, correctedQuery ?? query),
    ...(correctedQuery ? { correctedQuery } : {}),
    score: scoreBase - item.rank * 1_000 - position,
  };
}

function directMatchType(
  matchedBy: CatalogClientIndexMatchKind,
): CatalogNormalizedMatchType {
  return matchedBy.includes("transliteration") ? "translit" : "exact";
}

function fuzzyCorrectedTokens(
  index: CompiledCatalogClientIndex,
  rawQuery: string,
): string[] {
  if (isRegistrationOrProductIdentifier(rawQuery)) return [];
  const queryTokens = catalogSearchTokens(rawQuery);
  if (
    queryTokens.length !== 1 ||
    [...(queryTokens[0] ?? "")].length < FUZZY_MIN_TOKEN_LENGTH
  ) {
    return [];
  }
  const queryToken = queryTokens[0]!;
  const symSpell = getCatalogSymSpellIndex(index);
  const candidates = new Set<string>();
  for (const variant of [queryToken, ...deletionVariants(queryToken)]) {
    for (const token of symSpell.deletes.get(variant) ?? []) {
      if (
        token !== queryToken &&
        isDamerauLevenshteinAtMostOne(queryToken, token)
      ) {
        candidates.add(token);
      }
    }
  }
  return [...candidates].sort(
    (left, right) =>
      commonPrefixLength(right, queryToken) -
        commonPrefixLength(left, queryToken) ||
      left.localeCompare(right, "uk-UA"),
  );
}

/**
 * Safety-preserving query layer used by the catalog search Worker.
 * Existing direct ranking remains authoritative; layout matches follow it,
 * while fuzzy suggestions are returned only when primary is empty.
 */
export function normalizeAndSearchCatalogClientIndex(
  index: CompiledCatalogClientIndex,
  rawQuery: string,
  options: CatalogClientIndexSearchOptions = {},
): CatalogNormalizedSearchResult {
  const startedAt = performance.now();
  const limit = Math.max(
    1,
    Math.min(options.limit ?? CATALOG_CLIENT_INDEX_DEFAULT_LIMIT, 250),
  );
  const searchOptions = { ...options, limit };
  // PR-H, H.2.2: the single allowed extension of this v2 layer. When a
  // section keyword is found and stripping it still leaves a usable
  // product-name query, `searchQuery` is that stripped remainder and every
  // search pass below runs on it instead of `rawQuery`; the section keyword
  // itself never reaches the name-matching pipeline. Otherwise `searchQuery`
  // equals `rawQuery` exactly, so behavior is byte-for-byte unchanged.
  const { query: searchQuery, sectionIntent } =
    extractCatalogSectionIntent(rawQuery);
  const direct = searchCatalogClientIndex(index, searchQuery, searchOptions);
  const primary: CatalogNormalizedCandidate[] = direct.items.map(
    (item, position) =>
      normalizedCandidate(
        item,
        directMatchType(item.matchedBy),
        position,
        searchQuery,
      ),
  );
  const seen = new Set(primary.map(candidateIdentity));

  const correctedLayout = convertCatalogKeyboardLayout(searchQuery);
  if (correctedLayout && primary.length < limit) {
    const layout = searchCatalogClientIndex(
      index,
      correctedLayout,
      searchOptions,
    );
    for (const [position, item] of layout.items.entries()) {
      const candidate = normalizedCandidate(
        item,
        "layout",
        position,
        searchQuery,
        correctedLayout,
        100_000,
      );
      const identity = candidateIdentity(candidate);
      if (seen.has(identity)) continue;
      seen.add(identity);
      primary.push(candidate);
      if (primary.length >= limit) break;
    }
  }

  const suggested: CatalogNormalizedCandidate[] = [];
  if (!primary.length) {
    for (const correctedToken of fuzzyCorrectedTokens(index, searchQuery)) {
      const fuzzyResult = searchCatalogClientIndex(index, correctedToken, {
        ...searchOptions,
        limit: FUZZY_SUGGESTION_LIMIT,
      });
      for (const [position, item] of fuzzyResult.items.entries()) {
        const candidate = normalizedCandidate(
          item,
          "fuzzy",
          position,
          searchQuery,
          correctedToken,
          commonPrefixLength(
            normalizeCatalogSearchTokenText(searchQuery),
            correctedToken,
          ) * 10_000,
        );
        const identity = candidateIdentity(candidate);
        if (seen.has(identity)) continue;
        seen.add(identity);
        suggested.push(candidate);
        if (suggested.length >= FUZZY_SUGGESTION_LIMIT) break;
      }
      if (suggested.length >= FUZZY_SUGGESTION_LIMIT) break;
    }
  }

  return {
    query: rawQuery,
    primary,
    suggested,
    durationMs: performance.now() - startedAt,
    ...(sectionIntent ? { sectionIntent } : {}),
  };
}
export function catalogClientIndexWireBytes(
  payload: CatalogClientIndexPayload,
): number {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength;
}
