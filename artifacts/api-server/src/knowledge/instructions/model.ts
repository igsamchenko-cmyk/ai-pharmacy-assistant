import { z } from "zod";

export const INSTRUCTION_SECTION_KEYS = [
  "indications",
  "contraindications",
  "adverseReactions",
  "interactions",
  "specialWarnings",
  "pregnancyAndLactation",
  "administration",
  "overdose",
  "storage",
] as const;

export type InstructionSectionKey = (typeof INSTRUCTION_SECTION_KEYS)[number];

export const InstructionStatusSchema = z.enum([
  "available",
  "partial",
  "unavailable",
  "needs_review",
]);

export const InstructionSourceProductSchema = z.object({
  registryProductId: z.string().regex(/^[A-F0-9]{32}$/u),
  registrationNumber: z.string().regex(/^UA\/\d+\/\d+\/\d+$/u),
  tradeName: z.string().min(1).max(300),
  inn: z.string().min(1).max(300),
  activeIngredient: z.string().min(1).max(2_000),
  dosageForm: z.string().min(1).max(2_000),
  strength: z.string().min(1).max(120),
  manufacturer: z.string().min(1).max(1_000),
  manufacturerCountry: z.string().min(1).max(120),
  registrationStartDate: z.string().min(1).max(40),
  registrationEndDate: z.string().min(1).max(40),
  sourceUrl: z.string().url().max(1_000),
});

export type InstructionSourceProduct = z.infer<
  typeof InstructionSourceProductSchema
>;

export const InstructionSourcesSchema = z.object({
  version: z.literal("1.0"),
  dataset: z.object({
    title: z.string().min(1),
    publisher: z.string().min(1),
    url: z.string().url(),
    license: z.string().min(1),
    registryUrl: z.string().url(),
    registrySha256: z.string().regex(/^[a-f0-9]{64}$/u),
    registryCheckedAt: z.string().datetime(),
  }),
  products: z.array(InstructionSourceProductSchema).min(5).max(120),
});

export type InstructionSources = z.infer<typeof InstructionSourcesSchema>;

const nullableSection = z.string().min(1).max(60_000).nullable();

export const InstructionSectionsSchema = z.object({
  indications: nullableSection,
  contraindications: nullableSection,
  adverseReactions: nullableSection,
  interactions: nullableSection,
  specialWarnings: nullableSection,
  pregnancyAndLactation: nullableSection,
  administration: nullableSection,
  overdose: nullableSection,
  storage: nullableSection,
});

export type InstructionSections = z.infer<typeof InstructionSectionsSchema>;

export const InstructionQuoteSchema = z
  .object({
    text: z.string().min(1).max(8_000),
    sectionKey: z.enum(INSTRUCTION_SECTION_KEYS),
    charStart: z.number().int().min(0).max(60_000),
    charEnd: z.number().int().min(1).max(60_000),
  })
  .superRefine((quote, context) => {
    if (quote.charEnd <= quote.charStart) {
      context.addIssue({
        code: "custom",
        message: "Quote end must be greater than its start.",
        path: ["charEnd"],
      });
    }
  });

export type InstructionQuote = z.infer<typeof InstructionQuoteSchema>;

export const AdministrationFactsSchema = z.object({
  reconstitution: InstructionQuoteSchema.nullable(),
  diluents: z.array(InstructionQuoteSchema).max(8),
  incompatibilities: z.array(InstructionQuoteSchema).max(8),
  infusionRate: InstructionQuoteSchema.nullable(),
  stabilityAfterPrep: InstructionQuoteSchema.nullable(),
  renalAdjustment: InstructionQuoteSchema.nullable(),
  hepaticAdjustment: InstructionQuoteSchema.nullable(),
  maxDailyDose: InstructionQuoteSchema.nullable(),
});

export type AdministrationFacts = z.infer<typeof AdministrationFactsSchema>;

export function emptyAdministrationFacts(): AdministrationFacts {
  return {
    reconstitution: null,
    diluents: [],
    incompatibilities: [],
    infusionRate: null,
    stabilityAfterPrep: null,
    renalAdjustment: null,
    hepaticAdjustment: null,
    maxDailyDose: null,
  };
}

export const DrugInstructionSnapshotSchema = z.object({
  version: z.literal("1.0"),
  registryProductId: z.string().regex(/^[A-F0-9]{32}$/u),
  registrationNumber: z.string().regex(/^UA\/\d+\/\d+\/\d+$/u),
  tradeName: z.string().min(1).max(300),
  inn: z.string().min(1).max(300),
  activeIngredient: z.string().min(1).max(2_000),
  dosageForm: z.string().min(1).max(2_000),
  strength: z.string().min(1).max(120),
  manufacturer: z.string().min(1).max(1_000),
  manufacturerCountry: z.string().min(1).max(120),
  registrationStartDate: z.string().min(1).max(40),
  registrationEndDate: z.string().min(1).max(40),
  status: InstructionStatusSchema,
  sections: InstructionSectionsSchema,
  administrationFacts: AdministrationFactsSchema.optional(),
  source: z.object({
    url: z.string().url().max(1_000),
    documentId: z.string().regex(/^[A-F0-9]{32}$/u),
    documentDate: z.string().datetime().nullable(),
    checkedAt: z.string().datetime(),
    documentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    contentLength: z.number().int().positive().max(3_000_000),
    parserVersion: z.enum(["ua-drlz-mht-v1", "ua-drlz-mht-v2"]),
    datasetTitle: z.string().min(1),
    datasetUrl: z.string().url(),
    license: z.string().min(1),
  }),
  provenance: z.object({
    sourceAllowed: z.boolean(),
    registrationMatched: z.boolean(),
    contentLocationMatched: z.boolean(),
    availableSectionCount: z.number().int().min(0).max(9),
    coveragePct: z.number().int().min(0).max(100),
  }),
  warnings: z.array(z.string().regex(/^[a-z0-9:_-]{1,80}$/u)).max(20),
});

export type DrugInstructionSnapshot = z.infer<
  typeof DrugInstructionSnapshotSchema
>;

export const InstructionManifestSchema = z.object({
  version: z.literal("1.0"),
  generatedAt: z.string().datetime(),
  dataset: InstructionSourcesSchema.shape.dataset,
  products: z
    .array(
      z.object({
        registryProductId: z.string().regex(/^[A-F0-9]{32}$/u),
        registrationNumber: z.string().regex(/^UA\/\d+\/\d+\/\d+$/u),
        tradeName: z.string().min(1).max(300),
        status: InstructionStatusSchema,
        documentHash: z.string().regex(/^[a-f0-9]{64}$/u),
        documentDate: z.string().datetime().nullable(),
        snapshotFile: z.string().regex(/^snapshots\/[a-z0-9-]+\.json$/u),
        availableSections: z.array(z.enum(INSTRUCTION_SECTION_KEYS)).max(9),
      }),
    )
    .min(5)
    .max(120),
});

export type InstructionManifest = z.infer<typeof InstructionManifestSchema>;

export function registrationKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/gu, "");
}

export function snapshotFileName(registrationNumber: string): string {
  return `${registrationKey(registrationNumber).toLowerCase()}.json`;
}
