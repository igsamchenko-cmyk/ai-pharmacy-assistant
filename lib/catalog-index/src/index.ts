export const CATALOG_CLIENT_INDEX_VERSION = 1 as const;
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
}

export type CatalogClientIndexRow = readonly [
  productId: string,
  registration: string,
  tradeName: string,
  inn: string,
  form: string,
  strength: string,
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
    if (row.length !== 6)
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

export function catalogClientIndexWireBytes(
  payload: CatalogClientIndexPayload,
): number {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength;
}
