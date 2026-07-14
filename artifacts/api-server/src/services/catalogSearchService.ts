import type { z } from "zod";
import {
  SearchCatalogQueryParams,
  SearchCatalogResponse,
} from "@workspace/api-zod";
import { normalize } from "../lib/text";
import { TtlCache } from "../lib/cache";
import { logger } from "../lib/logger";
import { isDbRuntimeEnabled } from "../knowledge/runtime";
import { searchDrugs } from "./drugService";
import {
  GROUPED_CATALOG_ROW_LIMIT,
  groupRegistryProducts,
} from "./catalogGrouping";

export type CatalogSearchInput = z.infer<typeof SearchCatalogQueryParams>;
export type CatalogSearchResult = z.infer<typeof SearchCatalogResponse>;
type ProductResult = CatalogSearchResult["registryProducts"]["items"][number];
type IngredientResult = CatalogSearchResult["ingredients"][number];
type RegistrationStatus = "active" | "terminated" | "unknown";

export const CATALOG_BROWSE_RANK_SQL = "NULL::int";

interface ProductSearchResult {
  catalogTotal: number;
  filteredTotal: number;
  items: ProductResult[];
  bounded?: boolean;
}

export interface CatalogQueryExecutor {
  query(
    text: string,
    values?: unknown[],
  ): PromiseLike<{ rows: unknown[] }>;
}

export interface CatalogQueryMetric {
  label: string;
  durationMs: number;
  startedAtMs: number;
  finishedAtMs: number;
  statement: string;
  values: readonly unknown[];
}

export interface RegistryCatalogStoreOptions {
  executor?: CatalogQueryExecutor;
  onQuery?: (metric: CatalogQueryMetric) => void;
}

export interface RegistryCatalogStore {
  getCatalogTotal(): Promise<number>;
  findUniqueExactProduct?(
    input: CatalogSearchInput,
  ): Promise<ProductSearchResult | null>;
  searchProducts(input: CatalogSearchInput): Promise<ProductSearchResult>;
  searchProductsForGrouping?(
    input: CatalogSearchInput,
  ): Promise<ProductSearchResult>;
  searchIngredients(query: string, limit: number): Promise<IngredientResult[]>;
}

interface ProductRow {
  registry_id: string;
  trade_name: string;
  normalized_trade_name: string;
  inn: string;
  active_ingredient: string;
  atc_code: string | null;
  form: string;
  registration_number: string;
  registration_start_date: string;
  registration_end_date: string;
  source_key: string;
  registration_status: RegistrationStatus;
  national_list_status?: "exact" | "ingredient_only" | "uncertain" | "not_listed" | "not_applicable" | null;
  national_list_reason?: string | null;
  national_list_checked_at?: string | null;
  national_list_release_id?: string | null;
  national_list_title?: string | null;
  national_list_act_number?: string | null;
  national_list_act_date?: string | null;
  national_list_revision_date?: string | null;
  national_list_effective_date?: string | null;
  national_list_source_url?: string | null;
  national_list_section?: string | null;
  national_list_official_name?: string | null;
  national_list_ingredients_json?: string | null;
  national_list_dosage_forms_json?: string | null;
  national_list_routes_json?: string | null;
  national_list_strengths_json?: string | null;
  national_list_ingredient_match?: "match" | "mismatch" | "unknown" | "not_applicable" | null;
  national_list_form_match?: "match" | "mismatch" | "unknown" | "not_applicable" | null;
  national_list_route_match?: "match" | "mismatch" | "unknown" | "not_applicable" | null;
  national_list_strength_match?: "match" | "mismatch" | "unknown" | "not_applicable" | null;
}

interface ManufacturerRow {
  product_registry_id: string;
  name: string;
  country: string;
}

interface MappingRow {
  normalized: string;
  review_status: string;
  ingredient_id: string;
  inn: string;
  latin: string;
  english: string;
  atc_code: string | null;
}

interface IngredientRow {
  ingredient_id: string;
  inn: string;
  latin: string;
  english: string;
  atc_code: string | null;
  group_name: string;
  matched_name: string;
}

interface CatalogSnapshot {
  catalogTotal: number;
  version: string;
}

const REGISTRY_SEARCH_CACHE_VERSION = "registry-search-v3";
const REGISTRY_CACHE_TTL_MS = 120_000;
const REGISTRY_NEGATIVE_CACHE_TTL_MS = 30_000;
const NATIONAL_LIST_MATCH_JOIN_SQL = `
  LEFT JOIN LATERAL (
    SELECT id, title, act_number, act_date, revision_date, effective_date, source_url
    FROM national_list_releases
    WHERE status = 'active'
    ORDER BY activated_at DESC NULLS LAST, id
    LIMIT 1
  ) nlr ON TRUE
  LEFT JOIN national_list_match_results nlm
    ON nlm.release_id = nlr.id
   AND nlm.product_registry_id = p.registry_id
  LEFT JOIN national_list_entries nle
    ON nle.release_id = nlr.id
   AND nle.stable_key = nlm.entry_stable_key`;

