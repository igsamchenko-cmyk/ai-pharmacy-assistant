import {
  buildRegistryProductionSummary,
  buildRegistryMappingPlan,
  createDbCommitStore,
  commitRegistryProducts,
  commitReviewableImportPlan,
  downloadOfficialRegistrySnapshot,
  parseRegistryFile,
  parseRegistryImportFlags,
  parseRegistryText,
  summarizeImportPreview,
} from "../knowledge/ingestion";
import { normalize } from "../lib/text";

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
        .replace(/[A-Za-z]:\\[^\s"']+/g, "[path]")
        .replace(/\/(?:opt|tmp|var|home|Users)\/[^\s"']+/g, "[path]")
        .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[database-url]")
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

  const flags = parseRegistryImportFlags(process.argv.slice(2));
  const downloaded = download ? await downloadOfficialRegistrySnapshot() : null;
  const registry = downloaded
    ? parseRegistryText(downloaded.text, {
        includeTradeNames: flags.includeTradeNames,
        snapshot: downloaded.metadata,
      })
    : parseRegistryFile(file as string, {
        includeTradeNames: flags.includeTradeNames,
      });
  const plan = buildRegistryMappingPlan(registry);
  const productionSummary = buildRegistryProductionSummary(
    registry,
    plan.stats,
  );
  const productChunkSize = positiveIntEnv(
    "REGISTRY_PRODUCT_IMPORT_CHUNK_SIZE",
    500,
  );
  const mappingChunkSize =
    flags.mappingChunkSize ??
    positiveIntEnv("REGISTRY_MAPPING_IMPORT_CHUNK_SIZE", 250);
  const uniqueApprovedMappings = new Set(
    plan.approvedReviewableRows.map((item) => normalize(item.row.name)),
  ).size;
  const productPlan = {
    plannedProducts: registry.rows.length,
    plannedManufacturers: productionSummary.manufacturers.declaredManufacturers,
    plannedRegistrations: productionSummary.registrations.uniqueNumbers,
    chunkSize: productChunkSize,
    chunkCount: Math.ceil(registry.rows.length / productChunkSize),
  };
  const mappingPlan = {
    plannedApprovedRows: plan.approvedReviewableRows.length,
    uniqueNormalizedMappings: uniqueApprovedMappings,
    chunkSize: mappingChunkSize,
    chunkCount: Math.ceil(uniqueApprovedMappings / mappingChunkSize),
    excludedPending: plan.reviewDistribution.pending,
    excludedNeedsReview: plan.reviewDistribution.needs_review,
    excludedRejected: plan.reviewDistribution.rejected,
    excludedQuarantined: plan.reviewDistribution.quarantined,
    approvedHardConflicts: plan.approvedCandidateConflicts,
  };
  const execution = {
    commitRequested: flags.commit,
    dryRun: !flags.commit,
    productsEnabled: flags.products,
    mappingsEnabled: flags.mappings,
    requireDb: flags.requireDb,
    parsedRows: registry.parsedRows,
    validRows: productionSummary.rows.validProducts,
    productPlan,
    mappingPlan,
  };

  if (!flags.commit) {
    console.log(
      JSON.stringify(
        {
          ok: plan.blocked.length === 0,
          ...execution,
          dryRun: true,
          mode: {
            products: flags.products,
            mappings: flags.mappings,
            onlyApprovedMappings: flags.onlyApprovedMappings,
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

  if (plan.blocked.length > 0) {
    throw new Error(`Registry import blocked: ${plan.blocked.join(", ")}`);
  }

  const store = await createDbCommitStore();
  try {
    const batchId = `registry-import-${new Date().toISOString()}`;
    const productResult = flags.products
      ? await commitRegistryProducts(registry.rows, {
          store,
          batchId,
        })
      : null;
    const mappingResult = flags.mappings
      ? await commitReviewableImportPlan(plan.approvedCandidatesPlan, {
          store,
          batchId,
          approvedOnly: true,
          chunkSize: mappingChunkSize,
          onProgress(progress) {
            console.error(
              JSON.stringify({
                type: "registry_mapping_commit_progress",
                ...progress,
              }),
            );
          },
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
          mappings: mappingResult,
          products: productResult,
          excludedMappings: {
            pending: plan.reviewDistribution.pending,
            needsReview: plan.reviewDistribution.needs_review,
            rejected: plan.reviewDistribution.rejected,
            quarantined: plan.reviewDistribution.quarantined,
          },
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
