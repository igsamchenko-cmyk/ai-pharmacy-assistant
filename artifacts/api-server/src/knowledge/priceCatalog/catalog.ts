import { readFileSync } from "node:fs";
import { TtlCache } from "../../lib/cache";
import { resolveDataFilePath } from "../../lib/dataPath";
import { normalizeRegistrationNumber } from "../dispensingCategories/model";
import {
  PriceCatalogSnapshotSchema,
  type PriceCatalogRecord,
  type PriceCatalogSnapshot,
  priceCatalogRecordsHash,
} from "./model";

export const PRICE_CATALOG_FRESHNESS_MS = 45 * 24 * 60 * 60 * 1_000;

const snapshotCache = new TtlCache<PriceCatalogSnapshot>({
  ttlMs: 5 * 60_000,
  maxEntries: 1,
});

export interface PriceCatalogCheckResult {
  version: "1.0";
  registrationNumber: string;
  status: "priced" | "requires_package" | "not_in_catalog";
  selected: PriceCatalogRecord | null;
  candidates: PriceCatalogRecord[];
  summary: string;
  source: {
    title: string;
    url: string;
    checkedAt: string;
    releaseDate: string;
    recordCount: number;
    sha256: string;
    freshness: "current" | "stale" | "incomplete";
    scopeNote: string;
  };
}

function loadSnapshot(): PriceCatalogSnapshot {
  const cached = snapshotCache.get("snapshot");
  if (cached) return cached;
  const raw = readFileSync(
    resolveDataFilePath("data/price-catalog/ua-moz-2026-07-01.json"),
    "utf8",
  );
  const snapshot = PriceCatalogSnapshotSchema.parse(JSON.parse(raw));
  if (
    priceCatalogRecordsHash(snapshot.records) !== snapshot.source.recordsSha256
  ) {
    throw new Error("price_catalog_snapshot_hash_mismatch");
  }
  if (snapshot.records.length !== snapshot.source.recordCount) {
    throw new Error("price_catalog_snapshot_count_mismatch");
  }
  snapshotCache.set("snapshot", snapshot);
  return snapshot;
}

function freshness(
  snapshot: PriceCatalogSnapshot,
  now: Date,
): "current" | "stale" | "incomplete" {
  if (!snapshot.source.complete) return "incomplete";
  const checkedAt = new Date(snapshot.source.checkedAt).getTime();
  return Number.isFinite(checkedAt) &&
    now.getTime() - checkedAt <= PRICE_CATALOG_FRESHNESS_MS
    ? "current"
    : "stale";
}

export function checkPriceCatalog(
  registrationNumber: string,
  selectedCatalogId?: string | null,
  options: { snapshot?: PriceCatalogSnapshot; now?: Date } = {},
): PriceCatalogCheckResult {
  const normalizedRegistration =
    normalizeRegistrationNumber(registrationNumber);
  if (!/^UA\/\d+\/\d+\/\d+$/u.test(normalizedRegistration)) {
    throw new Error("invalid_registration_number");
  }
  const snapshot = options.snapshot ?? loadSnapshot();
  const candidates = snapshot.records.filter(
    (record) =>
      normalizeRegistrationNumber(record.registrationNumber) ===
      normalizedRegistration,
  );
  const selected = selectedCatalogId
    ? (candidates.find((record) => record.catalogId === selectedCatalogId) ??
      null)
    : candidates.length === 1
      ? (candidates[0] ?? null)
      : null;
  const sourceFreshness = freshness(snapshot, options.now ?? new Date());
  const status = selected
    ? ("priced" as const)
    : candidates.length
      ? ("requires_package" as const)
      : ("not_in_catalog" as const);
  const summary =
    status === "priced"
      ? `Знайдено точну упаковку ${selected?.packageDescription}. Гранична роздрібна ціна: ${selected?.maximumRetailPriceUah ?? "не оприлюднена"} грн.`
      : status === "requires_package"
        ? `За реєстраційним номером знайдено ${candidates.length} упаковок. Оберіть точну упаковку перед ціновим висновком.`
        : "Реєстраційного номера немає в поточному Національному каталозі цін. Це не є доказом відсутності державного регулювання або ціни реімбурсації.";

  return {
    version: "1.0",
    registrationNumber: normalizedRegistration,
    status,
    selected,
    candidates,
    summary,
    source: {
      title: snapshot.source.title,
      url: snapshot.source.landingUrl,
      checkedAt: snapshot.source.checkedAt,
      releaseDate: snapshot.source.releaseDate,
      recordCount: snapshot.source.recordCount,
      sha256: snapshot.source.sha256,
      freshness: sourceFreshness,
      scopeNote:
        "Каталог не охоплює лікарські засоби, вартість яких повністю або частково відшкодовується з державного чи місцевого бюджету.",
    },
  };
}

/**
 * Map every registration number in the price catalog to its structured
 * composition string (the catalog's own «МНН» column, e.g.
 * "Кальцію карбонат + МАГНІЮ КАРБОНАТ ВАЖКИЙ").
 *
 * Unlike the registry's free-text «Склад (діючі)» prose, this column lists the
 * active substances as discrete `+`-separated components, which makes it usable
 * as a composition identity. A registration whose packages disagree on the
 * composition is dropped rather than guessed at: an ambiguous composition must
 * never become an analog claim.
 */
export function priceCatalogCompositionByRegistration(
  snapshot?: PriceCatalogSnapshot,
): Map<string, string> {
  const records = (snapshot ?? loadSnapshot()).records;
  const compositions = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const record of records) {
    const composition = record.inn.trim();
    if (!composition) continue;
    const registration = normalizeRegistrationNumber(record.registrationNumber);
    if (!registration || ambiguous.has(registration)) continue;
    const previous = compositions.get(registration);
    if (previous === undefined) {
      compositions.set(registration, composition);
      continue;
    }
    if (previous !== composition) {
      compositions.delete(registration);
      ambiguous.add(registration);
    }
  }
  return compositions;
}

export function clearPriceCatalogCache(): void {
  snapshotCache.clear();
}
