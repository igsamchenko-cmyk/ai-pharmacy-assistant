import {
  CATALOG_CLIENT_INDEX_MAX_ALIASES,
  CATALOG_CLIENT_INDEX_MAX_PRODUCTS,
  CATALOG_CLIENT_INDEX_MAX_WIRE_BYTES,
  CATALOG_CLIENT_INDEX_VERSION,
  catalogClientIndexWireBytes,
  encodeCatalogClientIndexRow,
  type CatalogClientIndexAliasRow,
  type CatalogClientIndexPayload,
} from "@workspace/catalog-index";
import {
  listDictionaryEntries,
  resolveSourceBackedDictionaryQuery,
} from "../knowledge/dictionary";
import { normalize } from "../lib/text";

export interface CatalogClientIndexQueryExecutor {
  query(text: string, values?: unknown[]): PromiseLike<{ rows: unknown[] }>;
}

interface SnapshotRow {
  product_count: number;
  snapshot_count: number;
  snapshot_hash: string | null;
  generated_at: string | null;
}

interface ProductRow {
  registry_id: string;
  registration_number: string;
  trade_name: string;
  inn: string;
  form: string;
  strength: string;
  source_snapshot_hash: string | null;
}

interface CatalogClientIndexSnapshot {
  productCount: number;
  snapshotHash: string;
  generatedAt: string;
}

export type CatalogClientIndexLoadResult =
  | { status: "not_modified"; snapshotHash: string; productCount: number }
  | { status: "ready"; payload: CatalogClientIndexPayload; wireBytes: number };

let cachedPayload: CatalogClientIndexPayload | null = null;