const NATIONAL_LIST_MATCH_SELECT_SQL = `
  COALESCE(nlm.status, CASE WHEN nlr.id IS NULL THEN 'not_applicable' ELSE 'uncertain' END)
    AS national_list_status,
  COALESCE(nlm.reason, CASE WHEN nlr.id IS NULL
    THEN 'No active National Medicines List release is configured.'
    ELSE 'The active release has no validated resolver result for this product.' END)
    AS national_list_reason,
  nlm.checked_at::text AS national_list_checked_at,
  nlr.id AS national_list_release_id,
  nlr.title AS national_list_title,
  nlr.act_number AS national_list_act_number,
  nlr.act_date AS national_list_act_date,
  nlr.revision_date AS national_list_revision_date,
  nlr.effective_date AS national_list_effective_date,
  nlr.source_url AS national_list_source_url,
  nle.section AS national_list_section,
  nle.official_name_ua AS national_list_official_name,
  nle.ingredients_json AS national_list_ingredients_json,
  nle.dosage_forms_json AS national_list_dosage_forms_json,
  nle.routes_json AS national_list_routes_json,
  nle.strengths_json AS national_list_strengths_json,
  nlm.ingredient_match AS national_list_ingredient_match,
  nlm.form_match AS national_list_form_match,
  nlm.route_match AS national_list_route_match,
  nlm.strength_match AS national_list_strength_match`;
const catalogSnapshotCache = new TtlCache<CatalogSnapshot>({
  ttlMs: 300_000,
  maxEntries: 1,
});
const groupedProductCache = new TtlCache<ProductSearchResult>({
  ttlMs: REGISTRY_CACHE_TTL_MS,
  maxEntries: 64,
});
const exactProductCache = new TtlCache<ProductSearchResult | null>({
  ttlMs: REGISTRY_CACHE_TTL_MS,
  maxEntries: 128,
});

export function registrySearchCacheKey(
  scope: "exact" | "grouped",
  input: CatalogSearchInput,
  snapshotVersion: string,
): string {
  const cacheValue = (value: string | null | undefined) => {
    const lower = value?.trim().toLocaleLowerCase("uk-UA") ?? "";
    return [lower, normalize(lower)];
  };
  return JSON.stringify([
    REGISTRY_SEARCH_CACHE_VERSION,
    snapshotVersion,
    scope,
    input.view ?? "auto",
    cacheValue(input.q),
    cacheValue(input.manufacturer),
    cacheValue(input.form),
    cacheValue(input.strength),
    input.nationalListStatus ?? "all",
    input.registrationStatus ?? "",
  ]);
}

export function resetRegistrySearchCachesForTests(): void {
  catalogSnapshotCache.clear();
  groupedProductCache.clear();
  exactProductCache.clear();
}

const REGISTRATION_STATUS_SQL = `CASE
  WHEN NULLIF(TRIM(p.early_termination), '') IS NOT NULL
    AND LOWER(TRIM(p.early_termination)) NOT IN ('no', 'false', '0', 'ні', 'нет')
    THEN 'terminated'
  WHEN p.registration_end_date ~ '^\\d{4}-\\d{2}-\\d{2}'
    THEN CASE
      WHEN SUBSTRING(p.registration_end_date FROM 1 FOR 10) <
        TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') THEN 'terminated'
      ELSE 'active'
    END
  WHEN p.registration_end_date ~ '^\\d{2}\\.\\d{2}\\.\\d{4}'
    THEN CASE
      WHEN CONCAT(
        SUBSTRING(p.registration_end_date FROM 7 FOR 4), '-',
        SUBSTRING(p.registration_end_date FROM 4 FOR 2), '-',
        SUBSTRING(p.registration_end_date FROM 1 FOR 2)
      ) < TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') THEN 'terminated'
      ELSE 'active'
    END
  WHEN NULLIF(TRIM(p.registration_end_date), '') IS NOT NULL THEN 'active'
  ELSE 'unknown'
END`;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function cleanNullable(value: string | null | undefined): string | null {
  const cleaned = value?.trim() ?? "";
  return cleaned || null;
}

const UNSAFE_NATIONAL_LIST_TEXT =
  /DATABASE_URL|postgres(?:ql)?:\/\/|api[_-]?key|auth[_-]?token|bearer\s+[a-z\d._-]+|[A-Za-z]:[\\/]|\/(?:opt|home|var|tmp)\//iu;

function safeNationalListText(
  value: string | null | undefined,
  limit = 500,
): string | null {
  const cleaned = value?.trim() ?? "";
  return cleaned && !UNSAFE_NATIONAL_LIST_TEXT.test(cleaned)
    ? cleaned.slice(0, limit)
    : null;
}

function safeJsonArray(value: string | null | undefined, limit: number): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => safeNationalListText(item, 200))
          .filter((item): item is string => item !== null)
          .slice(0, limit)
      : [];
  } catch {
    return [];
  }
}

function sanitizedNationalListReason(value: string | null | undefined): string {
  return safeNationalListText(value) ??
    "National-list status is unavailable for this product.";
}

function officialNationalListUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
        url.hostname === "zakon.rada.gov.ua" &&
        url.pathname.startsWith("/laws/show/") &&
        !url.username && !url.password && !url.search
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function safeNationalListRelease(value: string | null | undefined): string | null {
  const release = value?.trim() ?? "";
  return /^[a-z\d][a-z\d._-]{0,99}$/iu.test(release) ? release : null;
}

function safeNationalListDateTime(value: string | null | undefined): string | null {
  const timestamp = value?.trim() ?? "";
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(timestamp)
    ? timestamp
    : null;
}

