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
  },
  (t) => [
    uniqueIndex("knowledge_names_normalized_idx").on(t.normalized),
    index("knowledge_names_ingredient_idx").on(t.ingredientInnKey),
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
