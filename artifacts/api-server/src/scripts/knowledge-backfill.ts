import type { KnowledgeSnapshot } from "../knowledge/import/pipeline";
import {
  DryRunBackfillStore,
  runStaticBackfill,
  type BackfillMutationCounts,
  type BackfillStore,
} from "../knowledge/backfill";

class PostgresBackfillStore implements BackfillStore {
  readonly id = "db";

  async load(snapshot: KnowledgeSnapshot): Promise<BackfillMutationCounts> {
    const dbModule = await import("@workspace/db");
    const {
      db,
      knowledgeSourcesTable,
      knowledgeIngredientsTable,
      knowledgeIngredientNamesTable,
      knowledgeAtcCodesTable,
      knowledgeInteractionRulesTable,
    } = dbModule;

    const [sources, ingredients, names, atcCodes, rules] = await Promise.all([
      db.select().from(knowledgeSourcesTable),
      db.select().from(knowledgeIngredientsTable),
      db.select().from(knowledgeIngredientNamesTable),
      db.select().from(knowledgeAtcCodesTable),
      db.select().from(knowledgeInteractionRulesTable),
    ]);

    const existingSources = new Set(sources.map((row) => row.key));
    const existingIngredients = new Set(ingredients.map((row) => row.innKey));
    const existingAtcCodes = new Set(atcCodes.map((row) => row.code));
    const existingRules = new Set(rules.map((row) => row.pairKey));
    const existingNames = new Map(
      names.map((row) => [row.normalized, row.ingredientInnKey]),
    );

    const mutations: BackfillMutationCounts = {
      inserted: 0,
      updated: 0,
      skipped: 0,
      conflicts: 0,
    };

    const countNaturalKey = (exists: boolean) => {
      if (exists) mutations.updated++;
      else mutations.inserted++;
    };

    await db.transaction(async (tx) => {
      for (const row of snapshot.sources) {
        countNaturalKey(existingSources.has(row.key));
        await tx
          .insert(knowledgeSourcesTable)
          .values(row)
          .onConflictDoUpdate({
            target: knowledgeSourcesTable.key,
            set: {
              label: row.label,
              type: row.type,
              reliability: row.reliability,
              url: row.url ?? null,
              note: row.note ?? "",
            },
          });
      }

      for (const row of snapshot.ingredients) {
        countNaturalKey(existingIngredients.has(row.innKey));
        await tx
          .insert(knowledgeIngredientsTable)
          .values(row)
          .onConflictDoUpdate({
            target: knowledgeIngredientsTable.innKey,
            set: {
              inn: row.inn,
              latin: row.latin ?? "",
              english: row.english ?? "",
              atcCode: row.atcCode ?? null,
              groupName: row.groupName ?? "",
              sourceKey: row.sourceKey,
              evidenceLevel: row.evidenceLevel ?? "reference",
            },
          });
      }

      for (const row of snapshot.names) {
        const existingIngredient = existingNames.get(row.normalized);
        if (existingIngredient && existingIngredient !== row.ingredientInnKey) {
          mutations.conflicts++;
          mutations.skipped++;
          continue;
        }
        countNaturalKey(existingIngredient !== undefined);
        await tx
          .insert(knowledgeIngredientNamesTable)
          .values(row)
          .onConflictDoUpdate({
            target: knowledgeIngredientNamesTable.normalized,
            set: {
              name: row.name,
              kind: row.kind,
              ingredientInnKey: row.ingredientInnKey,
              sourceKey: row.sourceKey,
              evidenceLevel: row.evidenceLevel ?? "reference",
              locale: row.locale ?? "uk",
              confidence: row.confidence ?? "verified",
              confidenceScore: row.confidenceScore ?? 100,
              importBatchId: row.importBatchId ?? null,
            },
          });
      }

      for (const row of snapshot.atcCodes) {
        countNaturalKey(existingAtcCodes.has(row.code));
        await tx
          .insert(knowledgeAtcCodesTable)
          .values(row)
          .onConflictDoUpdate({
            target: knowledgeAtcCodesTable.code,
            set: {
              anatomicalGroup: row.anatomicalGroup,
              therapeuticClass: row.therapeuticClass,
              sourceKey: row.sourceKey,
            },
          });
      }

      for (const row of snapshot.interactionRules) {
        countNaturalKey(existingRules.has(row.pairKey));
        await tx
          .insert(knowledgeInteractionRulesTable)
          .values(row)
          .onConflictDoUpdate({
            target: knowledgeInteractionRulesTable.pairKey,
            set: {
              ingredientA: row.ingredientA,
              ingredientB: row.ingredientB,
              riskLevel: row.riskLevel,
              explanation: row.explanation,
              whatToCheck: row.whatToCheck,
              whenToSeeDoctor: row.whenToSeeDoctor,
              origin: row.origin ?? "curated",
              evidenceLevel: row.evidenceLevel ?? "reference",
              mechanism: row.mechanism ?? null,
              sourceKey: row.sourceKey,
            },
          });
      }
    });

    return mutations;
  }
}

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

async function main(): Promise<void> {
  const requireDb = hasArg("--require-db");
  const force = hasArg("--force");
  const dryRun = hasArg("--dry-run") || !process.env.DATABASE_URL;

  if (requireDb && !process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required when --require-db is set.");
    process.exit(1);
  }

  const store = dryRun ? new DryRunBackfillStore() : new PostgresBackfillStore();
  const report = await runStaticBackfill(store, { force });
  const output = {
    ...report,
    warnings: [
      ...report.warnings,
      ...(dryRun && !process.env.DATABASE_URL
        ? ["DATABASE_URL is not configured; ran dry-run backfill only."]
        : []),
    ],
  };

  console.log(JSON.stringify(output, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
