import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { SearchCatalogQueryParams } from "@workspace/api-zod";
import { normalizeQuery } from "../knowledge/dictionary";
import {
  assertCatalogSmokeHasNoIdleTransactions,
  authorizeCatalogProfileDatabase,
  closeCatalogSmokePool,
  configureCatalogSmokeReadOnlySession,
  createReadOnlyCatalogExecutor,
  verifyCatalogSmokeReadOnlySession,
  type QueryExecutor,
} from "../knowledge/registryProductionSearchSmoke";
import { normalize } from "../lib/text";
import { groupRegistryProducts } from "../services/catalogGrouping";
import {
  createPostgresRegistryCatalogStore,
  resetRegistrySearchCachesForTests,
  searchCatalog,
  type CatalogQueryMetric,
} from "../services/catalogSearchService";

const BROAD_QUERIES = [
  "Цефтріаксон",
  "Амлодипін",
  "Метформін",
  "Омепразол",
  "Ібупрофен",
] as const;
const EXACT_REGISTRATION = "UA/20900/01/01";
const SAMPLE_COUNT = 10;
const REPORT_LIMIT_BYTES = 512_000;

interface PoolClientLike {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  release(): void;
}

interface PoolLike {
  connect(): Promise<PoolClientLike>;
  end(): Promise<void>;
}

interface PipelineSample {
  connectionAcquireMs: number;
  normalizationMs: number;
  sqlMs: number;
  groupingMs: number;
  serializationMs: number;
  totalMs: number;
  queryCount: number;
  resultCount: number;
  responseBytes: number;
}

interface PlanNodeSummary {
  nodeType: string;
  relation: string | null;
  index: string | null;
  actualRows: number;
  planRows: number;
  loops: number;
  rowsRemovedByFilter: number;
  sharedHitBlocks: number;
  sharedReadBlocks: number;
}

interface PlanSummary {
  planningMs: number;
  executionMs: number;
  topNode: string;
  totalCost: number;
  actualRows: number;
  planRows: number;
  nodes: PlanNodeSummary[];
  indexes: string[];
  sequentialScans: PlanNodeSummary[];
}

function argValue(prefix: string): string | null {
  return (
    process.argv
      .find((argument) => argument.startsWith(prefix))
      ?.slice(prefix.length) ?? null
  );
}

function percentile(
  values: readonly number[],
  percentileValue: number,
): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1),
  );
  return Number((sorted[index] ?? 0).toFixed(1));
}

function timingSummary(values: readonly number[]) {
  return {
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    maxMs: Number(Math.max(...values, 0).toFixed(1)),
  };
}

function phaseSummary(samples: readonly PipelineSample[]) {
  const phase = (key: keyof PipelineSample) =>
    timingSummary(samples.map((sample) => Number(sample[key])));
  return {
    connectionAcquire: phase("connectionAcquireMs"),
    normalization: phase("normalizationMs"),
    sql: phase("sqlMs"),
    grouping: phase("groupingMs"),
    serialization: phase("serializationMs"),
    total: phase("totalMs"),
  };
}

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function summarizeExplainPlan(raw: unknown): PlanSummary {
  const root = Array.isArray(raw) ? raw[0] : raw;
  const envelope = (root ?? {}) as Record<string, unknown>;
  const plan = (envelope.Plan ?? {}) as Record<string, unknown>;
  const nodes: PlanNodeSummary[] = [];
  const visit = (node: Record<string, unknown>) => {
    nodes.push({
      nodeType: String(node["Node Type"] ?? "unknown"),
      relation: node["Relation Name"] ? String(node["Relation Name"]) : null,
      index: node["Index Name"] ? String(node["Index Name"]) : null,
      actualRows: numeric(node["Actual Rows"]),
      planRows: numeric(node["Plan Rows"]),
      loops: numeric(node["Actual Loops"]),
      rowsRemovedByFilter: numeric(node["Rows Removed by Filter"]),
      sharedHitBlocks: numeric(node["Shared Hit Blocks"]),
      sharedReadBlocks: numeric(node["Shared Read Blocks"]),
    });
    for (const child of (node.Plans as
      | Array<Record<string, unknown>>
      | undefined) ?? []) {
      visit(child);
    }
  };
  visit(plan);
  return {
    planningMs: numeric(envelope["Planning Time"]),
    executionMs: numeric(envelope["Execution Time"]),
    topNode: String(plan["Node Type"] ?? "unknown"),
    totalCost: numeric(plan["Total Cost"]),
    actualRows: numeric(plan["Actual Rows"]),
    planRows: numeric(plan["Plan Rows"]),
    nodes,
    indexes: [
      ...new Set(
        nodes
          .map((node) => node.index)
          .filter((value): value is string => Boolean(value)),
      ),
    ],
    sequentialScans: nodes.filter((node) => node.nodeType === "Seq Scan"),
  };
}

