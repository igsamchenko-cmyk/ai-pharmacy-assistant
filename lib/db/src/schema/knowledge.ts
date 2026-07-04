/**
 * Normalized knowledge-base schema (v0.3).
 *
 * The runtime knowledge engine still serves from pure static TS modules so the
 * business logic stays DB-free and testable. These tables are the *persistent,
 * normalized target* for that knowledge: an import pipeline snapshots the static
 * data into them so it can be audited, versioned and eventually curated in a DB.
 *
 * Design:
 *  - `knowledge_sources` is the provenance registry (natural key `key`).
 *  - `knowledge_ingredients` are canonical ingredients (natural key `inn_key`).
 *  - `knowledge_ingredient_names` are name→ingredient mappings, each with a
 *    provenance source — this is what makes "provenance for every mapping" real.
 *  - `knowledge_atc_codes` classify ATC codes.
 *  - `knowledge_interaction_rules` hold class/ingredient interaction rules with
 *    origin + evidence + mechanism metadata.
 *
 * Foreign keys use natural keys (source `key`, ingredient `inn_key`) so imports
 * are deterministic and idempotent (upsert by natural key).
 */
import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const SOURCE_TYPES = [
  "official",
  "reference",
  "demo",
  "external",
] as const;
export type SourceTypeValue = (typeof SOURCE_TYPES)[number];

export const SOURCE_RELIABILITIES = ["high", "medium", "low"] as const;
export type SourceReliabilityValue = (typeof SOURCE_RELIABILITIES)[number];

export const EVIDENCE_LEVELS = [
  "established",
  "reference",
  "theoretical",
  "demo",
] as const;
export type EvidenceLevelValue = (typeof EVIDENCE_LEVELS)[number];

export const RULE_ORIGINS = ["curated", "generated"] as const;
export type RuleOriginValue = (typeof RULE_ORIGINS)[number];

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevelValue = (typeof RISK_LEVELS)[number];

export const KNOWLEDGE_REVIEW_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "needs_review",
] as const;
export type KnowledgeReviewStatusValue =
  (typeof KNOWLEDGE_REVIEW_STATUSES)[number];

export const KNOWLEDGE_REVIEW_ENTITY_TYPES = [
  "ingredient_name",
  "ingredient",
  "atc",
  "interaction_rule",
  "source",
  "other",
] as const;
export type KnowledgeReviewEntityTypeValue =
  (typeof KNOWLEDGE_REVIEW_ENTITY_TYPES)[number];

export const KNOWLEDGE_REVIEW_ACTIONS = [
  "approved",
  "rejected",
  "marked_needs_review",
  "note_changed",
] as const;
export type KnowledgeReviewActionValue =
  (typeof KNOWLEDGE_REVIEW_ACTIONS)[number];

export const KNOWLEDGE_CONFIDENCE_LEVELS = [
  "low",
  "medium",
  "high",
  "verified",
] as const;
export type KnowledgeConfidenceLevelValue =
  (typeof KNOWLEDGE_CONFIDENCE_LEVELS)[number];

/** Provenance registry — where knowledge comes from. */
export const knowledgeSourcesTable = pgTable("knowledge_sources", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  type: text("type").notNull(),
  reliability: text("reliability").notNull(),
  url: text("url"),
  note: text("note").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Canonical ingredients (INN as the natural key). */
export const knowledgeIngredientsTable = pgTable(
  "knowledge_ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** normalized INN, used as the stable natural key for FKs. */
    innKey: text("inn_key").notNull().unique(),
    inn: text("inn").notNull(),
    latin: text("latin").notNull().default(""),
    english: text("english").notNull().default(""),
    atcCode: text("atc_code"),
    groupName: text("group_name").notNull().default(""),
    sourceKey: text("source_key").notNull(),
    evidenceLevel: text("evidence_level").notNull().default("reference"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("knowledge_ingredients_atc_idx").on(t.atcCode)],
);

/** Name → ingredient mappings, each carrying its own provenance. */
export const knowledgeIngredientNamesTable = pgTable(
  "knowledge_ingredient_names",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** normalized lookup key (unique across the dictionary). */
    normalized: text("normalized").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    ingredientInnKey: text("ingredient_inn_key").notNull(),
    sourceKey: text("source_key").notNull(),
    evidenceLevel: text("evidence_level").notNull().default("reference"),
    locale: text("locale").notNull().default("uk"),
    confidence: text("confidence").notNull().default("verified"),
    confidenceScore: integer("confidence_score").notNull().default(100),
    reviewStatus: text("review_status").notNull().default("approved"),
    conflictFlags: text("conflict_flags").notNull().default(""),
    validationWarnings: text("validation_warnings").notNull().default(""),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    reviewNote: text("review_note"),
    importBatchId: text("import_batch_id"),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("knowledge_names_normalized_idx").on(t.normalized),
    index("knowledge_names_ingredient_idx").on(t.ingredientInnKey),
    index("knowledge_names_review_status_idx").on(t.reviewStatus),
    index("knowledge_names_import_batch_idx").on(t.importBatchId),
  ],
);