function sanitizedSourceKey(value: string): string {
  const key = value.trim();
  return /^[a-z0-9._-]{1,80}$/iu.test(key) ? key : "state_registry";
}

export function extractRegistryStrength(...values: string[]): string | null {
  const matches = values
    .filter(Boolean)
    .join(" ")
    .match(
      /\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|iu|мг|мкг|г|мл|мо)(?:\s*\/\s*\d+(?:[.,]\d+)?\s*(?:ml|мл))?/giu,
    );
  if (!matches?.length) return null;
  return [...new Set(matches.map((value) => value.replace(/\s+/g, " ").trim()))]
    .slice(0, 3)
    .join(", ");
}

function aliasesForProduct(row: ProductRow): string[] {
  return [
    ...new Set(
      [
        row.normalized_trade_name,
        normalize(row.inn),
        normalize(row.active_ingredient),
      ].filter(Boolean),
    ),
  ];
}

export function assembleRegistryProducts(
  rows: readonly ProductRow[],
  manufacturerRows: readonly ManufacturerRow[],
  mappingRows: readonly MappingRow[],
): ProductResult[] {
  const manufacturers = new Map<string, ManufacturerRow[]>();
  for (const row of manufacturerRows) {
    const current = manufacturers.get(row.product_registry_id) ?? [];
    if (!current.some((item) => item.name === row.name && item.country === row.country)) {
      current.push(row);
    }
    manufacturers.set(row.product_registry_id, current);
  }

  const mappings = new Map<string, MappingRow[]>();
  for (const row of mappingRows) {
    if (row.review_status !== "approved") continue;
    const current = mappings.get(row.normalized) ?? [];
    if (!current.some((item) => item.ingredient_id === row.ingredient_id)) {
      current.push(row);
    }
    mappings.set(row.normalized, current);
  }

  return rows.map((row) => {
    const matched = aliasesForProduct(row).flatMap(
      (alias) => mappings.get(alias) ?? [],
    );
    const unique = [
      ...new Map(matched.map((mapping) => [mapping.ingredient_id, mapping])).values(),
    ];
    const selected = unique.length === 1 ? unique[0] : null;
    const mappingStatus = selected
      ? "approved" as const
      : unique.length > 1
        ? "ambiguous" as const
        : "unmapped" as const;
    const nationalListRelease = safeNationalListRelease(row.national_list_release_id);
    const nationalListTitle = safeNationalListText(row.national_list_title, 300);
    const nationalListActNumber = safeNationalListText(row.national_list_act_number, 40);
    const nationalListActDate = safeNationalListText(row.national_list_act_date, 20);
    const nationalListRevisionDate = safeNationalListText(row.national_list_revision_date, 20);
    const nationalListEffectiveDate = safeNationalListText(row.national_list_effective_date, 20);
    const nationalListSourceUrl = officialNationalListUrl(row.national_list_source_url);
    const nationalListOfficialName = safeNationalListText(
      row.national_list_official_name,
      300,
    );

    return {
      resultType: "registry_product",
      id: row.registry_id,
      tradeName: row.trade_name,
      inn: row.inn,
      activeIngredient: row.active_ingredient,
      atcCode: row.atc_code,
      dosageForm: row.form,
      strength: extractRegistryStrength(row.active_ingredient, row.form),
      manufacturers: (manufacturers.get(row.registry_id) ?? []).map((item) => ({
        name: item.name,
        country: cleanNullable(item.country),
      })),
      registration: {
        number: row.registration_number,
        startDate: cleanNullable(row.registration_start_date),
        endDate: cleanNullable(row.registration_end_date),
        status: row.registration_status,
      },
      source: {
        key: sanitizedSourceKey(row.source_key),
        label: "State Register of Medicines of Ukraine",
      },
      mappingStatus,
      approvedMapping: selected
        ? {
            ingredientId: selected.ingredient_id,
            inn: selected.inn,
            latin: selected.latin,
            english: selected.english,
            atcCode: selected.atc_code,
          }
        : null,
      sourceRecordCount: 1,
      nationalListStatus: row.national_list_status ?? "not_applicable",
      nationalListRelease,
      nationalListMatchReason: sanitizedNationalListReason(row.national_list_reason ??
        "No active National Medicines List release is configured."),
      nationalListSection: safeNationalListText(row.national_list_section, 300),
      nationalListSource: nationalListRelease &&
          nationalListTitle &&
          nationalListActNumber &&
          nationalListActDate &&
          nationalListRevisionDate &&
          nationalListEffectiveDate &&
          nationalListSourceUrl
        ? {
            title: nationalListTitle,
            actNumber: nationalListActNumber,
            actDate: nationalListActDate,
            revisionDate: nationalListRevisionDate,
            effectiveDate: nationalListEffectiveDate,
            url: nationalListSourceUrl,
          }
        : null,
      nationalListCheckedAt: safeNationalListDateTime(row.national_list_checked_at),
      nationalListMatchDetails: nationalListOfficialName
        ? {
            officialName: nationalListOfficialName,
            ingredients: safeJsonArray(row.national_list_ingredients_json, 12),
            dosageForms: safeJsonArray(row.national_list_dosage_forms_json, 20),
            routes: safeJsonArray(row.national_list_routes_json, 12),
            strengths: safeJsonArray(row.national_list_strengths_json, 30),
            ingredientMatch: row.national_list_ingredient_match ?? "unknown",
            formMatch: row.national_list_form_match ?? "unknown",
            routeMatch: row.national_list_route_match ?? "unknown",
            strengthMatch: row.national_list_strength_match ?? "unknown",
          }
        : null,
    };
  });
}

