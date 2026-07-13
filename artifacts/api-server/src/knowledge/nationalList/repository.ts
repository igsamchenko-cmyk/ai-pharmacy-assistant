import type { NationalListSnapshot } from "./model";
import { evaluateNationalListActivation } from "./source";
import {
  resolveNationalListMatch,
  type NationalListProductInput,
} from "./resolver";

interface QueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount: number | null;
}

interface PoolClient {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
  release(): void;
}

interface Pool {
  connect(): Promise<PoolClient>;
}

interface RegistryProductRow {
  registry_id: string;
  inn: string;
  active_ingredient: string;
  form: string;
}

const CHUNK_SIZE = 500;

async function getPool(): Promise<Pool> {
  const module = await import("@workspace/db");
  return module.pool as Pool;
}

async function transaction<T>(pool: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '120s'");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface NationalListCommitResult {
  releaseId: string;
  insertedRelease: boolean;
  insertedEntries: number;
  persistedEntries: number;
}

export async function commitNationalListSnapshot(
  snapshot: NationalListSnapshot,
  pool?: Pool,
): Promise<NationalListCommitResult> {
  const gate = evaluateNationalListActivation(snapshot);
  if (!gate.ready) {
    throw new Error(`National-list commit blocked: ${gate.blockers.join(" ")}`);
  }
  const activePool = pool ?? await getPool();
  return transaction(activePool, async (client) => {
    const existing = await client.query<{ document_hash: string }>(
      "SELECT document_hash FROM national_list_releases WHERE id = $1",
      [snapshot.releaseId],
    );
    if (existing.rows[0] &&
      existing.rows[0].document_hash !== snapshot.source.documentHash) {
      throw new Error("Release identifier already exists with a different source hash.");
    }
    const release = await client.query(
      `INSERT INTO national_list_releases (
         id, title, act_number, act_date, revision_date, effective_date,
         source_url, source_domain, source_format, document_hash, parser_version,
         raw_count, parsed_count, valid_count, invalid_count,
         provenance_coverage, status, checked_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16, 'reviewed', $17
       ) ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        snapshot.releaseId,
        snapshot.source.title,
        snapshot.source.actNumber,
        snapshot.source.actDate,
        snapshot.source.revisionDate,
        snapshot.source.effectiveDate,
        snapshot.source.sourceUrl,
        snapshot.source.sourceDomain,
        snapshot.source.sourceFormat,
        snapshot.source.documentHash,
        snapshot.source.parserVersion,
        snapshot.counts.raw,
        snapshot.counts.parsed,
        snapshot.counts.valid,
        snapshot.counts.invalid,
        snapshot.counts.provenanceCoverage,
        snapshot.source.checkedAt,
      ],
    );
    let insertedEntries = 0;
    for (let start = 0; start < snapshot.entries.length; start += CHUNK_SIZE) {
      const chunk = snapshot.entries.slice(start, start + CHUNK_SIZE);
      const values: unknown[] = [];
      const tuples = chunk.map((entry) => {
        const offset = values.length;
        values.push(
          snapshot.releaseId,
          entry.stableKey,
          entry.officialNameUa,
          entry.officialNameEn,
          entry.compositionSignature,
          JSON.stringify(entry.ingredients),
          JSON.stringify(entry.dosageForms),
          JSON.stringify(entry.routes),
          JSON.stringify(entry.strengths),
          entry.section,
          entry.category,
          entry.restrictions,
          entry.sourceUrl,
          entry.sourceHash,
          entry.sourceLocator,
          entry.reviewStatus,
        );
        return `(${Array.from({ length: 16 }, (_, index) => `$${offset + index + 1}`).join(", ")})`;
      });
      const result = await client.query(
        `INSERT INTO national_list_entries (
           release_id, stable_key, official_name_ua, official_name_en,
           composition_signature, ingredients_json, dosage_forms_json, routes_json,
           strengths_json, section, category, restrictions, source_url, source_hash,
           source_locator, review_status
         ) VALUES ${tuples.join(", ")}
         ON CONFLICT (release_id, stable_key) DO NOTHING
         RETURNING id`,
        values,
      );
      insertedEntries += result.rowCount ?? 0;
    }
    const count = await client.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM national_list_entries WHERE release_id = $1",
      [snapshot.releaseId],
    );
    const persistedEntries = Number(count.rows[0]?.count ?? 0);
    if (persistedEntries !== snapshot.counts.valid) {
      throw new Error("National-list entry count does not match the validated snapshot.");
    }
    return {
      releaseId: snapshot.releaseId,
      insertedRelease: (release.rowCount ?? 0) === 1,
      insertedEntries,
      persistedEntries,
    };
  });
}

function productInput(row: RegistryProductRow): NationalListProductInput {
  return {
    registryId: row.registry_id,
    inn: row.inn,
    activeIngredient: row.active_ingredient,
    dosageForm: row.form,
  };
}

export async function activateNationalListRelease(
  snapshot: NationalListSnapshot,
  pool?: Pool,
) {
  const gate = evaluateNationalListActivation(snapshot);
  if (!gate.ready) throw new Error(`National-list activation blocked: ${gate.blockers.join(" ")}`);
  const activePool = pool ?? await getPool();
  return transaction(activePool, async (client) => {
    const release = await client.query<{ status: string; document_hash: string }>(
      "SELECT status, document_hash FROM national_list_releases WHERE id = $1 FOR UPDATE",
      [snapshot.releaseId],
    );
    if (!release.rows[0] || release.rows[0].document_hash !== snapshot.source.documentHash) {
      throw new Error("Validated release must be committed before activation.");
    }
    const products = await client.query<RegistryProductRow>(
      `SELECT registry_id, inn, active_ingredient, form
       FROM knowledge_registry_products
       ORDER BY registry_id`,
    );
    let cached = 0;
    for (let start = 0; start < products.rows.length; start += CHUNK_SIZE) {
      const chunk = products.rows.slice(start, start + CHUNK_SIZE);
      const matches = chunk.map((row) => ({
        row,
        match: resolveNationalListMatch(productInput(row), snapshot.entries, {
          activeRelease: true,
        }),
      }));
      const values: unknown[] = [];
      const tuples = matches.map(({ row, match }) => {
        const offset = values.length;
        values.push(
          snapshot.releaseId,
          row.registry_id,
          match.entryStableKey,
          match.status,
          match.reason,
          match.ingredientMatch,
          match.formMatch,
          match.routeMatch,
          match.strengthMatch,
          match.resolverVersion,
        );
        return `(${Array.from({ length: 10 }, (_, index) => `$${offset + index + 1}`).join(", ")})`;
      });
      if (tuples.length) {
        const result = await client.query(
          `INSERT INTO national_list_match_results (
             release_id, product_registry_id, entry_stable_key, status, reason,
             ingredient_match, form_match, route_match, strength_match, resolver_version
           ) VALUES ${tuples.join(", ")}
           ON CONFLICT (release_id, product_registry_id) DO UPDATE SET
             entry_stable_key = EXCLUDED.entry_stable_key,
             status = EXCLUDED.status,
             reason = EXCLUDED.reason,
             ingredient_match = EXCLUDED.ingredient_match,
             form_match = EXCLUDED.form_match,
             route_match = EXCLUDED.route_match,
             strength_match = EXCLUDED.strength_match,
             resolver_version = EXCLUDED.resolver_version,
             checked_at = NOW()`,
          values,
        );
        cached += result.rowCount ?? 0;
      }
    }
    await client.query(
      "UPDATE national_list_releases SET status = 'superseded' WHERE status = 'active' AND id <> $1",
      [snapshot.releaseId],
    );
    await client.query(
      "UPDATE national_list_releases SET status = 'active', activated_at = NOW() WHERE id = $1",
      [snapshot.releaseId],
    );
    return { releaseId: snapshot.releaseId, products: products.rows.length, cached };
  });
}

export async function rollbackNationalListRelease(
  releaseId: string,
  pool?: Pool,
) {
  const activePool = pool ?? await getPool();
  return transaction(activePool, async (client) => {
    const target = await client.query<{ id: string }>(
      `SELECT id FROM national_list_releases
       WHERE id = $1 AND status IN ('reviewed', 'active', 'superseded')
       FOR UPDATE`,
      [releaseId],
    );
    if (!target.rows[0]) throw new Error("Rollback target release is unavailable.");
    const cache = await client.query<{ cached: number; products: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM national_list_match_results
          WHERE release_id = $1) AS cached,
         (SELECT COUNT(*)::int FROM knowledge_registry_products) AS products`,
      [releaseId],
    );
    if (Number(cache.rows[0]?.cached ?? -1) !== Number(cache.rows[0]?.products ?? 0)) {
      throw new Error("Rollback target does not have a complete resolver cache.");
    }
    await client.query(
      "UPDATE national_list_releases SET status = 'superseded' WHERE status = 'active' AND id <> $1",
      [releaseId],
    );
    await client.query(
      "UPDATE national_list_releases SET status = 'active', activated_at = NOW() WHERE id = $1",
      [releaseId],
    );
    return { releaseId };
  });
}
