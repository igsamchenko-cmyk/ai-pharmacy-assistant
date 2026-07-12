import { performance } from "node:perf_hooks";
import { SearchCatalogQueryParams } from "@workspace/api-zod";
import {
  createPostgresRegistryCatalogStore,
  resetRegistrySearchCachesForTests,
  searchCatalog,
  type CatalogQueryMetric,
  type CatalogSearchInput,
} from "../services/catalogSearchService";

const GROUPED_QUERIES = [
  "Метформін",
  "Омепразол",
  "Амлодипін",
  "Ібупрофен",
  "Цефтріаксон",
] as const;

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

function percentile(values: readonly number[], percentileValue: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1),
  );
  return sorted[index] ?? 0;
}

function timingSummary(values: readonly number[]) {
  return {
    samples: values.length,
    p50Ms: Number(percentile(values, 0.5).toFixed(1)),
    p95Ms: Number(percentile(values, 0.95).toFixed(1)),
    maxMs: Number(Math.max(...values).toFixed(1)),
  };
}

function summarizeQueryPlan(value: unknown) {
  const root = Array.isArray(value) ? value[0] : value;
  if (!root || typeof root !== "object") return null;
  const report = root as Record<string, unknown>;
  const plan =
    report.Plan && typeof report.Plan === "object"
      ? report.Plan as Record<string, unknown>
      : {};
  return {
    planningTimeMs: report["Planning Time"] ?? null,
    executionTimeMs: report["Execution Time"] ?? null,
    rootNodeType: plan["Node Type"] ?? null,
    actualRows: plan["Actual Rows"] ?? null,
    totalCost: plan["Total Cost"] ?? null,
    sharedHitBlocks: plan["Shared Hit Blocks"] ?? null,
    sharedReadBlocks: plan["Shared Read Blocks"] ?? null,
  };
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
  const maxGroupedP95Ms = positiveIntArg("--max-grouped-p95-ms=", 900);
  const queryMetrics: CatalogQueryMetric[] = [];
  const store = await createPostgresRegistryCatalogStore({
    onQuery: (metric) => queryMetrics.push(metric),
  });
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

    const groupedRepresentative: Array<{
      query: string;
      positions: number;
      groups: number;
      coldMs: number;
      coldSqlMs: number;
      backendMs: number;
      coldQueries: number;
      warm: ReturnType<typeof timingSummary>;
      responseBytes: number;
      navigationMaxMs: number;
    }> = [];
    for (const query of GROUPED_QUERIES) {
      resetRegistrySearchCachesForTests();
      const groupedInput = input({ q: query, view: "grouped" });
      const metricStart = queryMetrics.length;
      const coldStarted = performance.now();
      const cold = await searchCatalog(groupedInput, store);
      const coldMs = performance.now() - coldStarted;
      const coldMetrics = queryMetrics.slice(metricStart);
      const coldSqlMs = coldMetrics.length
        ? Math.max(...coldMetrics.map((metric) => metric.finishedAtMs)) -
          Math.min(...coldMetrics.map((metric) => metric.startedAtMs))
        : 0;
      const groups = cold.registryGroups;
      assert(groups, "Grouped search returned no hierarchy: " + query);
      assert(groups.bounded, "Grouped search exceeded its row bound: " + query);
      assert(
        groups.summary.totalRegistryPositions > 0,
        "Grouped search returned zero positions: " + query,
      );
      assert(
        coldMetrics.length <= 4,
        "Grouped search exceeded the SQL query-count budget: " + query,
      );
      const responseBytes = Buffer.byteLength(JSON.stringify(cold), "utf8");
      assert(
        responseBytes <= 150_000,
        "Grouped response exceeded 150 KB: " + query,
      );

      const warmTimings: number[] = [];
      const warmMetricStart = queryMetrics.length;
      for (let sampleIndex = 0; sampleIndex < 10; sampleIndex += 1) {
        const started = performance.now();
        const measured = await searchCatalog(groupedInput, store);
        warmTimings.push(performance.now() - started);
        assert(
          measured.registryGroups?.summary.totalRegistryPositions ===
            groups.summary.totalRegistryPositions,
          "Cached grouped totals changed: " + query,
        );
      }
      assert(
        queryMetrics.length === warmMetricStart,
        "Cached grouped search unexpectedly executed SQL: " + query,
      );
      const warm = timingSummary(warmTimings);
      assert(
        warm.p95Ms <= maxGroupedP95Ms,
        "Grouped p95 exceeded the warm latency budget: " + query +
          " (" + warm.p95Ms + " ms > " + maxGroupedP95Ms + " ms).",
      );
      assert(
        warm.maxMs <= 1_500,
        "A grouped warm query exceeded 1500 ms: " + query,
      );

      const firstGroup = groups.groups.items[0];
      const firstTrade = firstGroup?.tradeNames.items[0];
      assert(firstGroup && firstTrade, "Grouped hierarchy is incomplete: " + query);
      const navigationInputs = [
        input({
          q: query,
          view: "grouped",
          groupPage: Math.min(2, groups.groups.totalPages),
        }),
        input({
          q: query,
          view: "grouped",
          groupKey: firstGroup.key,
          tradePage: Math.min(2, firstGroup.tradeNames.totalPages),
        }),
        input({
          q: query,
          view: "grouped",
          groupKey: firstGroup.key,
          tradeNameKey: firstTrade.key,
          variantPage: 1,
        }),
      ];
      const navigationTimings: number[] = [];
      for (const navigationInput of navigationInputs) {
        const started = performance.now();
        const navigation = await searchCatalog(navigationInput, store);
        navigationTimings.push(performance.now() - started);
        assert(navigation.registryGroups, "Grouped navigation returned no hierarchy.");
        assert(
          Buffer.byteLength(JSON.stringify(navigation), "utf8") <= 150_000,
          "Grouped navigation response exceeded 150 KB.",
        );
      }
      assert(
        queryMetrics.length === warmMetricStart,
        "Grouped navigation unexpectedly executed SQL: " + query,
      );
      const navigationMaxMs = Math.max(...navigationTimings);
      assert(
        navigationMaxMs <= 700,
        "Grouped navigation exceeded 700 ms: " + query,
      );

      groupedRepresentative.push({
        query,
        positions: groups.summary.totalRegistryPositions,
        groups: groups.groups.total,
        coldMs: Number(coldMs.toFixed(1)),
        coldSqlMs: Number(coldSqlMs.toFixed(1)),
        backendMs: Number(Math.max(0, coldMs - coldSqlMs).toFixed(1)),
        coldQueries: coldMetrics.length,
        warm,
        responseBytes,
        navigationMaxMs: Number(navigationMaxMs.toFixed(1)),
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

    const groupedStatement = queryMetrics.find(
      (metric) => metric.label === "registry-grouped-page",
    );
    assert(groupedStatement, "Grouped SQL statement was not observed.");
    await pool.query("BEGIN TRANSACTION READ ONLY");
    let planResult: { rows: Array<{ "QUERY PLAN": unknown }> };
    try {
      planResult = await pool.query<{ "QUERY PLAN": unknown }>(
        "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON, TIMING OFF) " +
          groupedStatement.statement,
        [...groupedStatement.values],
      );
    } finally {
      await pool.query("ROLLBACK");
    }
    const queryPlan = summarizeQueryPlan(
      planResult.rows[0]?.["QUERY PLAN"] ?? null,
    );
    const serialized = JSON.stringify({
      catalogTotal: first.catalogTotal,
      page25: first.items.length,
      page50: page50.items.length,
      representative,
      groupedRepresentative,
      queryPlan,
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
          groupedRepresentative,
          queryPlan,
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
