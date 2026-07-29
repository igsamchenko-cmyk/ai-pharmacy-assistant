import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import readXlsxFile from "read-excel-file/node";
import {
  PriceCatalogRecordSchema,
  PriceCatalogSnapshotSchema,
  type PriceCatalogRecord,
  type PriceCatalogSnapshot,
  normalizeCatalogText,
  normalizeMoney,
  priceCatalogRecordsHash,
} from "./model";

export const PRICE_CATALOG_LANDING_URL =
  "https://moz.gov.ua/uk/nacionalnij-katalog-cin";
export const PRICE_CATALOG_EXPORT_URL =
  "https://ecatalog.moz.gov.ua/api/Medicines/export-in-excel";

const EXPECTED_HEADER = [
  "Унікальний ідентифікатор лікарського засобу, що формується на підставі запису в Державному реєстрі лікарських засобів",
  "Міжнародна непатентована або загальноприйнята назва лікарського засобу",
  "Торговельна назва лікарського засобу",
  "Форма випуску",
  "Дозування",
  "Кількість одиниць лікарського засобу в упаковці",
  "Найменування виробника, країна реєстрації",
  "Найменування власника реєстраційного посвідчення на лікарський засіб або власника дозволу на паралельний імпорт лікарського засобу, країна реєстрації",
  "Код АТХ",
  "Номер реєстраційного посвідчення на лікарський засіб або дозволу на паралельний імпорт лікарського засобу",
  "Дата закінчення строку дії реєстраційного посвідчення або дозволу на паралельний імпорт лікарського засобу",
  "Задекларована ціна на лікарський засіб за упаковку, гривень",
  "Категорія лікарського засобу",
  "Оригінальний (інноваційний) лікарський засіб (так/ні)",
  "Розрахована гранична відпускна (роздрібна) ціна за упаковку лікарського засобу (крім лікарських засобів, які придбаваються та/або вартість яких відшкодовується повністю або частково за рахунок коштів державного та/або місцевих бюджетів), гривень",
  "Офіційний курс гривні до іноземної валюти, встановлений Національним банком",
  "Дата та номер наказу МОЗ про декларування ціни на лікарський засіб",
] as const;

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function originalMedicine(value: unknown): boolean | null {
  const normalized = normalizeCatalogText(value).toLocaleLowerCase("uk-UA");
  if (normalized === "так") return true;
  if (normalized === "ні") return false;
  return null;
}

export interface ParsePriceCatalogOptions {
  now?: Date;
  releaseDate: string;
  sourceSha256: string;
  contentLength: number;
  expectedMinRows?: number;
}

export async function parsePriceCatalogWorkbook(
  bytes: Buffer,
  options: ParsePriceCatalogOptions,
): Promise<PriceCatalogSnapshot> {
  const sheets = await readXlsxFile(bytes);
  const sheet = sheets.find(
    (candidate) => candidate.sheet === "Statistic report",
  );
  if (!sheet) throw new Error("price_catalog_sheet_missing");
  const rows = sheet.data;
  const header = (rows[4] ?? []).map(normalizeCatalogText);
  if (
    header.length !== EXPECTED_HEADER.length ||
    EXPECTED_HEADER.some((value, index) => header[index] !== value)
  ) {
    throw new Error("price_catalog_header_mismatch");
  }

  const records: PriceCatalogRecord[] = [];
  let skippedRowCount = 0;
  for (let index = 5; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const declaredPriceUah = normalizeMoney(row[11]);
    const candidate = {
      catalogId: normalizeCatalogText(row[0]),
      inn: normalizeCatalogText(row[1]),
      tradeName: normalizeCatalogText(row[2]),
      dosageForm: normalizeCatalogText(row[3]),
      strength: normalizeCatalogText(row[4]),
      packageDescription: normalizeCatalogText(row[5]),
      manufacturer: normalizeCatalogText(row[6]),
      registrationHolder: normalizeCatalogText(row[7]),
      atcCode: normalizeCatalogText(row[8]),
      registrationNumber: normalizeCatalogText(row[9]).toUpperCase(),
      registrationExpiresAt: normalizeCatalogText(row[10]),
      declaredPriceUah,
      category: normalizeCatalogText(row[12]),
      originalMedicine: originalMedicine(row[13]),
      maximumRetailPriceUah: normalizeMoney(row[14]),
      exchangeRate: normalizeCatalogText(row[15]),
      declarationOrder: normalizeCatalogText(row[16]),
      sourceRow: index + 1,
    };
    const parsed = PriceCatalogRecordSchema.safeParse(candidate);
    if (!parsed.success) {
      skippedRowCount += 1;
      continue;
    }
    records.push(parsed.data);
  }

  const officialRowCount = Math.max(0, rows.length - 5);
  const expectedMinRows = options.expectedMinRows ?? 10_000;
  const generatedAt = (options.now ?? new Date()).toISOString();
  const duplicateCatalogIds =
    records.length - new Set(records.map((item) => item.catalogId)).size;
  const warnings: string[] = [];
  if (officialRowCount < expectedMinRows) {
    warnings.push(`official_row_count_below_expected:${officialRowCount}`);
  }
  if (skippedRowCount) warnings.push(`skipped_rows:${skippedRowCount}`);
  if (duplicateCatalogIds) {
    warnings.push(`duplicate_catalog_ids:${duplicateCatalogIds}`);
  }
  const complete =
    officialRowCount >= expectedMinRows &&
    skippedRowCount === 0 &&
    duplicateCatalogIds === 0 &&
    records.length === officialRowCount;

  return PriceCatalogSnapshotSchema.parse({
    schemaVersion: "ua-moz-price-catalog-v1",
    generatedAt,
    source: {
      title: "Національний каталог цін",
      publisher: "Міністерство охорони здоров'я України",
      landingUrl: PRICE_CATALOG_LANDING_URL,
      exportUrl: PRICE_CATALOG_EXPORT_URL,
      releaseDate: options.releaseDate,
      checkedAt: generatedAt,
      contentLength: options.contentLength,
      sha256: options.sourceSha256,
      recordsSha256: priceCatalogRecordsHash(records),
      officialRowCount,
      recordCount: records.length,
      standardRegistrationRecordCount: records.filter((record) =>
        /^UA\/\d+\/\d+\/\d+$/u.test(record.registrationNumber),
      ).length,
      skippedRowCount,
      complete,
    },
    records,
    warnings,
  });
}

export async function importPriceCatalog(options: {
  url?: string;
  now?: Date;
  releaseDate: string;
  fetchImpl?: typeof fetch;
}): Promise<PriceCatalogSnapshot> {
  const response = await (options.fetchImpl ?? fetch)(
    options.url ?? PRICE_CATALOG_EXPORT_URL,
  );
  if (!response.ok) {
    throw new Error(`price_catalog_download_failed:${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return parsePriceCatalogWorkbook(bytes, {
    now: options.now,
    releaseDate: options.releaseDate,
    sourceSha256: sha256(bytes),
    contentLength: bytes.length,
  });
}

export async function writePriceCatalogSnapshot(
  outputPath: string,
  options: {
    url?: string;
    now?: Date;
    releaseDate: string;
    fetchImpl?: typeof fetch;
  },
): Promise<PriceCatalogSnapshot> {
  const snapshot = await importPriceCatalog(options);
  if (!snapshot.source.complete) {
    throw new Error("price_catalog_snapshot_incomplete");
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}
