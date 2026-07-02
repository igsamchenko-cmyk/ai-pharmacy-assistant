/**
 * CLI: seed the normalized knowledge tables from the static knowledge base.
 *
 *   pnpm --filter @workspace/api-server run seed:knowledge
 *
 * Runs the import pipeline (validate → snapshot → load) against Postgres.
 * Idempotent: every row is upserted by its natural key, so re-running converges
 * to the same state. Refuses to load if the data-quality check finds errors
 * (pass --force to override). Requires DATABASE_URL.
 */
import {
  db,
  knowledgeSourcesTable,
  knowledgeIngredientsTable,
  knowledgeIngredientNamesTable,
  knowledgeAtcCodesTable,
  knowledgeInteractionRulesTable,
} from "@workspace/db";
import {
  runImportPipeline,
  type KnowledgeSnapshot,
  type SnapshotLoader,
} from "../knowledge";

class PostgresLoader implements SnapshotLoader {
  readonly id = "postgres";

  async load(snapshot: KnowledgeSnapshot): Promise<void> {
    // Single transaction so a mid-run failure never leaves a partial load.
    await db.transaction(async (tx) => {
      // Upsert by natural keys so the seed is idempotent.
      for (const s of snapshot.sources) {
        await tx
          .insert(knowledgeSourcesTable)
          .values(s)
          .onConflictDoUpdate({
            target: knowledgeSourcesTable.key,
            set: {
              label: s.label,
              type: s.type,
              reliability: s.reliability,
              url: s.url ?? null,
              note: s.note ?? "",
            },
          });
      }

      for (const ing of snapshot.ingredients) {
        await tx
          .insert(knowledgeIngredientsTable)
          .values(ing)
          .onConflictDoUpdate({
            target: knowledgeIngredientsTable.innKey,
            set: {
              inn: ing.inn,
              latin: ing.latin ?? "",
              english: ing.english ?? "",
              atcCode: ing.atcCode ?? null,
              groupName: ing.groupName ?? "",
              sourceKey: ing.sourceKey,
              evidenceLevel: ing.evidenceLevel ?? "reference",
            },
          });
      }

      for (const n of snapshot.names) {
        await tx
          .insert(knowledgeIngredientNamesTable)
          .values(n)
          .onConflictDoUpdate({
            target: knowledgeIngredientNamesTable.normalized,
            set: {
              name: n.name,
              kind: n.kind,
              ingredientInnKey: n.ingredientInnKey,
              sourceKey: n.sourceKey,
              evidenceLevel: n.evidenceLevel ?? "reference",
            },
          });
      }

      for (const a of snapshot.atcCodes) {
        await tx
          .insert(knowledgeAtcCodesTable)
          .values(a)
          .onConflictDoUpdate({
            target: knowledgeAtcCodesTable.code,
            set: {
              anatomicalGroup: a.anatomicalGroup,
              therapeuticClass: a.therapeuticClass,
              sourceKey: a.sourceKey,
            },
          });
      }

      for (const r of snapshot.interactionRules) {
        await tx
          .insert(knowledgeInteractionRulesTable)
          .values(r)
          .onConflictDoUpdate({
            target: knowledgeInteractionRulesTable.pairKey,
            set: {
              ingredientA: r.ingredientA,
              ingredientB: r.ingredientB,
              riskLevel: r.riskLevel,
              explanation: r.explanation,
              whatToCheck: r.whatToCheck,
              whenToSeeDoctor: r.whenToSeeDoctor,
              origin: r.origin ?? "curated",
              evidenceLevel: r.evidenceLevel ?? "reference",
              mechanism: r.mechanism ?? null,
              sourceKey: r.sourceKey,
            },
          });
      }
    });
  }
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const result = await runImportPipeline(new PostgresLoader(), { force });

  console.log("=== Seed бази знань ===");
  console.log(`Джерела:            ${result.counts.sources}`);
  console.log(`Діючі речовини:     ${result.counts.ingredients}`);
  console.log(`Назви:              ${result.counts.names}`);
  console.log(`ATC-коди:           ${result.counts.atcCodes}`);
  console.log(`Правила взаємодій:  ${result.counts.interactionRules}`);
  console.log("");

  if (!result.ok) {
    console.log(
      `⚠️  Перевірка якості виявила ${result.quality.errors.length} помилок.`,
    );
    for (const e of result.quality.errors) {
      console.log(`  [${e.code}] ${e.message}`);
    }
  }

  if (result.loaded) {
    console.log("✅ Дані завантажено в базу.");
  } else {
    console.log(
      "❌ Дані НЕ завантажено через помилки якості. Використайте --force, щоб примусово завантажити.",
    );
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Помилка seed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
