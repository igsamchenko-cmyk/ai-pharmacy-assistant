import { readFileSync } from "node:fs";
import { resolveDataFilePath } from "../lib/dataPath";
import {
  activateNationalListRelease,
  commitNationalListSnapshot,
  rollbackNationalListRelease,
  type NationalListSnapshot,
} from "../knowledge/nationalList";
import { SearchCatalogQueryParams } from "@workspace/api-zod";
import {
  createPostgresRegistryCatalogStore,
  resetRegistrySearchCachesForTests,
} from "../services/catalogSearchService";

function assertLocalDatabase(): void {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("National-list DB smoke requires a test database.");
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("National-list DB smoke refuses non-local database hosts.");
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function warmSearchMedianMs(): Promise<number> {
  resetRegistrySearchCachesForTests();
  const durations: number[] = [];
  const store = await createPostgresRegistryCatalogStore({
    onQuery: ({ durationMs }) => durations.push(durationMs),
  });
  const input = SearchCatalogQueryParams.parse({
    q: "ibuprofen",
    type: "registry_products",
    view: "flat",
    page: 1,
    pageSize: 25,
  });
  await store.searchProducts(input);
  const totals: number[] = [];
  for (let iteration = 0; iteration < 15; iteration++) {
    durations.length = 0;
    await store.searchProducts(input);
    totals.push(durations.reduce((sum, value) => sum + value, 0));
  }
  return median(totals);
}

async function main(): Promise<void> {
  assertLocalDatabase();
  const snapshot = JSON.parse(readFileSync(resolveDataFilePath(
    "data/national-list/ua-2025-10-10.json",
    { moduleUrl: import.meta.url },
  ), "utf8")) as NationalListSnapshot;
  const { pool } = await import("@workspace/db");
  try {
    const before = await pool.query<{
      products: number;
      mappings: number;
    }>(`SELECT
      (SELECT COUNT(*)::int FROM knowledge_registry_products) AS products,
      (SELECT COUNT(*)::int FROM knowledge_ingredient_names) AS mappings`);
    const first = await commitNationalListSnapshot(snapshot, pool);
    const second = await commitNationalListSnapshot(snapshot, pool);
    if (first.persistedEntries !== snapshot.counts.valid || second.insertedEntries !== 0) {
      throw new Error("National-list snapshot commit is not idempotent.");
    }
    const reviewed = await pool.query<{ status: string; entries: number }>(
      `SELECT r.status,
         (SELECT COUNT(*)::int FROM national_list_entries e WHERE e.release_id = r.id) AS entries
       FROM national_list_releases r WHERE r.id = $1`,
      [snapshot.releaseId],
    );
    if (reviewed.rows[0]?.status !== "reviewed" ||
      Number(reviewed.rows[0]?.entries ?? 0) !== snapshot.counts.valid) {
      throw new Error("Committed national-list release is not a reviewed immutable snapshot.");
    }
    const baselineWarmMs = await warmSearchMedianMs();
    const activated = await activateNationalListRelease(snapshot, pool);
    const enrichedWarmMs = await warmSearchMedianMs();
    const performanceRegressionPct = baselineWarmMs > 0
      ? ((enrichedWarmMs - baselineWarmMs) / baselineWarmMs) * 100
      : 0;
    if (performanceRegressionPct > 15) {
      throw new Error("National-list warm search regression exceeds 15%.");
    }
    const distribution = await pool.query<{ status: string; count: number }>(
      `SELECT status, COUNT(*)::int AS count
       FROM national_list_match_results
       WHERE release_id = $1
       GROUP BY status ORDER BY status`,
      [snapshot.releaseId],
    );
    if (activated.products !== Number(before.rows[0]?.products ?? 0) ||
      activated.cached !== activated.products) {
      throw new Error("Versioned resolver cache is incomplete.");
    }
    const plan = await pool.query<{ "QUERY PLAN": string }>(
      `EXPLAIN (COSTS OFF)
       SELECT product_registry_id, status
       FROM national_list_match_results
       WHERE release_id = $1
       ORDER BY product_registry_id
       LIMIT 25`,
      [snapshot.releaseId],
    );
    const planText = plan.rows.map((row) => row["QUERY PLAN"]).join("\n");
    if (!/national_list_match_release_product_idx|national_list_match_status_idx/iu.test(planText)) {
      throw new Error("National-list resolver query plan did not use a bounded match index.");
    }
    await rollbackNationalListRelease(snapshot.releaseId, pool);
    const after = await pool.query<{ products: number; mappings: number; active: number }>(
      `SELECT
        (SELECT COUNT(*)::int FROM knowledge_registry_products) AS products,
        (SELECT COUNT(*)::int FROM knowledge_ingredient_names) AS mappings,
        (SELECT COUNT(*)::int FROM national_list_releases WHERE status = 'active') AS active`,
    );
    if (Number(after.rows[0]?.products ?? 0) !== Number(before.rows[0]?.products ?? 0) ||
      Number(after.rows[0]?.mappings ?? 0) !== Number(before.rows[0]?.mappings ?? 0)) {
      throw new Error("National-list lifecycle changed existing registry or mapping rows.");
    }
    console.log(JSON.stringify({
      releaseId: snapshot.releaseId,
      entries: first.persistedEntries,
      idempotentRerunInserted: second.insertedEntries,
      productsMatched: activated.cached,
      distribution: distribution.rows,
      activeReleases: Number(after.rows[0]?.active ?? 0),
      registryRowsUnchanged: true,
      mappingsUnchanged: true,
      indexedPlan: true,
      performance: {
        baselineWarmMs: Number(baselineWarmMs.toFixed(2)),
        enrichedWarmMs: Number(enrichedWarmMs.toFixed(2)),
        regressionPct: Number(performanceRegressionPct.toFixed(2)),
      },
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "National-list DB smoke failed.";
  console.error(message.replace(/(?:postgres(?:ql)?):\/\/\S+/giu, "[redacted]"));
  process.exitCode = 1;
});