function buildProductFilter(input: CatalogSearchInput) {
  const values: unknown[] = [];
  const clauses: string[] = [];
  const add = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  const query = input.q.trim();
  let joinSql = "";
  let rankSql = CATALOG_BROWSE_RANK_SQL;
  if (query) {
    const lower = query.toLocaleLowerCase("uk-UA");
    const normalized = normalize(query) || lower;
    const lowerExact = add(lower);
    const normalizedExact = add(normalized);
    const lowerPrefix = add(`${escapeLike(lower)}%`);
    const normalizedPrefix = add(`${escapeLike(normalized)}%`);
    const contains = add(`%${escapeLike(lower)}%`);
    const normalizedContains = add(`%${escapeLike(normalized)}%`);
    const exactApproved = "exact_approved_alias.normalized IS NOT NULL";
    const prefixApproved = "prefix_approved_alias.normalized IS NOT NULL";

    joinSql = `
      LEFT JOIN (
        SELECT DISTINCT product_alias.normalized
        FROM knowledge_ingredient_names product_alias
        JOIN knowledge_ingredient_names query_alias
          ON query_alias.ingredient_inn_key = product_alias.ingredient_inn_key
        WHERE product_alias.review_status = 'approved'
          AND query_alias.review_status = 'approved'
          AND query_alias.normalized = ${normalizedExact}
      ) exact_approved_alias
        ON exact_approved_alias.normalized = p.normalized_trade_name
      LEFT JOIN (
        SELECT DISTINCT product_alias.normalized
        FROM knowledge_ingredient_names product_alias
        JOIN knowledge_ingredient_names query_alias
          ON query_alias.ingredient_inn_key = product_alias.ingredient_inn_key
        WHERE product_alias.review_status = 'approved'
          AND query_alias.review_status = 'approved'
          AND query_alias.normalized LIKE ${normalizedPrefix} ESCAPE '\\'
      ) prefix_approved_alias
        ON prefix_approved_alias.normalized = p.normalized_trade_name`;

    const directContains = `(
      LOWER(p.trade_name) LIKE ${contains} ESCAPE '\\'
      OR LOWER(p.inn) LIKE ${contains} ESCAPE '\\'
      OR LOWER(p.active_ingredient) LIKE ${contains} ESCAPE '\\'
      OR LOWER(p.applicant_name) LIKE ${contains} ESCAPE '\\'
      OR LOWER(p.registration_number) LIKE ${contains} ESCAPE '\\'
      OR LOWER(p.form) LIKE ${contains} ESCAPE '\\'
      OR LOWER(COALESCE(p.atc_code, '')) LIKE ${contains} ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM knowledge_registry_manufacturers search_manufacturer
        WHERE search_manufacturer.product_registry_id = p.registry_id
          AND search_manufacturer.normalized_name
            LIKE ${normalizedContains} ESCAPE '\\'
      )
    )`;

    clauses.push(`(
      p.normalized_trade_name = ${normalizedExact}
      OR LOWER(p.inn) = ${lowerExact}
      OR LOWER(p.active_ingredient) = ${lowerExact}
      OR LOWER(p.registration_number) = ${lowerExact}
      OR p.normalized_trade_name LIKE ${normalizedPrefix} ESCAPE '\\'
      OR LOWER(p.inn) LIKE ${lowerPrefix} ESCAPE '\\'
      OR LOWER(p.active_ingredient) LIKE ${lowerPrefix} ESCAPE '\\'
      OR LOWER(p.registration_number) LIKE ${lowerPrefix} ESCAPE '\\'
      OR ${exactApproved}
      OR ${prefixApproved}
      OR ${directContains}
    )`);
    rankSql = `CASE
      WHEN ${exactApproved} THEN 1
      WHEN p.normalized_trade_name = ${normalizedExact} THEN 2
      WHEN LOWER(p.inn) = ${lowerExact}
        OR LOWER(p.active_ingredient) = ${lowerExact} THEN 3
      WHEN LOWER(p.registration_number) = ${lowerExact} THEN 4
      WHEN p.normalized_trade_name LIKE ${normalizedPrefix} ESCAPE '\\'
        OR LOWER(p.inn) LIKE ${lowerPrefix} ESCAPE '\\'
        OR LOWER(p.active_ingredient) LIKE ${lowerPrefix} ESCAPE '\\'
        OR LOWER(p.registration_number) LIKE ${lowerPrefix} ESCAPE '\\' THEN 5
      WHEN ${prefixApproved} THEN 6
      ELSE 7
    END`;
  }

  const manufacturer = input.manufacturer?.trim();
  if (manufacturer) {
    const lowerRef = add(
      `%${escapeLike(manufacturer.toLocaleLowerCase("uk-UA"))}%`,
    );
    const normalizedRef = add(`%${escapeLike(normalize(manufacturer))}%`);
    clauses.push(`(
      LOWER(p.applicant_name) LIKE ${lowerRef} ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM knowledge_registry_manufacturers filter_manufacturer
        WHERE filter_manufacturer.product_registry_id = p.registry_id
          AND filter_manufacturer.normalized_name
            LIKE ${normalizedRef} ESCAPE '\\'
      )
    )`);
  }

  const tradeName = input.tradeName?.trim();
  if (tradeName) {
    const ref = add(`%${escapeLike(normalize(tradeName))}%`);
    clauses.push(`p.normalized_trade_name LIKE ${ref} ESCAPE '\\'`);
  }

  const strength = input.strength?.trim();
  if (strength) {
    const ref = add(`%${escapeLike(strength.toLocaleLowerCase("uk-UA"))}%`);
    clauses.push(`(
      LOWER(p.active_ingredient) LIKE ${ref} ESCAPE '\\'
      OR LOWER(p.form) LIKE ${ref} ESCAPE '\\'
    )`);
  }

  const form = input.form?.trim();
  if (form) {
    const ref = add(`%${escapeLike(form.toLocaleLowerCase("uk-UA"))}%`);
    clauses.push(`LOWER(p.form) LIKE ${ref} ESCAPE '\\'`);
  }

  if (input.registrationStatus) {
    const ref = add(input.registrationStatus);
    clauses.push(`(${REGISTRATION_STATUS_SQL}) = ${ref}`);
  }

  if (input.nationalListStatus && input.nationalListStatus !== "all") {
    const ref = add(input.nationalListStatus);
    clauses.push(`COALESCE(nlm.status, CASE WHEN nlr.id IS NULL THEN 'not_applicable' ELSE 'uncertain' END) = ${ref}`);
  }

  return {
    values,
    joinSql: `${joinSql}\n${NATIONAL_LIST_MATCH_JOIN_SQL}`,
    whereSql: clauses.length ? `WHERE ${clauses.join("\n AND ")}` : "",
    rankSql,
  };
}

