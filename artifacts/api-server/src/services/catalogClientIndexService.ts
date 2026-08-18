import {
  CATALOG_CLIENT_INDEX_MAX_ALIASES,
  CATALOG_CLIENT_INDEX_MAX_PRODUCTS,
  CATALOG_CLIENT_INDEX_MAX_WIRE_BYTES,
  CATALOG_CLIENT_INDEX_VERSION,
  CATALOG_REGISTRATION_TERMINATED_MARKER,
  catalogClientIndexWireBytes,
  catalogCompositionKey,
  encodeCatalogClientIndexRow,
  isNonSpecificInn,
  type CatalogClientIndexAliasRow,
  type CatalogClientIndexPayload,
} from "@workspace/catalog-index";
import {
  listDictionaryEntries,
  resolveSourceBackedDictionaryQuery,
} from "../knowledge/dictionary";
import { normalizeRegistrationNumber } from "../knowledge/dispensingCategories/model";
import {
  priceCatalogCompositionByRegistration,
  priceCatalogStrengthByRegistration,
} from "../knowledge/priceCatalog/catalog";
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
  manufacturer: string | null;
  registration_end_date: string | null;
  early_termination: string | null;
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

interface PendingCatalogClientIndexBuild {
  snapshotHash: string;
  promise: Promise<{ payload: CatalogClientIndexPayload; wireBytes: number }>;
}

let cachedPayload: CatalogClientIndexPayload | null = null;
let pendingBuild: PendingCatalogClientIndexBuild | null = null;

