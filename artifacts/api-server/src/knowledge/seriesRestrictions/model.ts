import { z } from "zod";

export const SERIES_RESTRICTION_EVENT_TYPES = [
  "temporary_ban",
  "permanent_ban",
  "restore_temporary",
  "restore_permanent",
  "partial_cancellation",
  "supplement",
] as const;

export const SeriesRestrictionEventTypeSchema = z.enum(
  SERIES_RESTRICTION_EVENT_TYPES,
);

export type SeriesRestrictionEventType = z.infer<
  typeof SeriesRestrictionEventTypeSchema
>;

export const SeriesRestrictionRecordSchema = z.object({
  documentDate: z.string().date(),
  documentNumber: z.string().min(1).max(180),
  eventType: SeriesRestrictionEventTypeSchema,
  registrationNumber: z.string().min(1).max(120).nullable(),
  medicineName: z.string().min(1).max(500),
  dosageForm: z.string().max(4_000),
  seriesRaw: z.string().min(1).max(1_000),
  seriesValues: z.array(z.string().min(1).max(160)).max(100),
  allSeries: z.boolean(),
  seriesUnspecified: z.boolean(),
  manufacturer: z.string().max(4_000),
  country: z.string().max(500),
  additionalInfo: z.string().max(8_000),
  sourceOrder: z.number().int().min(0),
});

export type SeriesRestrictionRecord = z.infer<
  typeof SeriesRestrictionRecordSchema
>;

export const SeriesRestrictionSnapshotSchema = z.object({
  schemaVersion: z.literal("ua-dls-series-restrictions-v1"),
  generatedAt: z.string().datetime(),
  source: z.object({
    title: z.string().min(1).max(300),
    publisher: z.string().min(1).max(300),
    url: z.string().url(),
    coverageStartDate: z.string().date(),
    latestDocumentDate: z.string().date().nullable(),
    complete: z.boolean(),
    recordCount: z.number().int().min(0).max(250_000),
    requestCount: z.number().int().min(1).max(1_000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    documentTypeIds: z
      .array(z.string().regex(/^\d{2}$/u))
      .min(1)
      .max(10),
  }),
  records: z.array(SeriesRestrictionRecordSchema).max(250_000),
  warnings: z.array(z.string().min(1).max(300)).max(100),
});

export type SeriesRestrictionSnapshot = z.infer<
  typeof SeriesRestrictionSnapshotSchema
>;
