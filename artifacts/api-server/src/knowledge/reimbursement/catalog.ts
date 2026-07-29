import { readFileSync } from "node:fs";
import { TtlCache } from "../../lib/cache";
import { resolveDataFilePath } from "../../lib/dataPath";
import { normalizeRegistrationNumber } from "../dispensingCategories/model";
import {
  ReimbursementSnapshotSchema,
  type ReimbursementRecord,
  type ReimbursementSnapshot,
  reimbursementRecordsHash,
} from "./model";

export const REIMBURSEMENT_FRESHNESS_MS = 120 * 24 * 60 * 60 * 1_000;

const snapshotCache = new TtlCache<ReimbursementSnapshot>({
  ttlMs: 5 * 60_000,
  maxEntries: 1,
});

export interface ReimbursementCheckResult {
  version: "1.0";
  registrationNumber: string;
  status: "listed" | "requires_package" | "not_listed";
  selected: ReimbursementRecord | null;
  candidates: ReimbursementRecord[];
  summary: string;
  source: {
    title: string;
    url: string;
    checkedAt: string;
    releaseDate: string;
    recordCount: number;
    sha256: string;
    freshness: "current" | "stale" | "incomplete";
    warnings: string[];
  };
}

function loadSnapshot(): ReimbursementSnapshot {
  const cached = snapshotCache.get("snapshot");
  if (cached) return cached;
  const raw = readFileSync(
    resolveDataFilePath("data/reimbursement/ua-nszu-2026-07-17.json"),
    "utf8",
  );
  const snapshot = ReimbursementSnapshotSchema.parse(JSON.parse(raw));
  if (
    reimbursementRecordsHash(snapshot.records) !== snapshot.source.recordsSha256
  ) {
    throw new Error("reimbursement_snapshot_hash_mismatch");
  }
  if (snapshot.records.length !== snapshot.source.recordCount) {
    throw new Error("reimbursement_snapshot_count_mismatch");
  }
  snapshotCache.set("snapshot", snapshot);
  return snapshot;
}

function freshness(
  snapshot: ReimbursementSnapshot,
  now: Date,
): "current" | "stale" | "incomplete" {
  if (!snapshot.source.complete) return "incomplete";
  const checkedAt = new Date(snapshot.source.checkedAt).getTime();
  return Number.isFinite(checkedAt) &&
    now.getTime() - checkedAt <= REIMBURSEMENT_FRESHNESS_MS
    ? "current"
    : "stale";
}

export function checkReimbursement(
  registrationNumber: string,
  selectedPackageKey?: string | null,
  options: { snapshot?: ReimbursementSnapshot; now?: Date } = {},
): ReimbursementCheckResult {
  const normalizedRegistration =
    normalizeRegistrationNumber(registrationNumber);
  if (!/^UA\/\d+\/\d+\/\d+$/u.test(normalizedRegistration)) {
    throw new Error("invalid_registration_number");
  }
  const snapshot = options.snapshot ?? loadSnapshot();
  const candidates = snapshot.records.filter(
    (record) => record.registrationNumber === normalizedRegistration,
  );
  const selected = selectedPackageKey
    ? (candidates.find((record) => record.packageKey === selectedPackageKey) ??
      null)
    : candidates.length === 1
      ? (candidates[0] ?? null)
      : null;
  const status = selected
    ? ("listed" as const)
    : candidates.length
      ? ("requires_package" as const)
      : ("not_listed" as const);
  const summary =
    status === "listed"
      ? `Упаковка включена до програми «Доступні ліки». Доплата за упаковку: ${selected?.copayUah} грн.`
      : status === "requires_package"
        ? `За реєстраційним номером знайдено ${candidates.length} упаковок із різними параметрами або доплатою. Оберіть точну упаковку.`
        : "Реєстраційного номера немає у чинному переліку НСЗУ; для цієї реєстрової позиції реімбурсацію не підтверджено.";

  return {
    version: "1.0",
    registrationNumber: normalizedRegistration,
    status,
    selected,
    candidates,
    summary,
    source: {
      title: snapshot.source.title,
      url: snapshot.source.documentUrl,
      checkedAt: snapshot.source.checkedAt,
      releaseDate: snapshot.source.releaseDate,
      recordCount: snapshot.source.recordCount,
      sha256: snapshot.source.sha256,
      freshness: freshness(snapshot, options.now ?? new Date()),
      warnings: snapshot.warnings,
    },
  };
}

export function clearReimbursementCache(): void {
  snapshotCache.clear();
}
