import { performance } from "node:perf_hooks";
import { SearchCatalogQueryParams } from "@workspace/api-zod";
import {
  createPostgresRegistryCatalogStore,
  type CatalogSearchInput,
} from "../services/catalogSearchService";

const REPRESENTATIVE_QUERIES = [
  "Цефтріаксон",
  "Амоксиклав",
  "Ібупрофен",
  "Еліквіс",
  "Ксарелто",
  "Метформін",
  "Омепразол",
  "Пантопразол",
  "Дексаметазон",
  "Ондансетрон",
  "Варфарин",
  "Амлодипін",
] as const;

function input(overrides: Record<string, unknown> = {}): CatalogSearchInput {
  return SearchCatalogQueryParams.parse({
    type: "registry_products",
    ...overrides,
  });
}

function positiveIntArg(prefix: string, fallback: number): number {
  const raw = process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
  const value = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Catalog DB smoke received an invalid positive integer.");
  }
  return value;
}

function assertNonProductionDatabase(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("A local test database is required for catalog DB smoke.");
  const parsed = new URL(raw);
  const host = parsed.hostname.toLowerCase();
  const local = new Set(["localhost", "127.0.0.1", "::1"]);
  if (host.includes("render.com") || host.includes("render-postgres")) {
    throw new Error("Catalog DB smoke refuses production database hosts.");
  }
  if (
    !local.has(host) &&
    process.env.ALLOW_REGISTRY_CATALOG_DB_SMOKE_NONLOCAL !== "true"
  ) {
    throw new Error("Catalog DB smoke requires an isolated test database.");
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function safeMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Catalog DB smoke failed.";
  return error.message
    .replace(/postgres(?:ql)?:\/\/[^\s"'\`]+/gi, "[database-url]")
    .replace(/[A-Za-z]:\\[^\s"'\`]+/g, "[path]")
    .replace(/\/(?:opt|tmp|var|home|Users)\/[^\s"'\`]+/g, "[path]");
}

async function main(): Promise<void> {
  assertNonProductionDatabase();
  const expectedProducts = positiveIntArg("--expect-min-products=", 16_000);
  const maxWarmMs = positiveIntArg("--max-warm-ms=", 2_000);
  const store = await createPostgresRegistryCatalogStore();
  const { pool } = await import("@workspace/db");

  try {
    const first = await store.searchProducts(input());
    assert(
      first.catalogTotal >= expectedProducts,
      "Catalog total is below the isolated fixture expectation.",
    );
    assert(first.items.length === 25, "Default browse page is not bounded to 25.");
    assert(first.filteredTotal === first.catalogTotal, "Browse total is inconsistent.");

    const second = await store.searchProducts(input({ page: 2 }));
    assert(second.items.length === 25, "Second browse page is not available.");
    const firstIds = new Set(first.items.map((item) => item.id));
    assert(
      second.items.every((item) => !firstIds.has(item.id)),
      "Adjacent catalog pages contain duplicate registry IDs.",
    );

    const page50 = await store.searchProducts(input({ pageSize: 50 }));
    assert(page50.items.length === 50, "Page size 50 is not honored.");
    assert(
      new Set(page50.items.map((item) => item.id)).size === page50.items.length,
      "Catalog response contains duplicate registry IDs.",
    );

    const representative: Array<{
      query: string;
      total: number;
      firstTradeName: string;
      warmMs: number;
    }> = [];
    for (const query of REPRESENTATIVE_QUERIES) {
      const warmup = await store.searchProducts(input({ q: query }));
      assert(
        warmup.filteredTotal > 0,
        `Representative registry query returned zero rows: ${query}`,
      );
      const started = performance.now();
      const measured = await store.searchProducts(input({ q: query }));
      const warmMs = performance.now() - started;
      assert(
        measured.filteredTotal > 0,
        `Warmed registry query returned zero rows: ${query}`,
      );
      assert(measured.items.length <= 25, "A registry query exceeded its response bound.");
      assert(
        warmMs <= maxWarmMs,
        `Warmed registry query exceeded the latency budget: ${query} ` +
          `(${warmMs.toFixed(1)} ms > ${maxWarmMs} ms).`,
      );
      representative.push({
        query,
        total: measured.filteredTotal,
        firstTradeName: measured.items[0]?.tradeName ?? "",
        warmMs: Number(warmMs.toFixed(1)),
      });
    }

    const sample = first.items.find(
      (item) =>
        item.manufacturers[0]?.name &&
        item.registration.number &&
        item.inn &&
        item.dosageForm,
    );
    assert(sample, "Browse page has no complete registry sample.");

    const manufacturer = await store.searchProducts(
      input({ manufacturer: sample.manufacturers[0].name }),
    );
    assert(manufacturer.filteredTotal > 0, "Manufacturer filter returned zero rows.");

    const registration = await store.searchProducts(
      input({ q: sample.registration.number }),
    );
    assert(
      registration.items.some((item) => item.id === sample.id),
      "Exact registration-number search did not return its product.",
    );

    const inn = await store.searchProducts(input({ q: sample.inn }));
    assert(inn.filteredTotal > 0, "Exact registry INN search returned zero rows.");

    const form = await store.searchProducts(input({ q: sample.dosageForm }));
    assert(form.filteredTotal > 0, "Dosage-form search returned zero rows.");

    const mappedRow = await pool.query<{ trade_name: string }>(
      `SELECT p.trade_name
       FROM knowledge_registry_products p
       JOIN knowledge_ingredient_names n
         ON LOWER(n.name) = LOWER(p.inn)
        AND n.review_status = 'approved'
       ORDER BY p.trade_name
       LIMIT 1`,
    );
    assert(mappedRow.rows[0], "Isolated fixture has no approved registry INN mapping.");
    const mapped = await store.searchProducts(
      input({ q: mappedRow.rows[0].trade_name }),
    );
    assert(
      mapped.items.some((item) => item.mappingStatus === "approved"),
      "Approved product mapping was not exposed as approved.",
    );

    const planResult = await pool.query<{ "QUERY PLAN": unknown }>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
       SELECT p.registry_id
       FROM knowledge_registry_products p
       ORDER BY LOWER(p.trade_name), LOWER(p.form), p.registry_id
       LIMIT 25`,
    );
    const serialized = JSON.stringify({
      catalogTotal: first.catalogTotal,
      page25: first.items.length,
      page50: page50.items.length,
      representative,
      queryPlan: planResult.rows[0]?.["QUERY PLAN"] ?? null,
    });
    assert(serialized.length < 100_000, "Catalog smoke report is unexpectedly large.");
    assert(!/DATABASE_URL|postgres(?:ql)?:\/\/|[A-Za-z]:\\/i.test(serialized), "Catalog smoke output leaks sensitive diagnostics.");

    console.log(
      JSON.stringify(
        {
          ok: true,
          database: "isolated-non-production",
          catalogTotal: first.catalogTotal,
          page25: first.items.length,
          page50: page50.items.length,
          representative,
          queryPlan: planResult.rows[0]?.["QUERY PLAN"] ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exitCode = 1;
});
