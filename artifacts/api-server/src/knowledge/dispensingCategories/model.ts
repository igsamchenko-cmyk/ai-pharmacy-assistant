import { createHash } from "node:crypto";
import { z } from "zod";

export const DISPENSING_CATEGORIES = [
  "otc",
  "prescription",
  "conditional",
  "unknown",
] as const;

export const DispensingCategorySchema = z.enum(DISPENSING_CATEGORIES);
export type DispensingCategory = z.infer<typeof DispensingCategorySchema>;

export const DispensingCategoryRecordSchema = z.object({
  registryProductId: z.string().regex(/^[A-F0-9]{32}$/u),
  registrationNumber: z.string().regex(/^UA\/\d+\/\d+\/\d+$/u),
  category: DispensingCategorySchema,
  conditionsRaw: z.string().max(1_000),
  packageDependent: z.boolean(),
  restrictedSetting: z.boolean(),
  sourceRow: z.number().int().positive().max(250_000),
});

export type DispensingCategoryRecord = z.infer<
  typeof DispensingCategoryRecordSchema
>;

export function dispensingCategoryRecordsHash(
  records: DispensingCategoryRecord[],
): string {
  const canonical = records.map((record) => [
    record.registryProductId,
    record.registrationNumber,
    record.category,
    record.conditionsRaw,
    record.packageDependent,
    record.restrictedSetting,
    record.sourceRow,
  ]);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

const CategoryCountsSchema = z.object({
  otc: z.number().int().min(0),
  prescription: z.number().int().min(0),
  conditional: z.number().int().min(0),
  unknown: z.number().int().min(0),
});

export const DispensingCategorySnapshotSchema = z.object({
  schemaVersion: z.literal("ua-drlz-dispensing-categories-v1"),
  generatedAt: z.string().datetime(),
  source: z.object({
    title: z.string().min(1).max(300),
    publisher: z.string().min(1).max(300),
    datasetUrl: z.string().url(),
    registryUrl: z.string().url(),
    checkedAt: z.string().datetime(),
    encoding: z.enum(["utf-8", "windows-1251"]),
    contentLength: z.number().int().positive().max(100_000_000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    recordsSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    officialRowCount: z.number().int().positive().max(250_000),
    recordCount: z.number().int().positive().max(250_000),
    skippedInvalidIdentityCount: z.number().int().min(0).max(250_000),
    missingConditionsCount: z.number().int().min(0).max(250_000),
    categoryCounts: CategoryCountsSchema,
    complete: z.boolean(),
  }),
  legalBasis: z.object({
    title: z.string().min(1).max(500),
    actNumber: z.literal("330"),
    actDate: z.literal("2026-03-16"),
    revisionDate: z.literal("2026-04-24"),
    effectiveDate: z.literal("2026-04-24"),
    url: z.string().url(),
    listDocumentUrl: z.string().url(),
    otcListPositionCount: z.literal(3418),
  }),
  records: z.array(DispensingCategoryRecordSchema).max(250_000),
  warnings: z.array(z.string().min(1).max(300)).max(100),
});

export type DispensingCategorySnapshot = z.infer<
  typeof DispensingCategorySnapshotSchema
>;

export function normalizeRegistrationNumber(value: string): string {
  return value.toUpperCase().replace(/\s+/gu, "").replace(/\.$/u, "");
}
