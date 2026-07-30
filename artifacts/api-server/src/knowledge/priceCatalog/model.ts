import { createHash } from "node:crypto";
import { z } from "zod";

const money = z.string().regex(/^\d+(?:\.\d{1,3})?$/u);

export const PriceCatalogRecordSchema = z.object({
  catalogId: z.string().regex(/^UA-\d{9}-\d{9}-\d{9}$/u),
  registrationNumber: z.string().min(1).max(100),
  inn: z.string().max(20_000),
  tradeName: z.string().min(1).max(5_000),
  dosageForm: z.string().max(5_000),
  strength: z.string().max(20_000),
  packageDescription: z.string().max(5_000),
  manufacturer: z.string().max(20_000),
  registrationHolder: z.string().max(20_000),
  atcCode: z.string().max(100),
  registrationExpiresAt: z.string().max(100),
  declaredPriceUah: money.nullable(),
  maximumRetailPriceUah: money.nullable(),
  category: z.string().max(500),
  originalMedicine: z.boolean().nullable(),
  exchangeRate: z.string().max(300),
  declarationOrder: z.string().max(500),
  sourceRow: z.number().int().min(6).max(250_000),
});

export type PriceCatalogRecord = z.infer<typeof PriceCatalogRecordSchema>;

export function canonicalPriceCatalogStrength(value: string): string {
  return normalizeCatalogText(value)
    .split(/\s*;\s*/u)
    .map((variant) =>
      variant
        .split(/\s*\+\s*/u)
        .map(normalizeCatalogText)
        .sort()
        .join(" + "),
    )
    .join(" ; ");
}

export function priceCatalogRecordsHash(records: PriceCatalogRecord[]): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        records.map((record) => [
          record.catalogId,
          record.registrationNumber,
          record.inn,
          record.tradeName,
          record.dosageForm,
          canonicalPriceCatalogStrength(record.strength),
          record.packageDescription,
          record.manufacturer,
          record.registrationHolder,
          record.atcCode,
          record.registrationExpiresAt,
          record.declaredPriceUah,
          record.maximumRetailPriceUah,
          record.category,
          record.originalMedicine,
          record.exchangeRate,
          record.declarationOrder,
          record.sourceRow,
        ]),
      ),
    )
    .digest("hex");
}

export const PriceCatalogSnapshotSchema = z.object({
  schemaVersion: z.literal("ua-moz-price-catalog-v1"),
  generatedAt: z.string().datetime(),
  source: z.object({
    title: z.literal("Національний каталог цін"),
    publisher: z.literal("Міністерство охорони здоров'я України"),
    landingUrl: z.string().url(),
    exportUrl: z.string().url(),
    releaseDate: z.string().date(),
    checkedAt: z.string().datetime(),
    contentLength: z.number().int().positive().max(100_000_000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    recordsSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    officialRowCount: z.number().int().positive().max(250_000),
    recordCount: z.number().int().positive().max(250_000),
    standardRegistrationRecordCount: z.number().int().min(0).max(250_000),
    skippedRowCount: z.number().int().min(0).max(250_000),
    complete: z.boolean(),
  }),
  records: z.array(PriceCatalogRecordSchema).max(250_000),
  warnings: z.array(z.string().min(1).max(300)).max(100),
});

export type PriceCatalogSnapshot = z.infer<typeof PriceCatalogSnapshotSchema>;

export function normalizeCatalogText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function normalizeMoney(value: unknown): string | null {
  const raw = normalizeCatalogText(value).replace(",", ".");
  if (!raw || !/^\d+(?:\.\d{1,3})?$/u.test(raw)) return null;
  return raw;
}
