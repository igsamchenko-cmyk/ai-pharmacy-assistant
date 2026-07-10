import {
  buildRegistryProductionSummary,
  buildRegistryMappingPlan,
  commitRegistryProducts,
  commitReviewableImportPlan,
  downloadOfficialRegistrySnapshot,
  parseRegistryFile,
  parseRegistryText,
  summarizeImportPreview,
} from "../knowledge/ingestion";

function argValue(prefix: string): string | null {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
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

async function main(): Promise<void> {
  const file = argValue("--file=") ?? positionalFile();
  const download = process.argv.includes("--download");
  if (!file && !download) {
    console.error("Provide --file=<registry.csv|tsv|json> or --download.");
    process.exit(1);
  }
  const doCommit = process.argv.includes("--commit");
  if (process.argv.includes("--force")) {
    throw new Error("Registry import does not support --force. Resolve approved blockers instead.");
  }
  const productsOnly = process.argv.includes("--products-only");
  const mappingsOnly = process.argv.includes("--mappings-only");
  const products = process.argv.includes("--products") || productsOnly || (!productsOnly && !mappingsOnly);
  const onlyApproved =
    process.argv.includes("--only-approved") ||
    process.argv.includes("--only-approved-mappings");
  const includeTradeNames = !process.argv.includes("--no-trade-names");
  const downloaded = download
    ? await downloadOfficialRegistrySnapshot()
    : null;
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
  if (!doCommit) {
    console.log(JSON.stringify({
      ok: plan.blocked.length === 0,
      dryRun: true,
      mode: {
        products,
        mappings: !productsOnly,
        onlyApprovedMappings: !productsOnly,
      },
      generatedCandidates: registry.generatedCandidates,
      productionSummary,
      approvedPreview: summarizeImportPreview(plan.approvedCandidatesPlan.preview),
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
      message: "Dry-run only. Add --commit --products --only-approved-mappings --require-db to write product snapshots and approved-safe mappings.",
    }, null, 2));
    return;
  }

  if (!productsOnly && !onlyApproved) {
    throw new Error("Registry mapping commit requires --only-approved or --only-approved-mappings.");
  }
  if (plan.blocked.length > 0) {
    throw new Error(`Registry import blocked: ${plan.blocked.join(", ")}`);
  }

  const mappingResult = mappingsOnly || !productsOnly
    ? await commitReviewableImportPlan(plan.approvedCandidatesPlan)
    : null;
  const batchId = mappingResult?.batchId;
  const productResult = products
    ? await commitRegistryProducts(registry.rows, {
        ...(batchId ? { batchId } : {}),
      })
    : null;

  console.log(JSON.stringify({
    ok: true,
    committedMappings: mappingResult?.committedRows ?? 0,
    mappingBatchId: mappingResult?.batchId ?? null,
    products: productResult,
    skippedReviewOnlyRows: plan.reviewOnlyRows.length,
    quarantinedRows: plan.quarantinedRows.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
