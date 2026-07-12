import type { z } from "zod";
import {
  SearchCatalogQueryParams,
  SearchCatalogResponse,
} from "@workspace/api-zod";
import { normalize } from "../lib/text";
import { logger } from "../lib/logger";
import { isDbRuntimeEnabled } from "../knowledge/runtime";
import { searchDrugs } from "./drugService";

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
}

export interface RegistryCatalogStore {
  getCatalogTotal(): Promise<number>;
  searchProducts(input: CatalogSearchInput): Promise<ProductSearchResult>;
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
        key: row.source_key,
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
  let rankSql = CATALOG_BROWSE_RANK_SQL;
  if (query) {
    const lower = query.toLocaleLowerCase("uk-UA");
    const normalized = normalize(query) || lower;
    const lowerExact = add(lower);
    const normalizedExact = add(normalized);
    const lowerPrefix = add(`${escapeLike(lower)}%`);
    const normalizedPrefix = add(`${escapeLike(normalized)}%`);
    const contains = add(`%${escapeLike(lower)}%`);
    const exactApproved = `EXISTS (
      SELECT 1
      FROM knowledge_ingredient_names product_alias
      JOIN knowledge_ingredient_names query_alias
        ON query_alias.ingredient_inn_key = product_alias.ingredient_inn_key
      WHERE product_alias.review_status = 'approved'
        AND query_alias.review_status = 'approved'
        AND product_alias.normalized = p.normalized_trade_name
        AND query_alias.normalized = ${normalizedExact}
    )`;
    const prefixApproved = `EXISTS (
      SELECT 1
      FROM knowledge_ingredient_names product_alias
      JOIN knowledge_ingredient_names query_alias
        ON query_alias.ingredient_inn_key = product_alias.ingredient_inn_key
      WHERE product_alias.review_status = 'approved'
        AND query_alias.review_status = 'approved'
        AND product_alias.normalized = p.normalized_trade_name
        AND query_alias.normalized LIKE ${normalizedPrefix} ESCAPE '\\'
    )`;
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
          AND LOWER(search_manufacturer.name) LIKE ${contains} ESCAPE '\\'
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
    const ref = add(`%${escapeLike(manufacturer.toLocaleLowerCase("uk-UA"))}%`);
    clauses.push(`(
      LOWER(p.applicant_name) LIKE ${ref} ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM knowledge_registry_manufacturers filter_manufacturer
        WHERE filter_manufacturer.product_registry_id = p.registry_id
          AND LOWER(filter_manufacturer.name) LIKE ${ref} ESCAPE '\\'
      )
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

  return {
    values,
    whereSql: clauses.length ? `WHERE ${clauses.join("\n AND ")}` : "",
    rankSql,
  };
}

export async function createPostgresRegistryCatalogStore(): Promise<RegistryCatalogStore> {
  const { pool } = await import("@workspace/db");

  return {
    async getCatalogTotal(): Promise<number> {
      const result = await pool.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM knowledge_registry_products",
      );
      return Number(result.rows[0]?.count ?? 0);
    },

    async searchProducts(input): Promise<ProductSearchResult> {
      const filter = buildProductFilter(input);
      const offset = (input.page - 1) * input.pageSize;
      const pageValues = [...filter.values, input.pageSize, offset];
      const limitRef = `$${filter.values.length + 1}`;
      const offsetRef = `$${filter.values.length + 2}`;
      const [catalogCount, filteredCount, pageResult] = await Promise.all([
        pool.query<{ count: number }>(
          "SELECT COUNT(*)::int AS count FROM knowledge_registry_products",
        ),
        pool.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count
           FROM knowledge_registry_products p
           ${filter.whereSql}`,
          filter.values,
        ),
        pool.query<ProductRow>(
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
             ${REGISTRATION_STATUS_SQL} AS registration_status
           FROM knowledge_registry_products p
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
          catalogTotal: Number(catalogCount.rows[0]?.count ?? 0),
          filteredTotal: Number(filteredCount.rows[0]?.count ?? 0),
          items: [],
        };
      }

      const productIds = pageResult.rows.map((row) => row.registry_id);
      const aliases = [...new Set(pageResult.rows.flatMap(aliasesForProduct))];
      const [manufacturerResult, mappingResult] = await Promise.all([
        pool.query<ManufacturerRow>(
          `SELECT product_registry_id, name, country
           FROM knowledge_registry_manufacturers
           WHERE product_registry_id = ANY($1::text[])
           ORDER BY product_registry_id, LOWER(name), LOWER(country)`,
          [productIds],
        ),
        aliases.length
          ? pool.query<MappingRow>(
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

      return {
        catalogTotal: Number(catalogCount.rows[0]?.count ?? 0),
        filteredTotal: Number(filteredCount.rows[0]?.count ?? 0),
        items: assembleRegistryProducts(
          pageResult.rows,
          manufacturerResult.rows,
          mappingResult.rows,
        ),
      };
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
      const result = await pool.query<IngredientRow>(
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
    runtimeMode: "static",
    catalogTotal: 0,
    ingredients,
    registryProducts: emptyRegistryPage(input),
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
    const includeProducts = input.type !== "ingredients";
    const includeIngredients =
      input.type === "ingredients" ||
      (input.type === "all" && Boolean(input.q.trim()));
    const [products, catalogTotal, ingredients] = await Promise.all([
      includeProducts ? activeStore.searchProducts(input) : null,
      includeProducts ? null : activeStore.getCatalogTotal(),
      includeIngredients
        ? activeStore.searchIngredients(input.q, input.type === "ingredients" ? 25 : 8)
        : Promise.resolve([]),
    ]);
    const total = products?.filteredTotal ?? 0;
    const totalPages = total ? Math.ceil(total / input.pageSize) : 0;

    return {
      query: input.q,
      type: input.type,
      runtimeMode: "db",
      catalogTotal: products?.catalogTotal ?? catalogTotal ?? 0,
      ingredients,
      registryProducts: products
        ? {
            items: products.items,
            total,
            page: input.page,
            pageSize: responsePageSize(input),
            totalPages,
            hasNext: input.page < totalPages,
          }
        : emptyRegistryPage(input),
      warnings: [],
    };
  } catch {
    logger.warn("Registry catalog read unavailable");
    return staticFallback(input, warning);
  }
}