function normalizeEtag(value: string | null | undefined): string | null {
  const normalized =
    value?.trim().replace(/^W\//u, "").replace(/^"|"$/gu, "") ?? "";
  return /^[a-f0-9]{64}$/u.test(normalized) ? normalized : null;
}

function bounded(
  value: string | null | undefined,
  max: number,
  field: string,
): string {
  const normalized = value?.trim().replace(/\s+/gu, " ") ?? "";
  if (normalized.length > max)
    throw new Error(`Catalog client index ${field} exceeds its bound.`);
  return normalized;
}

export function buildCatalogClientIndexAliases(): CatalogClientIndexAliasRow[] {
  const aliases = new Map<string, CatalogClientIndexAliasRow>();
  for (const entry of listDictionaryEntries()) {
    if (resolveSourceBackedDictionaryQuery(entry.name) !== entry) continue;
    const alias = bounded(entry.name, 240, "alias");
    const canonicalInn = bounded(entry.ingredient.inn, 500, "alias INN");
    const key = normalize(alias);
    const previous = aliases.get(key);
    if (previous && normalize(previous[1]) !== normalize(canonicalInn)) {
      throw new Error("Catalog client index source alias is ambiguous.");
    }
    aliases.set(key, [alias, canonicalInn]);
  }
  if (aliases.size > CATALOG_CLIENT_INDEX_MAX_ALIASES) {
    throw new Error("Catalog client index alias count exceeds its bound.");
  }
  return [...aliases.values()].sort((left, right) =>
    left[0].localeCompare(right[0], "uk-UA"),
  );
}

export function conciseCatalogIndexForm(value: string): string {
  const normalized = value.trim().replace(/\s+/gu, " ");
  const cutPoints = [
    normalized.indexOf(";"),
    normalized.search(/\s+in\s+bulk\b/iu),
    normalized.search(/(?:,\s*|\s+)\u043f\u043e\s+\d/iu),
  ].filter((index) => index >= 0);
  const end = cutPoints.length ? Math.min(...cutPoints) : normalized.length;
  return normalized
    .slice(0, end)
    .trim()
    .replace(/[,:;\-\s]+$/gu, "");
}

async function executorOrDefault(
  executor?: CatalogClientIndexQueryExecutor,
): Promise<CatalogClientIndexQueryExecutor> {
  return (
    executor ??
    ((await import("@workspace/db")).pool as CatalogClientIndexQueryExecutor)
  );
}

async function readSnapshot(
  executor: CatalogClientIndexQueryExecutor,
): Promise<CatalogClientIndexSnapshot> {
  const result = await executor.query(`
    SELECT COUNT(*)::int AS product_count,
           COUNT(DISTINCT source_snapshot_hash)::int AS snapshot_count,
           MIN(source_snapshot_hash) AS snapshot_hash,
           MAX(updated_at)::text AS generated_at
    FROM knowledge_registry_products
    WHERE review_status <> 'stale'
  `);
  const row = result.rows[0] as SnapshotRow | undefined;
  const productCount = Number(row?.product_count ?? 0);
  const snapshotHash = row?.snapshot_hash?.trim() ?? "";
  if (
    productCount < 1 ||
    productCount > CATALOG_CLIENT_INDEX_MAX_PRODUCTS ||
    Number(row?.snapshot_count ?? 0) !== 1 ||
    !/^[a-f0-9]{64}$/u.test(snapshotHash)
  ) {
    throw new Error(
      "A complete versioned catalog client index is unavailable.",
    );
  }
  const generatedAt = new Date(row?.generated_at ?? "").toISOString();
  return { productCount, snapshotHash, generatedAt };
}

async function buildPayload(
  snapshot: CatalogClientIndexSnapshot,
  executor: CatalogClientIndexQueryExecutor,
): Promise<{ payload: CatalogClientIndexPayload; wireBytes: number }> {
  if (cachedPayload?.snapshotHash === snapshot.snapshotHash) {
    return {
      payload: cachedPayload,
      wireBytes: catalogClientIndexWireBytes(cachedPayload),
    };
  }
  const result = await executor.query(
    `SELECT registry_id, registration_number, trade_name, inn, form, strength,
            source_snapshot_hash
     FROM knowledge_registry_products
     WHERE review_status <> 'stale'
     ORDER BY normalized_trade_name, registration_number, registry_id
     LIMIT $1`,
    [CATALOG_CLIENT_INDEX_MAX_PRODUCTS + 1],
  );
  const rows = result.rows as ProductRow[];
  if (
    rows.length !== snapshot.productCount ||
    rows.some((row) => row.source_snapshot_hash !== snapshot.snapshotHash)
  ) {
    throw new Error(
      "Catalog snapshot changed while the client index was being built.",
    );
  }
  const aliases = buildCatalogClientIndexAliases();
  const payload: CatalogClientIndexPayload = {
    version: CATALOG_CLIENT_INDEX_VERSION,
    snapshotHash: snapshot.snapshotHash,
    generatedAt: snapshot.generatedAt,
    productCount: snapshot.productCount,
    aliasCount: aliases.length,
    rows: rows.map((row) =>
      encodeCatalogClientIndexRow({
        productId: bounded(row.registry_id, 32, "productId"),
        registration: bounded(row.registration_number, 80, "registration"),
        tradeName: bounded(row.trade_name, 240, "tradeName"),
        inn: bounded(row.inn, 500, "inn"),
        form: bounded(conciseCatalogIndexForm(row.form), 240, "form"),
        strength: bounded(row.strength, 120, "strength"),
      }),
    ),
    aliases,
  };
  const wireBytes = catalogClientIndexWireBytes(payload);
  if (wireBytes > CATALOG_CLIENT_INDEX_MAX_WIRE_BYTES) {
    throw new Error("Catalog client index exceeds the wire-size budget.");
  }
  cachedPayload = payload;
  return { payload, wireBytes };
}

export async function loadCatalogClientIndex(
  ifNoneMatch?: string | null,
  executor?: CatalogClientIndexQueryExecutor,
): Promise<CatalogClientIndexLoadResult> {
  const activeExecutor = await executorOrDefault(executor);
  const snapshot = await readSnapshot(activeExecutor);
  if (normalizeEtag(ifNoneMatch) === snapshot.snapshotHash) {
    return {
      status: "not_modified",
      snapshotHash: snapshot.snapshotHash,
      productCount: snapshot.productCount,
    };
  }
  const built = await buildPayload(snapshot, activeExecutor);
  return { status: "ready", ...built };
}

export function resetCatalogClientIndexCacheForTests(): void {
  cachedPayload = null;
}