function normalizeEtag(value: string | null | undefined): string | null {
  const normalized =
    value?.trim().replace(/^W\//u, "").replace(/^"|"$/gu, "") ?? "";
  return /^[a-f0-9]{64}$/u.test(normalized) ? normalized : null;
}

/** Strength bound shared by the row mapper and the price-catalog backfill. */
const CATALOG_INDEX_STRENGTH_MAX_LENGTH = 120;

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

/**
 * A derived value that does not fit its bound is dropped, not thrown on.
 *
 * `bounded` is right for registry-native columns: the contract says they fit,
 * and a violation means the snapshot is wrong. It is the wrong rule for a
 * value this service synthesises from a second source. The МОЗ price catalog
 * records some combination strengths as multi-hundred-character prose — 139
 * registrations in the current snapshot exceed the 120-character strength
 * bound, the longest by a factor of eighteen — and throwing on one of them
 * took the entire client index offline with a 503 for every pharmacist. A
 * missing dosage on one position is honest; losing the whole catalog to make
 * that point is not.
 */
function boundedOrEmpty(value: string, max: number): string {
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length > max ? "" : normalized;
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

/**
 * Resolve the composition identity for a registration whose registry МНН is a
 * non-specific placeholder ("Comb drug" and friends). Without this, every such
 * product shares one meaningless identity and cannot be grouped at all; with
 * it, the actual active substances decide. Rows with a usable registry МНН keep
 * an empty key, so composition never silently overrides the registry.
 */
function resolveCompositionKey(
  row: ProductRow,
  compositions: Map<string, string>,
): string {
  if (!isNonSpecificInn(row.inn ?? "")) return "";
  const registration = normalizeRegistrationNumber(row.registration_number);
  const composition = registration ? compositions.get(registration) : undefined;
  return composition ? catalogCompositionKey(composition) : "";
}

/**
 * Price-catalog lookups must never break the catalog index: it is a separate
 * optional snapshot, so a missing or malformed file degrades to "no enrichment"
 * instead of taking search offline.
 */
function loadPriceCatalogIndexes(): {
  compositions: Map<string, string>;
  strengths: Map<string, string>;
} {
  try {
    return {
      compositions: priceCatalogCompositionByRegistration(),
      strengths: priceCatalogStrengthByRegistration(),
    };
  } catch {
    return { compositions: new Map(), strengths: new Map() };
  }
}

/**
 * Keep the registry's validity evidence rather than a verdict, so the client
 * can re-evaluate it against the current date. An explicit early-termination
 * flag wins over the end date; anything unparseable stays empty and reads as
 * "unknown" rather than as "active".
 */
function resolveRegistrationValidity(row: ProductRow): string {
  const earlyTermination = (row.early_termination ?? "").trim().toLowerCase();
  if (
    earlyTermination &&
    !["no", "false", "0", "ні", "нет"].includes(earlyTermination)
  ) {
    return CATALOG_REGISTRATION_TERMINATED_MARKER;
  }
  const endDate = (row.registration_end_date ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/u.exec(endDate);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dotted = /^(\d{2})\.(\d{2})\.(\d{4})/u.exec(endDate);
  if (dotted) return `${dotted[3]}-${dotted[2]}-${dotted[1]}`;
  return "";
}

async function buildPayloadUncached(
  snapshot: CatalogClientIndexSnapshot,
  executor: CatalogClientIndexQueryExecutor,
): Promise<{ payload: CatalogClientIndexPayload; wireBytes: number }> {
  const result = await executor.query(
    `SELECT p.registry_id, p.registration_number, p.trade_name, p.inn, p.form,
            p.strength, p.registration_end_date, p.early_termination,
            p.source_snapshot_hash,
            (SELECT m.name
               FROM knowledge_registry_manufacturers m
              WHERE m.product_registry_id = p.registry_id
              ORDER BY m.normalized_name
              LIMIT 1) AS manufacturer
     FROM knowledge_registry_products p
     WHERE p.review_status <> 'stale'
     ORDER BY p.normalized_trade_name, p.registration_number, p.registry_id
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
  const { compositions, strengths } = loadPriceCatalogIndexes();
  const payload: CatalogClientIndexPayload = {
    version: CATALOG_CLIENT_INDEX_VERSION,
    snapshotHash: snapshot.snapshotHash,
    generatedAt: snapshot.generatedAt,
    productCount: snapshot.productCount,
    aliasCount: aliases.length,
    rows: rows.map((row) => {
      // The registry's own strength column is empty for most rows, which is
      // what makes same-name, same-form results indistinguishable; fall back
      // to the declared strength rather than showing nothing.
      const registration = normalizeRegistrationNumber(row.registration_number);
      const strength =
        row.strength.trim() ||
        boundedOrEmpty(
          registration ? (strengths.get(registration) ?? "") : "",
          CATALOG_INDEX_STRENGTH_MAX_LENGTH,
        );
      return encodeCatalogClientIndexRow({
        productId: bounded(row.registry_id, 32, "productId"),
        registration: bounded(row.registration_number, 80, "registration"),
        tradeName: bounded(row.trade_name, 500, "tradeName"),
        inn: bounded(row.inn, 500, "inn"),
        form: bounded(conciseCatalogIndexForm(row.form), 500, "form"),
        strength: bounded(
          strength,
          CATALOG_INDEX_STRENGTH_MAX_LENGTH,
          "strength",
        ),
        compositionKey: resolveCompositionKey(row, compositions),
        manufacturer: bounded(row.manufacturer, 500, "manufacturer"),
        registrationValidity: resolveRegistrationValidity(row),
      });
    }),
    aliases,
  };
  const wireBytes = catalogClientIndexWireBytes(payload);
  if (wireBytes > CATALOG_CLIENT_INDEX_MAX_WIRE_BYTES) {
    throw new Error("Catalog client index exceeds the wire-size budget.");
  }
  cachedPayload = payload;
  return { payload, wireBytes };
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
  if (pendingBuild?.snapshotHash === snapshot.snapshotHash) {
    return pendingBuild.promise;
  }
  const promise = buildPayloadUncached(snapshot, executor);
  pendingBuild = { snapshotHash: snapshot.snapshotHash, promise };
  try {
    return await promise;
  } finally {
    if (pendingBuild?.promise === promise) pendingBuild = null;
  }
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

export async function warmCatalogClientIndexCache(
  executor?: CatalogClientIndexQueryExecutor,
): Promise<{ snapshotHash: string; productCount: number; wireBytes: number }> {
  const result = await loadCatalogClientIndex(null, executor);
  if (result.status !== "ready") {
    throw new Error("Catalog client index prewarm did not build a payload.");
  }
  return {
    snapshotHash: result.payload.snapshotHash,
    productCount: result.payload.productCount,
    wireBytes: result.wireBytes,
  };
}

export function resetCatalogClientIndexCacheForTests(): void {
  cachedPayload = null;
  pendingBuild = null;
}
