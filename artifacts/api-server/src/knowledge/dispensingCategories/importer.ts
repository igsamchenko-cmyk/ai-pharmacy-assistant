import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  OFFICIAL_UKRAINE_REGISTRY_CSV_URL,
  decodeRegistryBuffer,
} from "../ingestion/registry";
import { parseCsv } from "../import/csv";
import {
  DispensingCategorySnapshotSchema,
  type DispensingCategory,
  type DispensingCategoryRecord,
  type DispensingCategorySnapshot,
  dispensingCategoryRecordsHash,
  normalizeRegistrationNumber,
} from "./model";

export const DISPENSING_CATEGORY_DATASET_URL =
  "https://data.gov.ua/dataset/fded13b8-4e2c-4c48-bf14-65d0e3106463";
export const DISPENSING_CATEGORY_LEGAL_BASIS_URL =
  "https://zakon.rada.gov.ua/laws/show/z0423-26#Text";
export const DISPENSING_CATEGORY_LIST_DOCUMENT_URL =
  "https://zakon.rada.gov.ua/laws/file/text/136/f554130n25.docx";

const REQUIRED_HEADERS = [
  "ID",
  "Умови відпуску",
  "Номер Реєстраційного посвідчення",
] as const;

function normalizeHeader(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("uk-UA")
    .replace(/[\s\-_.:/\\()№"']/gu, "");
}

function normalizeConditions(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[–—]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("uk-UA");
}

export function classifyDispensingConditions(value: string): {
  category: DispensingCategory;
  packageDependent: boolean;
  restrictedSetting: boolean;
} {
  const normalized = normalizeConditions(value);
  const hasOtc = normalized.includes("без рецепта");
  const hasPrescription = normalized.includes("за рецептом");
  const restrictedSetting =
    normalized.includes("стаціонар") ||
    normalized.includes("спеціалізован") ||
    normalized.includes("спеціальних медичних заклад");
  const packageDependent =
    (hasOtc && hasPrescription) ||
    (hasOtc && normalized.includes("для стаціонар"));

  if (!normalized) {
    return { category: "unknown", packageDependent: false, restrictedSetting };
  }
  if (packageDependent) {
    return { category: "conditional", packageDependent, restrictedSetting };
  }
  if (hasOtc) {
    return { category: "otc", packageDependent: false, restrictedSetting };
  }
  if (hasPrescription || restrictedSetting) {
    return {
      category: "prescription",
      packageDependent: false,
      restrictedSetting,
    };
  }
  return { category: "unknown", packageDependent: false, restrictedSetting };
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function headerIndexes(header: string[]): Record<string, number> {
  const normalized = header.map(normalizeHeader);
  return Object.fromEntries(
    REQUIRED_HEADERS.map((required) => [
      required,
      normalized.indexOf(normalizeHeader(required)),
    ]),
  );
}

export interface ParseDispensingCategoryOptions {
  now?: Date;
  sourceSha256: string;
  contentLength: number;
  encoding: "utf-8" | "windows-1251";
  expectedMinRows?: number;
}

export function parseDispensingCategoryRegistry(
  text: string,
  options: ParseDispensingCategoryOptions,
): DispensingCategorySnapshot {
  const matrix = parseCsv(text, ";");
  if (matrix.length < 2) throw new Error("dispensing_registry_empty");
  const indexes = headerIndexes(matrix[0] ?? []);
  const missingHeaders = REQUIRED_HEADERS.filter(
    (header) => (indexes[header] ?? -1) < 0,
  );
  if (missingHeaders.length) {
    throw new Error(
      `dispensing_registry_headers_missing:${missingHeaders.join(",")}`,
    );
  }

  const records: DispensingCategoryRecord[] = [];
  let skippedInvalidIdentityCount = 0;
  for (let index = 1; index < matrix.length; index += 1) {
    const row = matrix[index] ?? [];
    const registryProductId = (row[indexes.ID] ?? "").trim().toUpperCase();
    const registrationNumber = normalizeRegistrationNumber(
      row[indexes["Номер Реєстраційного посвідчення"]] ?? "",
    );
    if (
      !/^[A-F0-9]{32}$/u.test(registryProductId) ||
      !/^UA\/\d+\/\d+\/\d+$/u.test(registrationNumber)
    ) {
      skippedInvalidIdentityCount += 1;
      continue;
    }
    const conditionsRaw = (row[indexes["Умови відпуску"]] ?? "")
      .replace(/\s+/gu, " ")
      .trim();
    records.push({
      registryProductId,
      registrationNumber,
      ...classifyDispensingConditions(conditionsRaw),
      conditionsRaw,
      sourceRow: index + 1,
    });
  }

  const categoryCounts = {
    otc: records.filter((record) => record.category === "otc").length,
    prescription: records.filter((record) => record.category === "prescription")
      .length,
    conditional: records.filter((record) => record.category === "conditional")
      .length,
    unknown: records.filter((record) => record.category === "unknown").length,
  };
  const expectedMinRows = options.expectedMinRows ?? 10_000;
  const warnings: string[] = [];
  if (matrix.length - 1 < expectedMinRows) {
    warnings.push(`official_row_count_below_expected:${matrix.length - 1}`);
  }
  if (skippedInvalidIdentityCount > 0) {
    warnings.push(`skipped_invalid_identity:${skippedInvalidIdentityCount}`);
  }
  const generatedAt = (options.now ?? new Date()).toISOString();
  const snapshot: DispensingCategorySnapshot = {
    schemaVersion: "ua-drlz-dispensing-categories-v1",
    generatedAt,
    source: {
      title: "Державний реєстр лікарських засобів України",
      publisher: "Міністерство охорони здоров'я України",
      datasetUrl: DISPENSING_CATEGORY_DATASET_URL,
      registryUrl: OFFICIAL_UKRAINE_REGISTRY_CSV_URL,
      checkedAt: generatedAt,
      encoding: options.encoding,
      contentLength: options.contentLength,
      sha256: options.sourceSha256,
      recordsSha256: dispensingCategoryRecordsHash(records),
      officialRowCount: matrix.length - 1,
      recordCount: records.length,
      skippedInvalidIdentityCount,
      missingConditionsCount: categoryCounts.unknown,
      categoryCounts,
      complete: matrix.length - 1 >= expectedMinRows,
    },
    legalBasis: {
      title:
        "Перелік лікарських засобів, дозволених до застосування в Україні, які відпускаються без рецептів",
      actNumber: "330",
      actDate: "2026-03-16",
      revisionDate: "2026-04-24",
      effectiveDate: "2026-04-24",
      url: DISPENSING_CATEGORY_LEGAL_BASIS_URL,
      listDocumentUrl: DISPENSING_CATEGORY_LIST_DOCUMENT_URL,
      otcListPositionCount: 3418,
    },
    records,
    warnings,
  };
  return DispensingCategorySnapshotSchema.parse(snapshot);
}

export async function importDispensingCategories(
  options: { url?: string; now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<DispensingCategorySnapshot> {
  const url = options.url ?? OFFICIAL_UKRAINE_REGISTRY_CSV_URL;
  const response = await (options.fetchImpl ?? fetch)(url);
  if (!response.ok) {
    throw new Error(`dispensing_registry_download_failed:${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const decoded = decodeRegistryBuffer(bytes);
  return parseDispensingCategoryRegistry(decoded.text, {
    now: options.now,
    sourceSha256: sha256(bytes),
    contentLength: bytes.length,
    encoding: decoded.encoding as "utf-8" | "windows-1251",
  });
}

export async function writeDispensingCategorySnapshot(
  outputPath: string,
  options: { url?: string; now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<DispensingCategorySnapshot> {
  const snapshot = await importDispensingCategories(options);
  if (!snapshot.source.complete) {
    throw new Error("dispensing_registry_snapshot_incomplete");
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}