export async function createPostgresRegistryCatalogStore(
  options: RegistryCatalogStoreOptions = {},
): Promise<RegistryCatalogStore> {
  const executor = options.executor ??
    (await import("@workspace/db")).pool as CatalogQueryExecutor;
  const runQuery = async <T>(
    label: string,
    text: string,
    values: unknown[] = [],
  ): Promise<{ rows: T[] }> => {
    const started = performance.now();
    try {
      const result = await executor.query(text, values);
      return { rows: result.rows as T[] };
    } finally {
      const finished = performance.now();
      options.onQuery?.({
        label,
        durationMs: finished - started,
        startedAtMs: started,
        finishedAtMs: finished,
        statement: text,
        values,
      });
    }
  };

  const getCatalogSnapshot = (): Promise<CatalogSnapshot> =>
    catalogSnapshotCache.getOrSet(REGISTRY_SEARCH_CACHE_VERSION, async () => {
      const result = await runQuery<{ count: number; snapshot_version: string | null }>(
        "catalog-snapshot",
        `SELECT COUNT(*)::int AS count,
                CONCAT(
                  COUNT(*)::text, ':',
                  COALESCE(MAX(updated_at)::text, ''), ':',
                  COALESCE(MAX(import_batch_id), 'unversioned')
                ) AS snapshot_version
         FROM knowledge_registry_products`,
      );
      return {
        catalogTotal: Number(result.rows[0]?.count ?? 0),
        version: result.rows[0]?.snapshot_version ?? "unversioned",
      };
    });

  const getCatalogTotal = async (): Promise<number> =>
    (await getCatalogSnapshot()).catalogTotal;

  const hydrateProducts = async (rows: ProductRow[]): Promise<ProductResult[]> => {
    if (!rows.length) return [];
    const productIds = rows.map((row) => row.registry_id);
    const aliases = [...new Set(rows.flatMap(aliasesForProduct))];
    const [manufacturerResult, mappingResult] = await Promise.all([
      runQuery<ManufacturerRow>(
        "registry-manufacturers",
        `SELECT product_registry_id, name, country
         FROM knowledge_registry_manufacturers
         WHERE product_registry_id = ANY($1::text[])
         ORDER BY product_registry_id, LOWER(name), LOWER(country)`,
        [productIds],
      ),
      aliases.length
        ? runQuery<MappingRow>(
            "approved-mappings",
            `SELECT
               n.normalized,
               n.review_status,
               i.id::text AS ingredient_id,
               i.inn,
               i.latin,
               i.english,
               i.atc_code
             FROM knowledge_ingredient_names n
             JOIN knowledge_ingredients i
               ON i.inn_key = n.ingredient_inn_key
             WHERE n.review_status = 'approved'
               AND n.normalized = ANY($1::text[])
             ORDER BY n.normalized, i.inn_key`,
            [aliases],
          )
        : Promise.resolve({ rows: [] as MappingRow[] }),
    ]);
    return assembleRegistryProducts(
      rows,
      manufacturerResult.rows,
      mappingResult.rows,
    );
  };

  return {
    async getCatalogTotal(): Promise<number> {
      return getCatalogTotal();
    },

    async findUniqueExactProduct(input): Promise<ProductSearchResult | null> {
      const cachedSnapshot = catalogSnapshotCache.get(REGISTRY_SEARCH_CACHE_VERSION);
      const cacheKey = registrySearchCacheKey(
        "exact",
        input,
        cachedSnapshot?.version ?? "pending",
      );
      return exactProductCache.getOrSet(
        cacheKey,
        async () => {
          const query = input.q.trim();
          const normalized = normalize(query) || query.toLocaleLowerCase("uk-UA");
          const [snapshot, exactResult] = await Promise.all([
            getCatalogSnapshot(),
            runQuery<ProductRow>(
              "registry-exact-product",
              `WITH exact_candidates AS (
                 SELECT p.registry_id, 1 AS priority
                 FROM knowledge_registry_products p
                 WHERE p.registration_number = $1
                 UNION ALL
                 SELECT p.registry_id, 2 AS priority
                 FROM knowledge_registry_products p
                 WHERE p.normalized_trade_name = $2
                 UNION ALL
                 SELECT DISTINCT p.registry_id, 3 AS priority
                 FROM knowledge_ingredient_names query_alias
                 JOIN knowledge_ingredient_names product_alias
                   ON product_alias.ingredient_inn_key = query_alias.ingredient_inn_key
                  AND product_alias.review_status = 'approved'
                 JOIN knowledge_registry_products p
                   ON p.normalized_trade_name = product_alias.normalized
                 WHERE query_alias.review_status = 'approved'
                   AND query_alias.normalized = $2
                 UNION ALL
                 SELECT p.registry_id, 4 AS priority
                 FROM knowledge_registry_products p
                 WHERE LOWER(p.inn) = $3 OR LOWER(p.active_ingredient) = $3
               ), winning_priority AS (
                 SELECT MIN(priority) AS priority FROM exact_candidates
               ), unique_candidates AS (
                 SELECT DISTINCT candidate.registry_id
                 FROM exact_candidates candidate
                 JOIN winning_priority winner ON winner.priority = candidate.priority
                 ORDER BY candidate.registry_id
                 LIMIT 2
               )
               SELECT
                 p.registry_id,
                 p.trade_name,
                 p.normalized_trade_name,
                 p.inn,
                 p.active_ingredient,
                 p.atc_code,
                 p.form,
                 p.registration_number,
                 p.registration_start_date,
                 p.registration_end_date,
                 p.source_key,
                 ${REGISTRATION_STATUS_SQL} AS registration_status,
                 ${NATIONAL_LIST_MATCH_SELECT_SQL}
               FROM knowledge_registry_products p
               JOIN unique_candidates candidate ON candidate.registry_id = p.registry_id
               ${NATIONAL_LIST_MATCH_JOIN_SQL}
               ORDER BY p.registry_id`,
              [
                query.toUpperCase(),
                normalized,
                query.toLocaleLowerCase("uk-UA"),
              ],
            ),
          ]);
          const result = exactResult.rows.length === 1
            ? {
                catalogTotal: snapshot.catalogTotal,
                filteredTotal: 1,
                items: await hydrateProducts(exactResult.rows),
              }
            : null;
          const versionedKey = registrySearchCacheKey(
            "exact",
            input,
            snapshot.version,
          );
          if (versionedKey !== cacheKey) {
            exactProductCache.set(
              versionedKey,
              result,
              result ? REGISTRY_CACHE_TTL_MS : REGISTRY_NEGATIVE_CACHE_TTL_MS,
            );
          }
          return result;
        },
        (result) => result
          ? REGISTRY_CACHE_TTL_MS
          : REGISTRY_NEGATIVE_CACHE_TTL_MS,
      );
    },

    async searchProducts(input): Promise<ProductSearchResult> {
      const filter = buildProductFilter(input);
      const offset = (input.page - 1) * input.pageSize;
      const pageValues = [...filter.values, input.pageSize, offset];
      const limitRef = `$${filter.values.length + 1}`;
      const offsetRef = `$${filter.values.length + 2}`;
      const [catalogCount, filteredCount, pageResult] = await Promise.all([
        getCatalogTotal(),
        runQuery<{ count: number }>(
          "registry-flat-count",
          `SELECT COUNT(*)::int AS count
           FROM knowledge_registry_products p
           ${filter.joinSql}
           ${filter.whereSql}`,
          filter.values,
        ),
        runQuery<ProductRow>(
          "registry-flat-page",
          `SELECT
             p.registry_id,
             p.trade_name,
             p.normalized_trade_name,
             p.inn,
             p.active_ingredient,
             p.atc_code,
             p.form,
             p.registration_number,
             p.registration_start_date,
             p.registration_end_date,
             p.source_key,
             ${REGISTRATION_STATUS_SQL} AS registration_status,
             ${NATIONAL_LIST_MATCH_SELECT_SQL}
           FROM knowledge_registry_products p
           ${filter.joinSql}
           ${filter.whereSql}
           ORDER BY ${filter.rankSql},
             LOWER(p.trade_name), LOWER(p.form),
             LOWER(p.registration_number), p.registry_id
           LIMIT ${limitRef} OFFSET ${offsetRef}`,
          pageValues,
        ),
      ]);

      if (!pageResult.rows.length) {
        return {
          catalogTotal: catalogCount,
          filteredTotal: Number(filteredCount.rows[0]?.count ?? 0),
          items: [],
        };
      }

      return {
        catalogTotal: catalogCount,
        filteredTotal: Number(filteredCount.rows[0]?.count ?? 0),
        items: await hydrateProducts(pageResult.rows),
      };
    },

    async searchProductsForGrouping(input): Promise<ProductSearchResult> {
      const cachedSnapshot = catalogSnapshotCache.get(REGISTRY_SEARCH_CACHE_VERSION);
      const cacheKey = registrySearchCacheKey(
        "grouped",
        input,
        cachedSnapshot?.version ?? "pending",
      );
      return groupedProductCache.getOrSet(cacheKey, async () => {
        // Group/trade/variant pagination is derived from the same bounded raw snapshot.
        const rawInput = { ...input, tradeName: undefined };
        const filter = buildProductFilter(rawInput);
        const rowLimit = GROUPED_CATALOG_ROW_LIMIT + 1;
        const pageValues = [...filter.values, rowLimit];
        const limitRef = `$${filter.values.length + 1}`;
        const [snapshot, pageResult] = await Promise.all([
          getCatalogSnapshot(),
          runQuery<ProductRow>(
            "registry-grouped-page",
            `SELECT
               p.registry_id,
               p.trade_name,
               p.normalized_trade_name,
               p.inn,
               p.active_ingredient,
               p.atc_code,
               p.form,
               p.registration_number,
               p.registration_start_date,
               p.registration_end_date,
               p.source_key,
               ${REGISTRATION_STATUS_SQL} AS registration_status,
               ${NATIONAL_LIST_MATCH_SELECT_SQL}
             FROM knowledge_registry_products p
             ${filter.joinSql}
             ${filter.whereSql}
             ORDER BY ${filter.rankSql},
               LOWER(p.trade_name), LOWER(p.form),
               LOWER(p.registration_number), p.registry_id
             LIMIT ${limitRef}`,
            pageValues,
          ),
        ]);
        const bounded = pageResult.rows.length <= GROUPED_CATALOG_ROW_LIMIT;
        const rows = pageResult.rows.slice(0, GROUPED_CATALOG_ROW_LIMIT);
        const result = {
          catalogTotal: snapshot.catalogTotal,
          filteredTotal: rows.length,
          items: await hydrateProducts(rows),
          bounded,
        };
        const versionedKey = registrySearchCacheKey(
          "grouped",
          input,
          snapshot.version,
        );
        if (versionedKey !== cacheKey) groupedProductCache.set(versionedKey, result);
        return result;
      });
    },
    async searchIngredients(query, limit): Promise<IngredientResult[]> {
      const values: unknown[] = [];
      let whereQuery = "";
      let rankSql = CATALOG_BROWSE_RANK_SQL;
      if (query.trim()) {
        const lower = query.trim().toLocaleLowerCase("uk-UA");
        const normalized = normalize(query) || lower;
        values.push(
          normalized,
          lower,
          `${escapeLike(normalized)}%`,
          `${escapeLike(lower)}%`,
          `%${escapeLike(lower)}%`,
        );
        whereQuery = `AND (
          n.normalized = $1
          OR LOWER(i.inn) = $2
          OR LOWER(i.latin) = $2
          OR LOWER(i.english) = $2
          OR n.normalized LIKE $3 ESCAPE '\\'
          OR LOWER(i.inn) LIKE $4 ESCAPE '\\'
          OR LOWER(i.latin) LIKE $4 ESCAPE '\\'
          OR LOWER(i.english) LIKE $4 ESCAPE '\\'
          OR LOWER(n.name) LIKE $5 ESCAPE '\\'
          OR LOWER(COALESCE(i.atc_code, '')) LIKE $5 ESCAPE '\\'
        )`;
        rankSql = `CASE
          WHEN n.normalized = $1 THEN 1
          WHEN LOWER(i.inn) = $2 OR LOWER(i.latin) = $2
            OR LOWER(i.english) = $2 THEN 2
          WHEN n.normalized LIKE $3 ESCAPE '\\'
            OR LOWER(i.inn) LIKE $4 ESCAPE '\\'
            OR LOWER(i.latin) LIKE $4 ESCAPE '\\'
            OR LOWER(i.english) LIKE $4 ESCAPE '\\' THEN 3
          ELSE 4
        END`;
      }
      values.push(limit);
      const limitRef = `$${values.length}`;
      const result = await runQuery<IngredientRow>(
        "approved-ingredients",
        `SELECT
           i.id::text AS ingredient_id,
           i.inn,
           i.latin,
           i.english,
           i.atc_code,
           i.group_name,
           (ARRAY_AGG(n.name ORDER BY ${rankSql}, LOWER(n.name)))[1] AS matched_name
         FROM knowledge_ingredient_names n
         JOIN knowledge_ingredients i
           ON i.inn_key = n.ingredient_inn_key
         WHERE n.review_status = 'approved'
           ${whereQuery}
         GROUP BY i.id, i.inn, i.latin, i.english, i.atc_code, i.group_name
         ORDER BY MIN(${rankSql}), LOWER(i.inn), i.id
         LIMIT ${limitRef}`,
        values,
      );
      return result.rows.map((row) => ({
        resultType: "ingredient",
        ingredientId: row.ingredient_id,
        inn: row.inn,
        latin: row.latin,
        english: row.english,
        atcCode: row.atc_code,
        group: row.group_name,
        matchedName: row.matched_name,
        mappingStatus: "approved",
      }));
    },
  };
}

