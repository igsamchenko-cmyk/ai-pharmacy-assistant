import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  buildOfficialRegistryAudit,
  compareRegistryParity,
  parseRegistryBuffer,
  type RegistryComparableProduct,
} from "../knowledge/ingestion";
import {
  appendRegistryAuditReconciliation,
  assertRegistryAuditReconciliationSnapshot,
  authorizeRegistryAuditReconciliationDatabase,
} from "../knowledge/registryAuditReconciliation";

const APPLICATION_NAME = "farmassist-registry-audit-reconciliation";

function argValue(prefix: string): string | null {
  return (
    process.argv
      .find((argument) => argument.startsWith(prefix))
      ?.slice(prefix.length) ?? null
  );
}

function safeMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
        .replace(/[A-Za-z]:\\[^\s"']+/g, "[path]")
        .replace(/\/(?:opt|tmp|var|home|Users)\/[^\s"']+/g, "[path]")
        .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[database-url]")
    : "Registry audit reconciliation failed.";
}

function append(path: string | undefined, content: string): void {
  if (path) appendFileSync(path, content, "utf8");
}

interface DatabaseRegistryRow {
  registry_id: string;
  trade_name: string;
  normalized_trade_name: string;
  inn: string;
  active_ingredient: string;
  atc_code: string | null;
  form: string;
  strength: string;
  applicant_name: string;
  applicant_country: string;
  registration_number: string;
  registration_start_date: string;
  registration_end_date: string;
  early_termination: string;
  instruction_url: string | null;
  review_status: string;
  current_status: string;
  source_snapshot_hash: string | null;
  import_batch_id: string | null;
  manufacturers: { name: string; country: string }[] | null;
}

function comparable(row: DatabaseRegistryRow): RegistryComparableProduct {
  return {
    registryId: row.registry_id,
    tradeName: row.trade_name,
    normalizedTradeName: row.normalized_trade_name,
    inn: row.inn,
    activeIngredient: row.active_ingredient,
    atcCode: row.atc_code ?? "",
    form: row.form,
    strength: row.strength,
    applicantName: row.applicant_name,
    applicantCountry: row.applicant_country,
    manufacturers: Array.isArray(row.manufacturers) ? row.manufacturers : [],
    registrationNumber: row.registration_number,
    registrationStartDate: row.registration_start_date,
    registrationEndDate: row.registration_end_date,
    status: "",
    earlyTermination: row.early_termination,
    instructionUrl: row.instruction_url ?? "",
    currentStatus: row.current_status === "stale" ? "stale" : "current",
    sourceSnapshotHash: row.source_snapshot_hash,
    importBatchId: row.import_batch_id,
  };
}

async function main(): Promise<void> {
  const confirmedSha = authorizeRegistryAuditReconciliationDatabase(
    process.env.DATABASE_URL,
    process.env,
  );
  const file = argValue("--file=");
  const sourceUrl = argValue("--source-url=");
  const downloadedAt = argValue("--downloaded-at=");
  const output = argValue("--output=");
  if (!file || !sourceUrl || !downloadedAt) {
    throw new Error(
      "--file, --source-url and --downloaded-at are required before reconciliation.",
    );
  }
  const resolvedFile = resolve(file);
  const registry = parseRegistryBuffer(readFileSync(resolvedFile), {
    includeTradeNames: true,
    fileName: basename(resolvedFile),
    sourceUrl,
    downloadedAt,
  });
  const audit = buildOfficialRegistryAudit(registry);
  if (
    audit.failures.length > 0 ||
    audit.rows.invalid !== 0 ||
    audit.source.sha256 !== confirmedSha
  ) {
    throw new Error("Fresh official source failed the reconciliation gate.");
  }

  process.env.PGAPPNAME = APPLICATION_NAME;
  process.env.PGOPTIONS = [
    "-c statement_timeout=120000",
    "-c lock_timeout=10000",
    "-c idle_in_transaction_session_timeout=15000",
  ].join(" ");
  const { pool } = await import("@workspace/db");
  const client = await pool.connect();
  let transactionOpen = false;
  let clientReleased = false;
  let report: Record<string, unknown> | null = null;
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    transactionOpen = true;
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('farmassist-official-registry-sync'))",
    );
    const result = await client.query<DatabaseRegistryRow>(
      `SELECT p.registry_id, p.trade_name, p.normalized_trade_name, p.inn,
              p.active_ingredient, p.atc_code, p.form, p.strength,
              p.applicant_name, p.applicant_country, p.registration_number,
              p.registration_start_date, p.registration_end_date,
              p.early_termination, p.instruction_url, p.review_status,
              p.current_status, p.source_snapshot_hash, p.import_batch_id,
              COALESCE(
                json_agg(json_build_object('name', m.name, 'country', m.country)
                  ORDER BY lower(m.name), lower(m.country))
                  FILTER (WHERE m.id IS NOT NULL),
                '[]'::json
              ) AS manufacturers
         FROM knowledge_registry_products p
         LEFT JOIN knowledge_registry_manufacturers m
           ON m.product_registry_id = p.registry_id
          AND m.current_status <> 'stale'
        GROUP BY p.registry_id
        ORDER BY p.registry_id`,
    );
    const databaseRows = result.rows.map(comparable);
    const comparison = compareRegistryParity(registry, databaseRows);
    const currentRows = result.rows.filter(
      (row) => row.current_status !== "stale",
    );
    const staleRows = result.rows.length - currentRows.length;
    const searchableRows = result.rows.filter(
      (row) => row.review_status !== "stale",
    ).length;
    const hashes = currentRows
      .map((row) => row.source_snapshot_hash)
      .filter((hash): hash is string => Boolean(hash))
      .sort();
    const uniqueHashes = new Set(hashes);
    const snapshot = {
      officialRows: registry.rows.length,
      currentRows: comparison.farmAssistCurrentRows ?? -1,
      staleRows,
      searchableRows,
      missingRows: comparison.missingOfficialRows ?? -1,
      unintendedCurrentExtras: comparison.unintendedStaleRowsShownCurrent ?? -1,
      changedRows: comparison.changed?.any ?? -1,
      hiddenRows: comparison.officialRowsIncorrectlyMarkedStale ?? -1,
      snapshotHashes: uniqueHashes.size,
      minHash: hashes[0] ?? null,
      maxHash: hashes.at(-1) ?? null,
      exactParity: comparison.exactParity === true,
    };
    assertRegistryAuditReconciliationSnapshot(snapshot, confirmedSha);

    const id = `registry-reconcile-${confirmedSha}-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}`;
    const inserted = await appendRegistryAuditReconciliation(client, {
      id,
      sourceUrl,
      sourceHash: confirmedSha,
      sourceTimestamp: downloadedAt,
      officialRows: snapshot.officialRows,
      currentRows: snapshot.currentRows,
    });
    await client.query("COMMIT");
    transactionOpen = false;
    client.release();
    clientReleased = true;

    const idleResult = await pool.query<{ idle_transactions: number }>(
      `SELECT COUNT(*)::int AS idle_transactions
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND application_name = $1
          AND state = 'idle in transaction'`,
      [APPLICATION_NAME],
    );
    const idleTransactions = Number(
      idleResult.rows[0]?.idle_transactions ?? -1,
    );
    if (idleTransactions !== 0) {
      throw new Error(
        "Registry audit reconciliation left an idle transaction.",
      );
    }
    report = {
      schemaVersion: "registry-audit-reconciliation-v1",
      generatedAt: new Date().toISOString(),
      confirmationPassed: true,
      metadataAppendCompleted: true,
      writeScope: "knowledge_registry_sync_runs insert only",
      productWrites: 0,
      snapshot,
      reconciliation: inserted,
      idleTransactions,
    };
    if (output) {
      const resolvedOutput = resolve(output);
      mkdirSync(dirname(resolvedOutput), { recursive: true });
      writeFileSync(
        resolvedOutput,
        `${JSON.stringify(report, null, 2)}\n`,
        "utf8",
      );
    }
    const summary = [
      "## Production registry audit reconciliation",
      "",
      "- Confirmation gate passed: **true**",
      "- Metadata append completed: **true**",
      `- Snapshot: \`${confirmedSha}\``,
      `- Official/current/stale: ${snapshot.officialRows}/${snapshot.currentRows}/${snapshot.staleRows}`,
      `- Missing/current extras/changed: ${snapshot.missingRows}/${snapshot.unintendedCurrentExtras}/${snapshot.changedRows}`,
      `- Exact parity: **${snapshot.exactParity}**`,
      "- Product/manufacturer writes: **0/0**",
      `- Idle transactions: ${idleTransactions}`,
      "",
    ].join("\n");
    append(process.env.GITHUB_STEP_SUMMARY, summary);
    process.stdout.write(summary);
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original failure.
      }
    }
    if (!clientReleased) {
      client.release();
      clientReleased = true;
    }
    throw error;
  } finally {
    await pool.end();
  }
  if (!report)
    throw new Error("Registry audit reconciliation produced no report.");
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exitCode = 1;
});