function buildInput(query: string, exact: boolean) {
  return SearchCatalogQueryParams.parse({
    q: query,
    type: "registry_products",
    ...(exact ? {} : { view: "flat" }),
    page: 1,
    pageSize: 25,
  });
}

async function acquireReadOnlyClient(pool: PoolLike) {
  const started = performance.now();
  const client = await pool.connect();
  return { client, acquireMs: performance.now() - started };
}

async function runSample(
  pool: PoolLike,
  query: string,
  exact: boolean,
): Promise<{ sample: PipelineSample; metrics: CatalogQueryMetric[] }> {
  const totalStarted = performance.now();
  const { client, acquireMs } = await acquireReadOnlyClient(pool);
  const metrics: CatalogQueryMetric[] = [];
  try {
    const executor = createReadOnlyCatalogExecutor({
      query: async (text, values) => {
        const result = await client.query(text, values);
        return { rows: result.rows as Array<Record<string, unknown>> };
      },
    });
    const store = await createPostgresRegistryCatalogStore({
      executor,
      onQuery: (metric) => metrics.push(metric),
    });
    const input = buildInput(query, exact);
    const normalizationStarted = performance.now();
    normalize(query);
    normalizeQuery(query);
    const normalizationMs = performance.now() - normalizationStarted;
    let resultCount: number;
    let resultForSerialization: unknown;
    let grouped: unknown = null;
    let groupingMs = 0;
    if (exact) {
      const result = await searchCatalog(input, store);
      resultCount = result.registryProducts.total;
      resultForSerialization = result;
    } else {
      const result = await store.searchProducts(input);
      resultCount = result.filteredTotal;
      resultForSerialization = result;
      const groupingStarted = performance.now();
      grouped = groupRegistryProducts(
        result.items,
        input,
        result.bounded ?? true,
      );
      groupingMs = performance.now() - groupingStarted;
    }
    const sqlMs = metrics.reduce((sum, metric) => sum + metric.durationMs, 0);
    const serializationStarted = performance.now();
    const serialized = JSON.stringify({
      result: resultForSerialization,
      grouped,
    });
    const serializationMs = performance.now() - serializationStarted;
    if (resultCount <= 0) throw new Error("Profile query returned zero rows.");
    return {
      sample: {
        connectionAcquireMs: Number(acquireMs.toFixed(3)),
        normalizationMs: Number(normalizationMs.toFixed(3)),
        sqlMs: Number(sqlMs.toFixed(3)),
        groupingMs: Number(groupingMs.toFixed(3)),
        serializationMs: Number(serializationMs.toFixed(3)),
        totalMs: Number((performance.now() - totalStarted).toFixed(3)),
        queryCount: metrics.length,
        resultCount,
        responseBytes: Buffer.byteLength(serialized, "utf8"),
      },
      metrics,
    };
  } finally {
    client.release();
  }
}

async function explainMetric(
  executor: QueryExecutor,
  metric: CatalogQueryMetric | undefined,
): Promise<PlanSummary | null> {
  if (!metric) return null;
  const result = await executor.query(
    "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON, TIMING OFF) " + metric.statement,
    [...metric.values],
  );
  return summarizeExplainPlan(result.rows[0]?.["QUERY PLAN"] ?? null);
}