function resolveCatalogView(input: CatalogSearchInput): "flat" | "grouped" {
  return input.view ??
    (input.q.trim() && input.type !== "ingredients" ? "grouped" : "flat");
}

export function isExactFastPathEligible(input: CatalogSearchInput): boolean {
  return Boolean(input.q.trim()) &&
    input.type !== "ingredients" &&
    resolveCatalogView(input) === "grouped" &&
    input.page === 1 &&
    input.groupPage === 1 &&
    input.tradePage === 1 &&
    input.variantPage === 1 &&
    !input.groupKey &&
    !input.tradeNameKey &&
    !input.tradeName?.trim() &&
    !input.manufacturer?.trim() &&
    !input.form?.trim() &&
    !input.strength?.trim() &&
    !input.registrationStatus &&
    input.compositionType === "all" &&
    input.mappingStatus === "all" &&
    input.nationalListStatus === "all";
}

function responsePageSize(input: CatalogSearchInput): 25 | 50 {
  return input.pageSize === 50 ? 50 : 25;
}

function emptyRegistryPage(input: CatalogSearchInput) {
  return {
    items: [],
    total: 0,
    page: input.page,
    pageSize: responsePageSize(input),
    totalPages: 0,
    hasNext: false,
  };
}

function staticFallback(input: CatalogSearchInput, warning: string): CatalogSearchResult {
  const ingredients = input.type === "registry_products"
    ? []
    : [...new Map(
        searchDrugs(input.q, "all").map((drug) => [normalize(drug.inn), drug]),
      ).values()]
        .slice(0, 25)
        .map((drug) => ({
          resultType: "ingredient" as const,
          ingredientId: `static:${drug.id}`,
          inn: drug.inn,
          latin: "",
          english: "",
          atcCode: drug.atcCode ?? null,
          group: drug.pharmacologicalGroup,
          matchedName: drug.brandName,
          mappingStatus: "approved" as const,
        }));

  return {
    query: input.q,
    type: input.type,
    view: resolveCatalogView(input),
    runtimeMode: "static",
    catalogTotal: 0,
    ingredients,
    registryProducts: emptyRegistryPage(input),
    registryGroups: null,
    warnings: [warning],
  };
}

