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

/** Official registry product snapshot rows. Not used directly by runtime lookup. */
export const knowledgeRegistryProductsTable = pgTable(
  "knowledge_registry_products",
  {
    registryId: text("registry_id").primaryKey(),
    tradeName: text("trade_name").notNull(),
    normalizedTradeName: text("normalized_trade_name").notNull(),
    inn: text("inn").notNull().default(""),
    activeIngredient: text("active_ingredient").notNull().default(""),
    atcCode: text("atc_code"),
    form: text("form").notNull().default(""),
    strength: text("strength").notNull().default(""),
    applicantName: text("applicant_name").notNull().default(""),
    applicantCountry: text("applicant_country").notNull().default(""),
    registrationNumber: text("registration_number").notNull().default(""),
    registrationStartDate: text("registration_start_date")
      .notNull()
      .default(""),
    registrationEndDate: text("registration_end_date").notNull().default(""),
    earlyTermination: text("early_termination").notNull().default(""),
    instructionUrl: text("instruction_url"),
    sourceKey: text("source_key").notNull(),
    reviewStatus: text("review_status").notNull().default("pending"),
    currentStatus: text("current_status").notNull().default("current"),
    sourceSnapshotHash: text("source_snapshot_hash"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    importBatchId: text("import_batch_id"),
    rawHash: text("raw_hash").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("knowledge_registry_products_name_idx").on(t.normalizedTradeName),
    index("knowledge_registry_products_reg_idx").on(t.registrationNumber),
    index("knowledge_registry_products_review_idx").on(t.reviewStatus),
    index("knowledge_registry_products_current_idx").on(t.currentStatus),
    index("knowledge_registry_products_snapshot_idx").on(t.sourceSnapshotHash),
    index("knowledge_registry_products_batch_idx").on(t.importBatchId),
  ],
);

/** Append-only official registry synchronization audit and rollback pointer. */
export const knowledgeRegistrySyncRunsTable = pgTable(
  "knowledge_registry_sync_runs",
  {
    id: text("id").primaryKey(),
    mode: text("mode").notNull(),
    status: text("status").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceHash: text("source_hash").notNull(),
    sourceTimestamp: timestamp("source_timestamp", {
      withTimezone: true,
    }).notNull(),
    officialRows: integer("official_rows").notNull(),
    farmAssistRowsBefore: integer("farmassist_rows_before").notNull(),
    farmAssistRowsAfter: integer("farmassist_rows_after"),
    missingCount: integer("missing_count").notNull(),
    extraCount: integer("extra_count").notNull(),
    changedCount: integer("changed_count").notNull(),
    staleMarkedCount: integer("stale_marked_count").notNull().default(0),
    parityStatus: text("parity_status").notNull(),
    anomalyFailures: text("anomaly_failures").notNull().default("[]"),
    checkpointSourceHash: text("checkpoint_source_hash"),
    checkpointArtifact: text("checkpoint_artifact"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("knowledge_registry_sync_created_idx").on(t.createdAt),
    index("knowledge_registry_sync_hash_idx").on(t.sourceHash),
    index("knowledge_registry_sync_status_idx").on(t.status),
  ],
);

/** Manufacturer names attached to official registry products. */
export const knowledgeRegistryManufacturersTable = pgTable(
  "knowledge_registry_manufacturers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productRegistryId: text("product_registry_id").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    country: text("country").notNull().default(""),
    sourceKey: text("source_key").notNull(),
    currentStatus: text("current_status").notNull().default("current"),
    sourceSnapshotHash: text("source_snapshot_hash"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    importBatchId: text("import_batch_id"),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("knowledge_registry_manufacturer_unique_idx").on(
      t.productRegistryId,
      t.normalizedName,
      t.country,
    ),
    index("knowledge_registry_manufacturer_product_idx").on(
      t.productRegistryId,
    ),
    index("knowledge_registry_manufacturer_name_idx").on(t.normalizedName),
    index("knowledge_registry_manufacturer_current_idx").on(t.currentStatus),
    index("knowledge_registry_manufacturer_snapshot_idx").on(
      t.sourceSnapshotHash,
    ),
  ],
);

export const NATIONAL_LIST_RELEASE_STATUSES = [
  "draft",
  "reviewed",
  "active",
  "superseded",
] as const;
export type NationalListReleaseStatusValue =
  (typeof NATIONAL_LIST_RELEASE_STATUSES)[number];

export const NATIONAL_LIST_MATCH_STATUSES = [
  "exact",
  "ingredient_only",
  "uncertain",
  "not_listed",
  "not_applicable",
] as const;
export type NationalListMatchStatusValue =
  (typeof NATIONAL_LIST_MATCH_STATUSES)[number];

/** Immutable metadata for one official National Medicines List publication. */
export const nationalListReleasesTable = pgTable(
  "national_list_releases",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    actNumber: text("act_number").notNull(),
    actDate: text("act_date").notNull(),
    revisionDate: text("revision_date").notNull(),
    effectiveDate: text("effective_date").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceDomain: text("source_domain").notNull(),
    sourceFormat: text("source_format").notNull(),
    documentHash: text("document_hash").notNull(),
    parserVersion: text("parser_version").notNull(),
    rawCount: integer("raw_count").notNull(),
    parsedCount: integer("parsed_count").notNull(),
    validCount: integer("valid_count").notNull(),
    invalidCount: integer("invalid_count").notNull(),
    provenanceCoverage: integer("provenance_coverage").notNull(),
    status: text("status").notNull().default("draft"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("national_list_release_hash_idx").on(t.documentHash),
    index("national_list_release_status_idx").on(t.status),
    index("national_list_release_revision_idx").on(t.revisionDate),
  ],
);

/** Structured facts parsed from an official, versioned release. */
export const nationalListEntriesTable = pgTable(
  "national_list_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    releaseId: text("release_id").notNull(),
    stableKey: text("stable_key").notNull(),
    officialNameUa: text("official_name_ua").notNull(),
    officialNameEn: text("official_name_en").notNull(),
    compositionSignature: text("composition_signature").notNull(),
    ingredientsJson: text("ingredients_json").notNull(),
    dosageFormsJson: text("dosage_forms_json").notNull(),
    routesJson: text("routes_json").notNull(),
    strengthsJson: text("strengths_json").notNull(),
    section: text("section").notNull(),
    category: text("category").notNull(),
    restrictions: text("restrictions").notNull().default(""),
    sourceUrl: text("source_url").notNull(),
    sourceHash: text("source_hash").notNull(),
    sourceLocator: text("source_locator").notNull(),
    reviewStatus: text("review_status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("national_list_entry_release_key_idx").on(
      t.releaseId,
      t.stableKey,
    ),
    index("national_list_entry_signature_idx").on(
      t.releaseId,
      t.compositionSignature,
    ),
    index("national_list_entry_review_idx").on(t.releaseId, t.reviewStatus),
  ],
);

/** Versioned resolver cache; never treated as a clinical recommendation. */
export const nationalListMatchResultsTable = pgTable(
  "national_list_match_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    releaseId: text("release_id").notNull(),
    productRegistryId: text("product_registry_id").notNull(),
    entryStableKey: text("entry_stable_key"),
    status: text("status").notNull(),
    reason: text("reason").notNull(),
    ingredientMatch: text("ingredient_match").notNull(),
    formMatch: text("form_match").notNull(),
    routeMatch: text("route_match").notNull(),
    strengthMatch: text("strength_match").notNull(),
    resolverVersion: text("resolver_version").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("national_list_match_release_product_idx").on(
      t.releaseId,
      t.productRegistryId,
    ),
    index("national_list_match_status_idx").on(t.releaseId, t.status),
    index("national_list_match_entry_idx").on(t.releaseId, t.entryStableKey),
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
export type KnowledgeIngredient = typeof knowledgeIngredientsTable.$inferSelect;

export const insertKnowledgeIngredientNameSchema = createInsertSchema(
  knowledgeIngredientNamesTable,
).omit({ id: true });
export type InsertKnowledgeIngredientName = z.infer<
  typeof insertKnowledgeIngredientNameSchema
>;
export type KnowledgeIngredientName =
  typeof knowledgeIngredientNamesTable.$inferSelect;

export const insertKnowledgeRegistryProductSchema = createInsertSchema(
  knowledgeRegistryProductsTable,
).omit({ importedAt: true, updatedAt: true });
export type InsertKnowledgeRegistryProduct = z.infer<
  typeof insertKnowledgeRegistryProductSchema
>;
export type KnowledgeRegistryProduct =
  typeof knowledgeRegistryProductsTable.$inferSelect;

export const insertKnowledgeRegistryManufacturerSchema = createInsertSchema(
  knowledgeRegistryManufacturersTable,
).omit({ id: true, importedAt: true });
export type InsertKnowledgeRegistryManufacturer = z.infer<
  typeof insertKnowledgeRegistryManufacturerSchema
>;
export type KnowledgeRegistryManufacturer =
  typeof knowledgeRegistryManufacturersTable.$inferSelect;

export type NationalListRelease = typeof nationalListReleasesTable.$inferSelect;
export type NationalListEntry = typeof nationalListEntriesTable.$inferSelect;
export type NationalListMatchResult =
  typeof nationalListMatchResultsTable.$inferSelect;

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
