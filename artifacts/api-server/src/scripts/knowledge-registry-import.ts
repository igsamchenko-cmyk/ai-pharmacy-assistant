import {
  buildRegistryProductionSummary,
  buildRegistryMappingPlan,
  createDbCommitStore,
  commitRegistryProducts,
  commitReviewableImportPlan,
  downloadOfficialRegistrySnapshot,
  parseRegistryFile,
  parseRegistryText,
  summarizeImportPreview,
} from "../knowledge/ingestion";

function argValue(prefix: string): string | null {
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    null
  );
}

function positionalFile(): string | null {
  return process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? null;
}

function safeMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
        .replace(/[A-Za-z]:\\[^\s"'`]+/g, "[path]")
        .replace(/\/(?:opt|tmp|var|home|Users)\/[^\s"'`]+/g, "[path]")
        .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[database-url]")
    : "Registry import failed.";
}

function positiveIntEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main(): Promise<void> {
  const file = argValue("--file=") ?? positionalFile();
  const download = process.argv.includes("--download");
  if (!file && !download) {
    console.error("Provide --file=<registry.csv|tsv|json> or --download.");
    process.exit(1);
  }
  const doCommit = process.argv.includes("--commit");
  if (process.argv.includes("--force")) {
    throw new Error(
      "Registry import does not support --force. Resolve approved blockers instead.",
    );
  }
  const requireDb = process.argv.includes("--require-db");
  const productsOnly = process.argv.includes("--products-only");
  const mappingsOnly = process.argv.includes("--mappings-only");
  if (productsOnly && mappingsOnly) {
    throw new Error("Use either --products-only or --mappings-only, not both.");
  }
  if (process.argv.includes("--products") && mappingsOnly) {
    throw new Error("Use either --products or --mappings-only, not both.");
  }
  const products =
    process.argv.includes("--products") ||
    productsOnly ||
    (!productsOnly && !mappingsOnly);
  const mappings = mappingsOnly || !productsOnly;
  const onlyApproved =
    process.argv.includes("--only-approved") ||
    process.argv.includes("--only-approved-mappings");
  const includeTradeNames = !process.argv.includes("--no-trade-names");
  const downloaded = download ? await downloadOfficialRegistrySnapshot() : null;
  const registry = downloaded
    ? parseRegistryText(downloaded.text, {
        includeTradeNames,
        snapshot: downloaded.metadata,
      })
    : parseRegistryFile(file as string, { includeTradeNames });
  const plan = buildRegistryMappingPlan(registry);
  const productionSummary = buildRegistryProductionSummary(
    registry,
    plan.stats,
  );
  const chunkSize = positiveIntEnv("REGISTRY_PRODUCT_IMPORT_CHUNK_SIZE", 500);
  const productPlan = {
    plannedProducts: registry.rows.length,
    plannedManufacturers: productionSummary.manufacturers.declaredManufacturers,
    plannedRegistrations: productionSummary.registrations.uniqueNumbers,
    chunkSize,
    chunkCount: Math.ceil(registry.rows.length / chunkSize),
  };
  const execution = {
    commitRequested: doCommit,
    dryRun: !doCommit,
    productsEnabled: products,
    mappingsEnabled: mappings,
    requireDb,
    parsedRows: registry.parsedRows,
    validRows: productionSummary.rows.validProducts,
    productPlan,
  };
  if (!doCommit) {
    console.log(
      JSON.stringify(
        {
          ok: plan.blocked.length === 0,
          ...execution,
          dryRun: true,
          mode: {
            products,
            mappings,
            onlyApprovedMappings: mappings,
          },
          generatedCandidates: registry.generatedCandidates,
          productionSummary,
          approvedPreview: summarizeImportPreview(
            plan.approvedCandidatesPlan.preview,
          ),
          reviewPreview: summarizeImportPreview(plan.allCandidatesPlan.preview),
          reviewableRows: plan.allCandidatesPlan.reviewable.length,
          approvedRows: plan.approvedReviewableRows.length,
          reviewOnlyRows: plan.reviewOnlyRows.length,
          quarantinedRows: plan.quarantinedRows.length,
          conflictGroups: {
            total: plan.conflictGroups.length,
            top: plan.topConflictGroups,
          },
          blocked: plan.blocked,
          message:
            "Dry-run only. Commit product snapshots first with --products-only --commit --require-db, then approved mappings with --mappings-only --only-approved-mappings --commit --require-db.",
        },
        null,
        2,
      ),
    );
    return;
  }

  if (!requireDb) {
    throw new Error("Registry commit requires --require-db.");
  }
  if (!productsOnly && !onlyApproved) {
    throw new Error(
      "Registry mapping commit requires --only-approved or --only-approved-mappings.",
    );
  }
  if (plan.blocked.length > 0) {
    throw new Error(`Registry import blocked: ${plan.blocked.join(", ")}`);
  }

  const store = await createDbCommitStore();
  try {
    const batchId = `registry-import-${new Date().toISOString()}`;
    const productResult = products
      ? await commitRegistryProducts(registry.rows, {
          store,
          batchId,
        })
      : null;
    const mappingResult = mappings
      ? await commitReviewableImportPlan(plan.approvedCandidatesPlan, {
          store,
          batchId,
        })
      : null;

    console.log(
      JSON.stringify(
        {
          ok: true,
          ...execution,
          dryRun: false,
          committedMappings: mappingResult?.committedRows ?? 0,
          mappingBatchId: mappingResult?.batchId ?? null,
          products: productResult,
          skippedReviewOnlyRows: plan.reviewOnlyRows.length,
          quarantinedRows: plan.quarantinedRows.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await store.close?.();
  }
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