export async function searchCatalog(
  input: CatalogSearchInput,
  store?: RegistryCatalogStore,
): Promise<CatalogSearchResult> {
  const warning =
    "Production registry is unavailable; static reference fallback is active.";
  if (!store && (!isDbRuntimeEnabled() || !process.env.DATABASE_URL)) {
    return staticFallback(input, warning);
  }

  try {
    const activeStore = store ?? (await createPostgresRegistryCatalogStore());
    const view = resolveCatalogView(input);
    const includeProducts = input.type !== "ingredients";
    const includeIngredients =
      input.type === "ingredients" ||
      (input.type === "all" && Boolean(input.q.trim()));
    const ingredientSearch = includeIngredients
      ? activeStore.searchIngredients(input.q, input.type === "ingredients" ? 25 : 8)
      : Promise.resolve([]);
    if (
      activeStore.findUniqueExactProduct &&
      isExactFastPathEligible(input)
    ) {
      const [exact, exactIngredients] = await Promise.all([
        activeStore.findUniqueExactProduct(input),
        ingredientSearch,
      ]);
      if (exact) {
        return {
          query: input.q,
          type: input.type,
          view: "flat",
          runtimeMode: "db",
          catalogTotal: exact.catalogTotal,
          ingredients: exactIngredients,
          registryProducts: {
            items: exact.items,
            total: 1,
            page: 1,
            pageSize: responsePageSize(input),
            totalPages: 1,
            hasNext: false,
          },
          registryGroups: null,
          warnings: [],
        };
      }
    }
    const productSearch = includeProducts
      ? view === "grouped" && activeStore.searchProductsForGrouping
        ? activeStore.searchProductsForGrouping(input)
        : activeStore.searchProducts(input)
      : Promise.resolve(null);
    const [products, catalogTotal, ingredients] = await Promise.all([
      productSearch,
      includeProducts ? null : activeStore.getCatalogTotal(),
      ingredientSearch,
    ]);
    const registryGroups =
      view === "grouped" && products
        ? groupRegistryProducts(products.items, input, products.bounded ?? true)
        : null;
    const total = registryGroups?.summary.totalRegistryPositions ??
      products?.filteredTotal ?? 0;
    const totalPages = total ? Math.ceil(total / input.pageSize) : 0;
    const warnings = products?.bounded === false
      ? ["Grouped catalog results exceeded the safety bound; refine the filters for a complete grouping."]
      : [];

    return {
      query: input.q,
      type: input.type,
      view,
      runtimeMode: "db",
      catalogTotal: products?.catalogTotal ?? catalogTotal ?? 0,
      ingredients,
      registryProducts: products
        ? view === "grouped"
          ? {
              items: [],
              total,
              page: 1,
              pageSize: responsePageSize(input),
              totalPages: 0,
              hasNext: false,
            }
          : {
              items: products.items,
              total,
              page: input.page,
              pageSize: responsePageSize(input),
              totalPages,
              hasNext: input.page < totalPages,
            }
        : emptyRegistryPage(input),
      registryGroups,
      warnings,
    };
  } catch {
    logger.warn("Registry catalog read unavailable");
    return staticFallback(input, warning);
  }
}