/** Append-only audit trail for admin review decisions. */
export const knowledgeReviewAuditLogTable = pgTable(
  "knowledge_review_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull().default("ingredient_name"),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    note: text("note"),
    reason: text("reason"),
    reviewedBy: text("reviewed_by"),
    importBatchId: text("import_batch_id"),
    sourceKey: text("source_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("knowledge_review_audit_entity_idx").on(t.entityType, t.entityId),
    index("knowledge_review_audit_created_idx").on(t.createdAt),
  ],
);

/** ATC code classification. */
export const knowledgeAtcCodesTable = pgTable("knowledge_atc_codes", {
  code: text("code").primaryKey(),
  anatomicalGroup: text("anatomical_group").notNull(),
  therapeuticClass: text("therapeutic_class").notNull(),
  sourceKey: text("source_key").notNull(),
});

/** Interaction rules with origin/evidence/mechanism metadata + provenance. */
export const knowledgeInteractionRulesTable = pgTable(
  "knowledge_interaction_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** sorted unordered pair key, unique. */
    pairKey: text("pair_key").notNull(),
    ingredientA: text("ingredient_a").notNull(),
    ingredientB: text("ingredient_b").notNull(),
    riskLevel: text("risk_level").notNull(),
    explanation: text("explanation").notNull(),
    whatToCheck: text("what_to_check").notNull(),
    whenToSeeDoctor: text("when_to_see_doctor").notNull(),
    origin: text("origin").notNull().default("curated"),
    evidenceLevel: text("evidence_level").notNull().default("reference"),
    mechanism: text("mechanism"),
    sourceKey: text("source_key").notNull(),
  },
  (t) => [uniqueIndex("knowledge_interactions_pair_idx").on(t.pairKey)],
);

export const insertKnowledgeSourceSchema = createInsertSchema(
  knowledgeSourcesTable,
).omit({ updatedAt: true });
export type InsertKnowledgeSource = z.infer<typeof insertKnowledgeSourceSchema>;
export type KnowledgeSource = typeof knowledgeSourcesTable.$inferSelect;

export const insertKnowledgeIngredientSchema = createInsertSchema(
  knowledgeIngredientsTable,
).omit({ id: true, updatedAt: true });
export type InsertKnowledgeIngredient = z.infer<
  typeof insertKnowledgeIngredientSchema
>;
export type KnowledgeIngredient =
  typeof knowledgeIngredientsTable.$inferSelect;

export const insertKnowledgeIngredientNameSchema = createInsertSchema(
  knowledgeIngredientNamesTable,
).omit({ id: true });
export type InsertKnowledgeIngredientName = z.infer<
  typeof insertKnowledgeIngredientNameSchema
>;
export type KnowledgeIngredientName =
  typeof knowledgeIngredientNamesTable.$inferSelect;

export const insertKnowledgeAtcCodeSchema = createInsertSchema(
  knowledgeAtcCodesTable,
);
export type InsertKnowledgeAtcCode = z.infer<
  typeof insertKnowledgeAtcCodeSchema
>;
export type KnowledgeAtcCode = typeof knowledgeAtcCodesTable.$inferSelect;

export const insertKnowledgeInteractionRuleSchema = createInsertSchema(
  knowledgeInteractionRulesTable,
).omit({ id: true });
export type InsertKnowledgeInteractionRule = z.infer<
  typeof insertKnowledgeInteractionRuleSchema
>;
export type KnowledgeInteractionRule =
  typeof knowledgeInteractionRulesTable.$inferSelect;

export const insertKnowledgeReviewAuditLogSchema = createInsertSchema(
  knowledgeReviewAuditLogTable,
).omit({ id: true, createdAt: true });
export type InsertKnowledgeReviewAuditLog = z.infer<
  typeof insertKnowledgeReviewAuditLogSchema
>;
export type KnowledgeReviewAuditLog =
  typeof knowledgeReviewAuditLogTable.$inferSelect;