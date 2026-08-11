import { sql } from "drizzle-orm";
import {
  commitRegistryProducts,
  createDbCommitStore,
  downloadOfficialRegistrySnapshot,
  parseRegistryFile,
  parseRegistryText,
} from "../knowledge/ingestion";
import { isProtectedProductionDatabaseHost } from "../knowledge/productionDatabaseHost";

function argValue(prefix: string): string | null {
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    null
  );
}

function positionalFile(): string | null {
  return process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? null;
}

function positiveIntArg(prefix: string): number | null {
  const value = argValue(prefix);
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function safeMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
        .replace(/[A-Za-z]:\\[^\s"'`]+/g, "[path]")
        .replace(/\/(?:opt|tmp|var|home|Users)\/[^\s"'`]+/g, "[path]")
        .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[database-url]")
    : "Registry product DB smoke failed.";
}

function assertNonProductionDatabaseUrl(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw)
    throw new Error("DATABASE_URL is required for registry product DB smoke.");

  const parsed = new URL(raw);
  const host = parsed.hostname.toLowerCase();
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const explicitlyAllowed =
    process.env.ALLOW_REGISTRY_PRODUCT_DB_SMOKE_NONLOCAL === "true";

  if (isProtectedProductionDatabaseHost(host)) {
    throw new Error(
      "Registry product DB smoke refuses production database hosts.",
    );
  }
  if (!localHosts.has(host) && !explicitlyAllowed) {
    throw new Error(
      "Registry product DB smoke requires a local test database unless non-local smoke is explicitly allowed.",
    );
  }
}

async function main(): Promise<void> {
  assertNonProductionDatabaseUrl();

  const file = argValue("--file=") ?? positionalFile();
  const download = process.argv.includes("--download");
  if (!file && !download) {
    console.error("Provide --file=<registry.csv|tsv|json> or --download.");
    process.exit(1);
  }

  const limit = positiveIntArg("--limit=");
  const expectMinProducts = positiveIntArg("--expect-min-products=");
  const rerun = process.argv.includes("--rerun");
  const includeTradeNames = !process.argv.includes("--no-trade-names");
  const downloaded = download ? await downloadOfficialRegistrySnapshot() : null;
  const registry = downloaded
    ? parseRegistryText(downloaded.text, {
        includeTradeNames,
        snapshot: downloaded.metadata,
      })
    : parseRegistryFile(file as string, { includeTradeNames });
  const rows = limit ? registry.rows.slice(0, limit) : registry.rows;
  if (rows.length === 0) {
    throw new Error("Registry product DB smoke has zero valid rows to commit.");
  }

  const {
    db,
    knowledgeIngredientNamesTable,
    knowledgeRegistryManufacturersTable,
    knowledgeRegistryProductsTable,
  } = await import("@workspace/db");

  const [beforeMappingsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(knowledgeIngredientNamesTable);
  const beforeMappings = Number(beforeMappingsRow?.count ?? 0);
  const store = await createDbCommitStore();
  try {
    const first = await commitRegistryProducts(rows, {
      store,
      batchId: `registry-product-smoke-${Date.now()}`,
    });
    const [afterProductsRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(knowledgeRegistryProductsTable);
    const [afterManufacturersRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(knowledgeRegistryManufacturersTable);
    const [afterMappingsRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(knowledgeIngredientNamesTable);
    const afterProducts = Number(afterProductsRow?.count ?? 0);
    const afterManufacturers = Number(afterManufacturersRow?.count ?? 0);
    const afterMappings = Number(afterMappingsRow?.count ?? 0);
    const persisted =
      first.insertedProducts + first.updatedProducts + first.unchangedProducts;
    const expectedProducts = expectMinProducts ?? rows.length;

    if (persisted === 0) {
      throw new Error(
        "Products-only commit completed with zero persisted rows.",
      );
    }
    if (afterProducts < expectedProducts) {
      throw new Error(
        "Registry product DB smoke persisted fewer product rows than expected.",
      );
    }
    if (afterMappings !== beforeMappings) {
      throw new Error("Registry product import changed runtime mapping rows.");
    }

    const second = rerun
      ? await commitRegistryProducts(rows, {
          store,
          batchId: `registry-product-smoke-rerun-${Date.now()}`,
        })
      : null;
    if (second && (second.insertedProducts > 0 || second.updatedProducts > 0)) {
      throw new Error("Registry product DB smoke rerun was not idempotent.");
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          database: "non-production",
          source: {
            downloaded: Boolean(downloaded),
            fileProvided: Boolean(file),
            limit: limit ?? null,
          },
          rows: {
            raw: registry.rawRows,
            parsed: registry.parsedRows,
            committed: rows.length,
          },
          products: first,
          rerun: second,
          finalCounts: {
            products: afterProducts,
            manufacturers: afterManufacturers,
            runtimeMappings: afterMappings,
          },
          mappingIsolation: {
            beforeRuntimeMappings: beforeMappings,
            afterRuntimeMappings: afterMappings,
            unchanged: afterMappings === beforeMappings,
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
