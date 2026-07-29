import { createHash } from "node:crypto";
import { z } from "zod";

export const REIMBURSEMENT_SECTIONS = [
  "standard_medicines",
  "insulin",
  "combination_medicines",
] as const;

export const ReimbursementRecordSchema = z.object({
  packageKey: z.string().regex(/^nszu-[a-f0-9]{24}$/u),
  section: z.enum(REIMBURSEMENT_SECTIONS),
  registrationNumber: z.string().regex(/^UA\/\d+\/\d+\/\d+$/u),
  inn: z.string().min(1).max(1_000),
  tradeName: z.string().min(1).max(1_000),
  dosageForm: z.string().min(1).max(1_000),
  strength: z.string().min(1).max(1_000),
  packageQuantity: z.string().min(1).max(300),
  atcCode: z.string().max(100),
  copayUah: z.string().regex(/^\d+(?:\.\d{1,2})?$/u),
  sourcePage: z.number().int().min(3).max(82),
  sourceRow: z.number().int().positive().max(250_000),
});

export type ReimbursementRecord = z.infer<typeof ReimbursementRecordSchema>;

export function reimbursementRecordsHash(
  records: ReimbursementRecord[],
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        records.map((record) => [
          record.packageKey,
          record.section,
          record.registrationNumber,
          record.inn,
          record.tradeName,
          record.dosageForm,
          record.strength,
          record.packageQuantity,
          record.atcCode,
          record.copayUah,
          record.sourcePage,
          record.sourceRow,
        ]),
      ),
    )
    .digest("hex");
}

export const ReimbursementSnapshotSchema = z.object({
  schemaVersion: z.literal("ua-nszu-reimbursement-v1"),
  generatedAt: z.string().datetime(),
  source: z.object({
    title: z.literal("Перелік лікарських засобів, які підлягають реімбурсації"),
    publisher: z.literal("Національна служба здоров'я України"),
    announcementUrl: z.string().url(),
    documentUrl: z.string().url(),
    releaseDate: z.string().date(),
    checkedAt: z.string().datetime(),
    contentLength: z.number().int().positive().max(100_000_000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    recordsSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    pageCount: z.literal(85),
    recordCount: z.number().int().positive().max(10_000),
    sectionCounts: z.object({
      standard_medicines: z.number().int().min(0).max(10_000),
      insulin: z.number().int().min(0).max(10_000),
      combination_medicines: z.number().int().min(0).max(10_000),
    }),
    medicalDevicePositionCount: z.literal(36),
    publishedSummaryPositionCount: z.literal(1038),
    parsedDocumentPositionCount: z.number().int().positive().max(10_000),
    complete: z.boolean(),
  }),
  records: z.array(ReimbursementRecordSchema).max(10_000),
  warnings: z.array(z.string().min(1).max(300)).max(100),
});

export type ReimbursementSnapshot = z.infer<typeof ReimbursementSnapshotSchema>;

export function normalizeReimbursementText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}
