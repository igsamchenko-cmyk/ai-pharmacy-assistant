import { readFileSync } from "node:fs";
import { TtlCache } from "../../lib/cache";
import { resolveDataFilePath } from "../../lib/dataPath";
import {
  DispensingCategorySnapshotSchema,
  type DispensingCategoryRecord,
  type DispensingCategorySnapshot,
  dispensingCategoryRecordsHash,
  normalizeRegistrationNumber,
} from "./model";

export const DISPENSING_CATEGORY_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1_000;

const snapshotCache = new TtlCache<DispensingCategorySnapshot>({
  ttlMs: 5 * 60_000,
  maxEntries: 1,
});

export type DispensingCategoryStatus =
  | "otc"
  | "prescription"
  | "conditional"
  | "unknown"
  | "conflict"
  | "not_found";

export interface DispensingCategoryCheckResult {
  version: "1.0";
  productId: string;
  registrationNumber: string;
  status: DispensingCategoryStatus;
  action:
    | "otc_with_professional_checks"
    | "prescription_required"
    | "verify_exact_package"
    | "manual_review";
  matchStatus: "product_and_registration" | "registration" | "not_found";
  summary: string;
  conditions: string[];
  packageDependent: boolean;
  restrictedSetting: boolean;
  source: {
    title: string;
    url: string;
    checkedAt: string;
    generatedAt: string;
    complete: boolean;
    officialRowCount: number;
    recordCount: number;
    sha256: string;
    freshness: "current" | "stale" | "incomplete";
    legalBasisTitle: string;
    legalBasisUrl: string;
    legalBasisRevisionDate: string;
  };
}

function loadSnapshot(): DispensingCategorySnapshot {
  const cached = snapshotCache.get("snapshot");
  if (cached) return cached;
  const raw = readFileSync(
    resolveDataFilePath("data/dispensing-categories/ua-drlz.json"),
    "utf8",
  );
  const snapshot = DispensingCategorySnapshotSchema.parse(JSON.parse(raw));
  const recordsHash = dispensingCategoryRecordsHash(snapshot.records);
  if (recordsHash !== snapshot.source.recordsSha256) {
    throw new Error("dispensing_category_snapshot_hash_mismatch");
  }
  if (snapshot.records.length !== snapshot.source.recordCount) {
    throw new Error("dispensing_category_snapshot_count_mismatch");
  }
  snapshotCache.set("snapshot", snapshot);
  return snapshot;
}

function freshness(
  snapshot: DispensingCategorySnapshot,
  now: Date,
): "current" | "stale" | "incomplete" {
  if (!snapshot.source.complete) return "incomplete";
  const generatedAt = new Date(snapshot.generatedAt).getTime();
  return Number.isFinite(generatedAt) &&
    now.getTime() - generatedAt <= DISPENSING_CATEGORY_FRESHNESS_MS
    ? "current"
    : "stale";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function resolveStatus(
  records: DispensingCategoryRecord[],
): DispensingCategoryStatus {
  if (!records.length) return "not_found";
  const categories = unique(records.map((record) => record.category));
  if (categories.length > 1) return "conflict";
  return categories[0] ?? "unknown";
}

function summaryFor(status: DispensingCategoryStatus): string {
  switch (status) {
    case "otc":
      return "ДРЛЗ позначає цю точну реєстраційну позицію як безрецептурну. Інші професійні перевірки перед відпуском залишаються обов'язковими.";
    case "prescription":
      return "ДРЛЗ позначає цю точну реєстраційну позицію як рецептурну. Перевірте належний рецепт і спеціальні умови відпуску.";
    case "conditional":
      return "Категорія залежить від розміру або виду упаковки. Звірте точну упаковку з умовами ДРЛЗ; автоматичний висновок не застосовується.";
    case "conflict":
      return "Для одного реєстраційного номера знайдено суперечливі умови відпуску. Потрібна ручна перевірка чинного запису ДРЛЗ та офіційної інструкції.";
    case "unknown":
      return "У структурованому записі ДРЛЗ умови відпуску не визначені. Не робіть висновок Rx/OTC автоматично.";
    case "not_found":
      return "Точного реєстраційного номера в локальному перевіреному знімку не знайдено. Перевірте живий ДРЛЗ та офіційну інструкцію вручну.";
  }
}

export function checkDispensingCategory(
  productId: string,
  registrationNumber: string,
  options: { snapshot?: DispensingCategorySnapshot; now?: Date } = {},
): DispensingCategoryCheckResult {
  const normalizedProductId = productId.trim().toUpperCase();
  const normalizedRegistration =
    normalizeRegistrationNumber(registrationNumber);
  if (!/^[A-F0-9]{32}$/u.test(normalizedProductId)) {
    throw new Error("invalid_product_id");
  }
  if (!/^UA\/\d+\/\d+\/\d+$/u.test(normalizedRegistration)) {
    throw new Error("invalid_registration_number");
  }

  const snapshot = options.snapshot ?? loadSnapshot();
  const registrationMatches = snapshot.records.filter(
    (record) => record.registrationNumber === normalizedRegistration,
  );
  const exactMatches = registrationMatches.filter(
    (record) => record.registryProductId === normalizedProductId,
  );
  const evidence = exactMatches.length ? exactMatches : registrationMatches;
  const matchStatus = exactMatches.length
    ? ("product_and_registration" as const)
    : registrationMatches.length
      ? ("registration" as const)
      : ("not_found" as const);
  const status = resolveStatus(evidence);
  const sourceFreshness = freshness(snapshot, options.now ?? new Date());
  const action =
    sourceFreshness !== "current"
      ? ("manual_review" as const)
      : status === "otc"
        ? ("otc_with_professional_checks" as const)
        : status === "prescription"
          ? ("prescription_required" as const)
          : status === "conditional"
            ? ("verify_exact_package" as const)
            : ("manual_review" as const);

  return {
    version: "1.0",
    productId: normalizedProductId,
    registrationNumber: normalizedRegistration,
    status,
    action,
    matchStatus,
    summary: summaryFor(status),
    conditions: unique(
      evidence.map((record) => record.conditionsRaw).filter(Boolean),
    ).slice(0, 20),
    packageDependent: evidence.some((record) => record.packageDependent),
    restrictedSetting: evidence.some((record) => record.restrictedSetting),
    source: {
      title: snapshot.source.title,
      url: snapshot.source.datasetUrl,
      checkedAt: snapshot.source.checkedAt,
      generatedAt: snapshot.generatedAt,
      complete: snapshot.source.complete,
      officialRowCount: snapshot.source.officialRowCount,
      recordCount: snapshot.source.recordCount,
      sha256: snapshot.source.sha256,
      freshness: sourceFreshness,
      legalBasisTitle: snapshot.legalBasis.title,
      legalBasisUrl: snapshot.legalBasis.url,
      legalBasisRevisionDate: snapshot.legalBasis.revisionDate,
    },
  };
}

export function clearDispensingCategoryCache(): void {
  snapshotCache.clear();
}