async function profileQuery(pool: PoolLike, query: string, exact: boolean) {
  resetRegistrySearchCachesForTests();
  const warmup = await runSample(pool, query, exact);
  const samples: PipelineSample[] = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    samples.push((await runSample(pool, query, exact)).sample);
  }
  const { client } = await acquireReadOnlyClient(pool);
  try {
    const executor = createReadOnlyCatalogExecutor({
      query: async (text, values) => {
        const result = await client.query(text, values);
        return { rows: result.rows as Array<Record<string, unknown>> };
      },
    });
    return {
      query,
      kind: exact ? "exact" : "broad",
      samples: SAMPLE_COUNT,
      timings: phaseSummary(samples),
      resultCount: samples[0]?.resultCount ?? 0,
      queryCount: timingSummary(samples.map((sample) => sample.queryCount)),
      responseBytes: Math.max(...samples.map((sample) => sample.responseBytes)),
      explain: {
        count: await explainMetric(
          executor,
          warmup.metrics.find(
            (metric) => metric.label === "registry-flat-count",
          ),
        ),
        page: await explainMetric(
          executor,
          warmup.metrics.find(
            (metric) => metric.label === "registry-flat-page",
          ),
        ),
        exact: await explainMetric(
          executor,
          warmup.metrics.find(
            (metric) => metric.label === "registry-exact-product",
          ),
        ),
      },
    };
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  authorizeCatalogProfileDatabase(process.env.DATABASE_URL, process.env);
  configureCatalogSmokeReadOnlySession(process.env);
  const confirmedSha = process.env.CONFIRM_REGISTRY_SNAPSHOT_SHA!.toLowerCase();
  const outputPath = argValue("--output=");
  if (!outputPath) throw new Error("Registry profile output path is required.");
  const { pool: importedPool } = await import("@workspace/db");
  const pool = importedPool as unknown as PoolLike;
  const { client, acquireMs } = await acquireReadOnlyClient(pool);
  let initialClientReleased = false;
  let executor: QueryExecutor;
  try {
    executor = createReadOnlyCatalogExecutor({
      query: async (text, values) => {
        const result = await client.query(text, values);
        return { rows: result.rows as Array<Record<string, unknown>> };
      },
    });
    await verifyCatalogSmokeReadOnlySession(executor);
    const snapshot = await executor.query(
      `SELECT COUNT(*) FILTER (WHERE review_status <> 'stale')::int AS current_rows,
              COUNT(*) FILTER (WHERE review_status = 'stale')::int AS stale_rows,
              COUNT(DISTINCT source_snapshot_hash)
                FILTER (WHERE review_status <> 'stale')::int AS snapshot_hashes,
              MIN(source_snapshot_hash)
                FILTER (WHERE review_status <> 'stale') AS min_hash,
              MAX(source_snapshot_hash)
                FILTER (WHERE review_status <> 'stale') AS max_hash
         FROM knowledge_registry_products`,
    );
    const row = snapshot.rows[0] ?? {};
    if (
      Number(row.current_rows) !== 16_533 ||
      Number(row.snapshot_hashes) !== 1 ||
      row.min_hash !== confirmedSha ||
      row.max_hash !== confirmedSha
    ) {
      throw new Error("Production profile snapshot gate failed.");
    }
    const exactTradeResult = await executor.query(
      `SELECT MIN(trade_name) AS trade_name
         FROM knowledge_registry_products
        WHERE review_status <> 'stale'
        GROUP BY normalized_trade_name
       HAVING COUNT(*) = 1
        ORDER BY MIN(trade_name)
        LIMIT 1`,
    );
    const exactTrade = String(exactTradeResult.rows[0]?.trade_name ?? "");
    if (!exactTrade)
      throw new Error("No unique exact trade name is available.");
    const extensions = await executor.query(
      `SELECT extname
         FROM pg_extension
        WHERE extname = ANY($1::text[])
        ORDER BY extname`,
      [["pg_trgm", "hypopg"]],
    );
    const indexes = await executor.query(
      `SELECT tablename, indexname, indexdef
         FROM pg_indexes
        WHERE tablename = ANY($1::text[])
        ORDER BY tablename, indexname`,
      [
        [
          "knowledge_registry_products",
          "knowledge_registry_manufacturers",
          "knowledge_ingredient_names",
          "national_list_match_results",
          "national_list_entries",
        ],
      ],
    );
    const statistics = await executor.query(
      `SELECT relname, n_live_tup::bigint AS live_rows,
              n_dead_tup::bigint AS dead_rows,
              last_analyze::text, last_autoanalyze::text
         FROM pg_stat_user_tables
        WHERE relname = ANY($1::text[])
        ORDER BY relname`,
      [
        [
          "knowledge_registry_products",
          "knowledge_registry_manufacturers",
          "knowledge_ingredient_names",
          "national_list_match_results",
          "national_list_entries",
        ],
      ],
    );
    client.release();
    initialClientReleased = true;
    const profiles = [];
    for (const query of BROAD_QUERIES) {
      profiles.push(await profileQuery(pool, query, false));
    }
    profiles.push(await profileQuery(pool, EXACT_REGISTRATION, true));
    profiles.push(await profileQuery(pool, exactTrade, true));
    const { client: idleClient } = await acquireReadOnlyClient(pool);
    let idleTransactions: number;
    try {
      const idleExecutor = createReadOnlyCatalogExecutor({
        query: async (text, values) => {
          const result = await idleClient.query(text, values);
          return { rows: result.rows as Array<Record<string, unknown>> };
        },
      });
      idleTransactions =
        await assertCatalogSmokeHasNoIdleTransactions(idleExecutor);
    } finally {
      idleClient.release();
    }
    const report = {
      schemaVersion: "registry-production-search-profile-v1",
      generatedAt: new Date().toISOString(),
      snapshot: {
        sha256: confirmedSha,
        currentRows: Number(row.current_rows),
        staleRows: Number(row.stale_rows),
      },
      initialConnectionAcquireMs: Number(acquireMs.toFixed(3)),
      exactTradeQuery: exactTrade,
      profiles,
      extensions: extensions.rows,
      indexes: indexes.rows,
      statistics: statistics.rows,
      idleTransactions,
    };
    const serialized = JSON.stringify(report, null, 2) + "\n";
    if (Buffer.byteLength(serialized, "utf8") > REPORT_LIMIT_BYTES) {
      throw new Error("Registry profile report exceeded its bounded size.");
    }
    if (/DATABASE_URL|postgres(?:ql)?:\/\/|[A-Za-z]:\\/i.test(serialized)) {
      throw new Error(
        "Registry profile report contains sensitive diagnostics.",
      );
    }
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized, "utf8");
    const summary = [
      "## Production registry search profile",
      "",
      `- Snapshot: \`${confirmedSha}\``,
      `- Current/stale: ${row.current_rows}/${row.stale_rows}`,
      `- Idle transactions: ${idleTransactions}`,
      "",
      "| Query | Kind | SQL p50/p95 | Total p50/p95 |",
      "| --- | --- | ---: | ---: |",
      ...profiles.map(
        (profile) =>
          `| ${profile.query} | ${profile.kind} | ${profile.timings.sql.p50Ms}/${profile.timings.sql.p95Ms} ms | ${profile.timings.total.p50Ms}/${profile.timings.total.p95Ms} ms |`,
      ),
      "",
    ].join("\n");
    if (process.env.GITHUB_STEP_SUMMARY) {
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, summary, { flag: "a" });
    }
    process.stdout.write(summary);
  } finally {
    if (!initialClientReleased) client.release();
    await closeCatalogSmokePool(pool);
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Registry profile failed.",
  );
  process.exitCode = 1;
});
