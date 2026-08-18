import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAnalogCoverageReport,
  type AnalogCoverageRow,
} from "../knowledge/analogCoverage";
import { priceCatalogCompositionByRegistration } from "../knowledge/priceCatalog/catalog";
import {
  authorizeCatalogSmokeDatabase,
  closeCatalogSmokePool,
  configureCatalogSmokeReadOnlySession,
  createReadOnlyCatalogExecutor,
  verifyCatalogSmokeReadOnlySession,
} from "../knowledge/registryProductionSearchSmoke";

const DEFAULT_REPORT_PATH = fileURLToPath(
  new URL(
    "../../../../artifacts/reports/catalog-analog-coverage-report.json",
    import.meta.url,
  ),
);

interface PoolClientLike {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  release(): void;
}

interface PoolLike {
  connect(): Promise<PoolClientLike>;
  end(): Promise<void>;
}

function argValue(prefix: string): string | null {
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    null
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Measure, for the whole catalog, what the analogs tab will actually resolve.
 *
 * Read-only by construction: it reuses the catalog smoke harness, so the same
 * authorization and read-only session checks apply as to every other script
 * that touches the registry. A local database needs no ceremony, a non-local
 * one needs `ALLOW_REGISTRY_CATALOG_DB_SMOKE_NONLOCAL=true`, and the protected
 * production host stays behind the approved workflow gate — a coverage report
 * is not a reason to widen that door.
 */
async function main(): Promise<void> {
  authorizeCatalogSmokeDatabase(process.env.DATABASE_URL, process.env);
  configureCatalogSmokeReadOnlySession(process.env);
  const { pool: importedPool } = await import("@workspace/db");
  const pool = importedPool as unknown as PoolLike;
  const client = await pool.connect();
  try {
    const executor = createReadOnlyCatalogExecutor({
      query: async (statement, values) => {
        const result = await client.query(statement, values);
        return { rows: result.rows as Array<Record<string, unknown>> };
      },
    });
    await verifyCatalogSmokeReadOnlySession(executor);

    const result = await executor.query(
      `SELECT p.registration_number, p.trade_name, p.inn,
              p.active_ingredient, p.atc_code
         FROM knowledge_registry_products p
        WHERE p.review_status <> 'stale'
        ORDER BY p.normalized_trade_name, p.registration_number`,
    );
    const rows: AnalogCoverageRow[] = result.rows.map((row) => ({
      registrationNumber: text(row.registration_number),
      tradeName: text(row.trade_name),
      inn: text(row.inn),
      activeIngredient: text(row.active_ingredient),
      atcCode: text(row.atc_code),
    }));

    const report = buildAnalogCoverageReport(
      rows,
      priceCatalogCompositionByRegistration(),
    );

    const requestedPath = argValue("--out=");
    if (process.argv.includes("--write")) {
      const outputPath = requestedPath
        ? resolve(requestedPath)
        : DEFAULT_REPORT_PATH;
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    client.release();
    await closeCatalogSmokePool(pool);
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Analog coverage report failed.",
  );
  process.exitCode = 1;
});
