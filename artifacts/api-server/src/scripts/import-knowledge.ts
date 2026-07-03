/**
 * CLI: import an approved dictionary file into the knowledge DB.
 *
 *   pnpm --filter @workspace/api-server run import:knowledge [file] [--commit] [--force]
 *
 * Safe by default: parses, guards against copyrighted sources, analyzes and
 * derives a review status for every row, then prints the import plan WITHOUT
 * writing anything. Only rows that reach `approved` are eligible to load. Pass
 * `--commit` (requires DATABASE_URL) to upsert approved ingredients + name
 * mappings. Refuses to proceed on blocking problems unless `--force` is given.
 */
import { readFileSync } from "node:fs";
import { normalize } from "../lib/text";
import {
  parseImportCsv,
  parseImportJson,
  analyzeImport,
  liveKnowledgeView,
  deriveReviewStatus,
  findCopyrightedSources,
  readDictionarySampleCsv,
  nameTypeToKind,
  type ImportRow,
  type ParseResult,
} from "../knowledge";

function confidenceScore(confidence: ImportRow["confidence"]): number {
  switch (confidence) {
    case "verified":
      return 100;
    case "high":
      return 85;
    case "medium":
      return 60;
    case "low":
      return 30;
  }
}

function loadFile(path: string): ParseResult {
  const text = readFileSync(path, "utf8");
  return path.toLowerCase().endsWith(".json")
    ? parseImportJson(text)
    : parseImportCsv(text);
}

async function commit(approved: ImportRow[]): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log("❌ --commit потребує DATABASE_URL.");
    process.exit(1);
  }
  const {
    db,
    knowledgeIngredientsTable,
    knowledgeIngredientNamesTable,
  } = await import("@workspace/db");
  const importBatchId = `dictionary-${new Date().toISOString()}`;

  await db.transaction(async (tx) => {
    const seenInn = new Set<string>();
    for (const row of approved) {
      const innKey = normalize(row.canonicalInn);
      if (!seenInn.has(innKey)) {
        seenInn.add(innKey);
        await tx
          .insert(knowledgeIngredientsTable)
          .values({
            innKey,
            inn: row.canonicalInn,
            atcCode: row.atcCode ?? null,
            sourceKey: row.sourceId,
            evidenceLevel: "reference",
          })
          .onConflictDoNothing({ target: knowledgeIngredientsTable.innKey });
      }
      await tx
        .insert(knowledgeIngredientNamesTable)
        .values({
          normalized: normalize(row.name),
          name: row.name,
          kind: nameTypeToKind(row.nameType),
          ingredientInnKey: innKey,
          sourceKey: row.sourceId,
          evidenceLevel: "reference",
          locale: row.locale,
          confidence: row.confidence,
          confidenceScore: confidenceScore(row.confidence),
          reviewStatus: "approved",
          importBatchId,
        })
        .onConflictDoNothing({
          target: knowledgeIngredientNamesTable.normalized,
        });
    }
  });
  console.log(`✅ Завантажено ${approved.length} схвалених назв у базу.`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const doCommit = args.includes("--commit");
  const force = args.includes("--force");
  const file = args.find((a) => !a.startsWith("--"));

  const { rows, errors } = file
    ? loadFile(file)
    : parseImportCsv(readDictionarySampleCsv());
  const view = liveKnowledgeView();
  const preview = analyzeImport(rows, view, errors);

  // Copyright is a hard, non-overridable safety boundary: identify offending
  // rows so they are never selected for loading, even with --force.
  const copyrightRows = new Set(
    findCopyrightedSources(rows).map((v) => v.row - 1),
  );

  // Recompute per-row review status to select approved rows for loading.
  const nameToInn = new Map(view.existingNameToInn);
  const approved: ImportRow[] = [];
  rows.forEach((row, idx) => {
    const nameKey = normalize(row.name);
    const innKey = normalize(row.canonicalInn);
    const prior = nameToInn.get(nameKey);
    const hasConflict = prior !== undefined && prior !== innKey;
    if (prior === undefined) nameToInn.set(nameKey, innKey);
    if (copyrightRows.has(idx)) return; // never load copyrighted rows
    const status = deriveReviewStatus(row, {
      unknownSource: !view.isKnownSource(row.sourceId),
      hasConflict,
    });
    if (status === "approved") approved.push(row);
  });

  console.log("=== Імпорт бази знань ===");
  console.log(`Файл:               ${file ?? "(вбудований зразок)"}`);
  console.log(`Рядків:             ${preview.rowsParsed}`);
  console.log(`Схвалено (approved):${approved.length}`);
  console.log(`На перевірку:       ${preview.reviewDistribution.needs_review}`);
  console.log(`Очікують:           ${preview.reviewDistribution.pending}`);
  console.log(`Відхилено:          ${preview.reviewDistribution.rejected}`);
  console.log("");

  // Copyright violations are a hard boundary that --force cannot override.
  if (copyrightRows.size > 0) {
    console.log(
      `❌ Виявлено ${copyrightRows.size} рядків із захищених авторським правом джерел. Імпорт заборонено (не оминається через --force).`,
    );
    for (const v of findCopyrightedSources(rows)) {
      console.log(`  [copyright] рядок ${v.row}: ${v.message}`);
    }
    process.exit(1);
  }

  if (!preview.wouldSucceed && !force) {
    console.log("❌ Є блокуючі проблеми. Використайте --force, щоб ігнорувати.");
    for (const c of preview.conflicts) console.log(`  [${c.type}] ${c.detail}`);
    process.exit(1);
  }

  if (!doCommit) {
    console.log(
      "ℹ️  Пробний запуск (dry-run). Нічого не записано. Додайте --commit для запису.",
    );
    return;
  }

  await commit(approved);
}

main().catch((err) => {
  console.error("Помилка імпорту:", err instanceof Error ? err.message : err);
  process.exit(1);
});
