import {
  DrugInstructionSnapshotSchema,
  InstructionSourceProductSchema,
  type DrugInstructionSnapshot,
  type InstructionSourceProduct,
} from "./model";
import {
  instructionFetchFailureTransition,
  type InstructionFetchQueuePlan,
} from "./fetchQueue";

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

export interface InstructionQueuePool {
  connect(): Promise<PoolClient>;
}

export interface ClaimedInstructionFetchJob {
  registryProductId: string;
  registrationNumber: string;
  source: InstructionSourceProduct;
  attempts: number;
  maxAttempts: number;
  registrySourceUrl: string;
  sourceSnapshotHash: string;
  sourceSnapshotCheckedAt: string;
}

const QUEUE_CHUNK_SIZE = 200;
const DOCUMENT_CHUNK_SIZE = 20;

async function getPool(): Promise<InstructionQueuePool> {
  const module = await import("@workspace/db");
  return module.pool as InstructionQueuePool;
}

async function transaction<T>(
  pool: InstructionQueuePool,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
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

function exactKey(
  registryProductId: string,
  registrationNumber: string,
): string {
  return `${registryProductId}\u0000${registrationNumber}`;
}

function validateCommitPlan(plan: InstructionFetchQueuePlan): void {
  let registryUrl: URL;
  try {
    registryUrl = new URL(plan.registry.sourceUrl);
  } catch {
    throw new Error("instruction_queue_fresh_registry_required");
  }
  if (
    (registryUrl.protocol !== "http:" && registryUrl.protocol !== "https:") ||
    !["drlz.com.ua", "www.drlz.com.ua"].includes(
      registryUrl.hostname.toLowerCase(),
    ) ||
    !registryUrl.pathname.toLowerCase().endsWith("/reestr.csv") ||
    registryUrl.username ||
    registryUrl.password
  ) {
    throw new Error("instruction_queue_fresh_registry_required");
  }
  if (!/^[a-f0-9]{64}$/u.test(plan.registry.sha256)) {
    throw new Error("instruction_queue_fresh_registry_required");
  }
  if (!Number.isFinite(Date.parse(plan.registry.checkedAt))) {
    throw new Error("instruction_queue_fresh_registry_required");
  }
}

async function upsertQueue(
  client: PoolClient,
  plan: InstructionFetchQueuePlan,
  snapshots: ReadonlyMap<string, DrugInstructionSnapshot>,
): Promise<number> {
  let upserted = 0;
  for (
    let start = 0;
    start < plan.candidates.length;
    start += QUEUE_CHUNK_SIZE
  ) {
    const chunk = plan.candidates.slice(start, start + QUEUE_CHUNK_SIZE);
    const values: unknown[] = [];
    const tuples = chunk.map((candidate) => {
      const offset = values.length;
      const snapshot = snapshots.get(
        exactKey(
          candidate.source.registryProductId,
          candidate.source.registrationNumber,
        ),
      );
      values.push(
        candidate.source.registryProductId,
        candidate.source.registrationNumber,
        candidate.source.tradeName,
        candidate.source.inn,
        candidate.source.dosageForm,
        candidate.source.sourceUrl,
        JSON.stringify(candidate.source),
        candidate.priorityTier,
        candidate.priorityReason,
        snapshot ? "fetched" : "pending",
        3,
        plan.registry.sourceUrl,
        plan.registry.sha256,
        plan.registry.checkedAt,
        snapshot?.source.documentHash ?? null,
        snapshot?.source.checkedAt ?? null,
        snapshot?.source.checkedAt ?? null,
      );
      return `(${Array.from({ length: 17 }, (_, index) => `$${offset + index + 1}`).join(", ")})`;
    });
    const result = await client.query(
      `INSERT INTO instruction_fetch_queue (
         registry_product_id, registration_number, trade_name, inn, dosage_form,
         source_url, source_product_json, priority_tier, priority_reason, status,
         max_attempts, registry_source_url, source_snapshot_hash,
         source_snapshot_checked_at, fetched_document_hash, last_checked_at,
         last_success_at
       ) VALUES ${tuples.join(", ")}
       ON CONFLICT (registry_product_id) DO UPDATE SET
         registration_number = EXCLUDED.registration_number,
         trade_name = EXCLUDED.trade_name,
         inn = EXCLUDED.inn,
         dosage_form = EXCLUDED.dosage_form,
         source_product_json = EXCLUDED.source_product_json,
         priority_tier = EXCLUDED.priority_tier,
         priority_reason = EXCLUDED.priority_reason,
         status = CASE
           WHEN EXCLUDED.status = 'fetched' THEN 'fetched'
           WHEN instruction_fetch_queue.source_url <> EXCLUDED.source_url
             THEN 'source_changed'
           ELSE instruction_fetch_queue.status
         END,
         attempts = CASE
           WHEN instruction_fetch_queue.source_url <> EXCLUDED.source_url THEN 0
           ELSE instruction_fetch_queue.attempts
         END,
         next_attempt_at = CASE
           WHEN instruction_fetch_queue.source_url <> EXCLUDED.source_url THEN NOW()
           ELSE instruction_fetch_queue.next_attempt_at
         END,
         source_url = EXCLUDED.source_url,
         registry_source_url = EXCLUDED.registry_source_url,
         source_snapshot_hash = EXCLUDED.source_snapshot_hash,
         source_snapshot_checked_at = EXCLUDED.source_snapshot_checked_at,
         fetched_document_hash = COALESCE(
           EXCLUDED.fetched_document_hash,
           instruction_fetch_queue.fetched_document_hash
         ),
         last_error_code = CASE
           WHEN EXCLUDED.status = 'fetched' THEN NULL
           ELSE instruction_fetch_queue.last_error_code
         END,
         last_checked_at = COALESCE(
           EXCLUDED.last_checked_at,
           instruction_fetch_queue.last_checked_at
         ),
         last_success_at = COALESCE(
           EXCLUDED.last_success_at,
           instruction_fetch_queue.last_success_at
         ),
         locked_at = CASE
           WHEN EXCLUDED.status = 'fetched'
             OR instruction_fetch_queue.source_url <> EXCLUDED.source_url
             THEN NULL
           ELSE instruction_fetch_queue.locked_at
         END,
         locked_by = CASE
           WHEN EXCLUDED.status = 'fetched'
             OR instruction_fetch_queue.source_url <> EXCLUDED.source_url
             THEN NULL
           ELSE instruction_fetch_queue.locked_by
         END,
         updated_at = NOW()
       RETURNING registry_product_id`,
      values,
    );
    upserted += result.rowCount ?? 0;
  }
  return upserted;
}

async function upsertDocuments(
  client: PoolClient,
  snapshots: readonly DrugInstructionSnapshot[],
  sourceSnapshotHash: string,
): Promise<number> {
  let upserted = 0;
  for (let start = 0; start < snapshots.length; start += DOCUMENT_CHUNK_SIZE) {
    const chunk = snapshots.slice(start, start + DOCUMENT_CHUNK_SIZE);
    const values: unknown[] = [];
    const tuples = chunk.map((snapshot) => {
      const offset = values.length;
      values.push(
        snapshot.registryProductId,
        snapshot.registrationNumber,
        snapshot.tradeName,
        snapshot.status,
        snapshot.source.url,
        snapshot.source.documentHash,
        snapshot.source.documentDate,
        snapshot.source.checkedAt,
        snapshot.source.parserVersion,
        snapshot.provenance.availableSectionCount,
        snapshot.provenance.coveragePct,
        sourceSnapshotHash,
        JSON.stringify(snapshot),
      );
      return `(${Array.from({ length: 13 }, (_, index) => `$${offset + index + 1}`).join(", ")})`;
    });
    const result = await client.query(
      `INSERT INTO drug_instruction_documents (
         registry_product_id, registration_number, trade_name, status,
         source_url, document_hash, document_date, checked_at, parser_version,
         available_section_count, coverage_pct, source_snapshot_hash,
         snapshot_json
       ) VALUES ${tuples.join(", ")}
       ON CONFLICT (registry_product_id) DO UPDATE SET
         registration_number = EXCLUDED.registration_number,
         trade_name = EXCLUDED.trade_name,
         status = EXCLUDED.status,
         source_url = EXCLUDED.source_url,
         document_hash = EXCLUDED.document_hash,
         document_date = EXCLUDED.document_date,
         checked_at = EXCLUDED.checked_at,
         parser_version = EXCLUDED.parser_version,
         available_section_count = EXCLUDED.available_section_count,
         coverage_pct = EXCLUDED.coverage_pct,
         source_snapshot_hash = EXCLUDED.source_snapshot_hash,
         snapshot_json = EXCLUDED.snapshot_json,
         updated_at = NOW()
       RETURNING registry_product_id`,
      values,
    );
    upserted += result.rowCount ?? 0;
  }
  return upserted;
}

export async function commitInstructionFetchQueuePlan(
  plan: InstructionFetchQueuePlan,
  existingSnapshots: readonly DrugInstructionSnapshot[],
  pool?: InstructionQueuePool,
): Promise<{ queueUpserts: number; documentUpserts: number }> {
  validateCommitPlan(plan);
  const validatedSnapshots = existingSnapshots.map((snapshot) =>
    DrugInstructionSnapshotSchema.parse(snapshot),
  );
  const snapshotMap = new Map(
    validatedSnapshots.map((snapshot) => [
      exactKey(snapshot.registryProductId, snapshot.registrationNumber),
      snapshot,
    ]),
  );
  const activePool = pool ?? (await getPool());
  return transaction(activePool, async (client) => ({
    queueUpserts: await upsertQueue(client, plan, snapshotMap),
    documentUpserts: await upsertDocuments(
      client,
      validatedSnapshots,
      plan.registry.sha256,
    ),
  }));
}

interface ClaimedRow {
  registry_product_id: string;
  registration_number: string;
  source_product_json: unknown;
  attempts: number;
  max_attempts: number;
  registry_source_url: string;
  source_snapshot_hash: string;
  source_snapshot_checked_at: Date | string;
}

export async function claimInstructionFetchJobs(
  limit: number,
  workerId: string,
  pool?: InstructionQueuePool,
): Promise<ClaimedInstructionFetchJob[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("instruction_queue_claim_limit_invalid");
  }
  if (!/^[a-z0-9:_-]{3,80}$/iu.test(workerId)) {
    throw new Error("instruction_queue_worker_id_invalid");
  }
  const activePool = pool ?? (await getPool());
  return transaction(activePool, async (client) => {
    await client.query(
      `UPDATE instruction_fetch_queue
       SET status = 'parse_failed',
           last_error_code = 'worker_lease_expired',
           locked_at = NULL,
           locked_by = NULL,
           updated_at = NOW()
       WHERE status = 'fetching'
         AND locked_at < NOW() - INTERVAL '15 minutes'
         AND attempts >= max_attempts`,
    );
    const result = await client.query<ClaimedRow>(
      `WITH ready AS (
         SELECT registry_product_id
         FROM instruction_fetch_queue
         WHERE (
           status IN ('pending', 'source_changed')
           OR (
             status = 'fetching'
             AND locked_at < NOW() - INTERVAL '15 minutes'
           )
         )
           AND next_attempt_at <= NOW()
           AND attempts < max_attempts
         ORDER BY priority_tier, next_attempt_at, registration_number
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE instruction_fetch_queue AS queue
       SET status = 'fetching',
           attempts = queue.attempts + 1,
           locked_at = NOW(),
           locked_by = $2,
           updated_at = NOW()
       FROM ready
       WHERE queue.registry_product_id = ready.registry_product_id
       RETURNING queue.registry_product_id, queue.registration_number,
         queue.source_product_json, queue.attempts, queue.max_attempts,
         queue.registry_source_url, queue.source_snapshot_hash,
         queue.source_snapshot_checked_at`,
      [limit, workerId],
    );
    return result.rows.map((row) => ({
      registryProductId: row.registry_product_id,
      registrationNumber: row.registration_number,
      source: InstructionSourceProductSchema.parse(
        typeof row.source_product_json === "string"
          ? JSON.parse(row.source_product_json)
          : row.source_product_json,
      ),
      attempts: Number(row.attempts),
      maxAttempts: Number(row.max_attempts),
      registrySourceUrl: row.registry_source_url,
      sourceSnapshotHash: row.source_snapshot_hash,
      sourceSnapshotCheckedAt: new Date(
        row.source_snapshot_checked_at,
      ).toISOString(),
    }));
  });
}

async function upsertOneDocument(
  client: PoolClient,
  snapshot: DrugInstructionSnapshot,
  sourceSnapshotHash: string,
): Promise<void> {
  await upsertDocuments(client, [snapshot], sourceSnapshotHash);
}

export async function completeInstructionFetchJob(
  job: ClaimedInstructionFetchJob,
  workerId: string,
  snapshotInput: DrugInstructionSnapshot,
  pool?: InstructionQueuePool,
): Promise<void> {
  const snapshot = DrugInstructionSnapshotSchema.parse(snapshotInput);
  if (
    snapshot.registryProductId !== job.registryProductId ||
    snapshot.registrationNumber !== job.registrationNumber ||
    (snapshot.status !== "available" && snapshot.status !== "partial")
  ) {
    throw new Error("instruction_queue_snapshot_mismatch");
  }
  const activePool = pool ?? (await getPool());
  await transaction(activePool, async (client) => {
    await upsertOneDocument(client, snapshot, job.sourceSnapshotHash);
    const updated = await client.query(
      `UPDATE instruction_fetch_queue
       SET status = 'fetched',
           fetched_document_hash = $3,
           last_error_code = NULL,
           last_checked_at = $4,
           last_success_at = $4,
           next_attempt_at = $4::timestamptz + INTERVAL '7 days',
           locked_at = NULL,
           locked_by = NULL,
           updated_at = NOW()
       WHERE registry_product_id = $1
         AND status = 'fetching'
         AND locked_by = $2
       RETURNING registry_product_id`,
      [
        job.registryProductId,
        workerId,
        snapshot.source.documentHash,
        snapshot.source.checkedAt,
      ],
    );
    if ((updated.rowCount ?? 0) !== 1) {
      throw new Error("instruction_queue_worker_lease_lost");
    }
  });
}

export async function failInstructionFetchJob(
  job: ClaimedInstructionFetchJob,
  workerId: string,
  input: { errorCode: string; retryable: boolean; now?: Date },
  pool?: InstructionQueuePool,
): Promise<"pending" | "parse_failed"> {
  if (!/^[a-z0-9:_-]{1,120}$/iu.test(input.errorCode)) {
    throw new Error("instruction_queue_error_code_invalid");
  }
  const now = input.now ?? new Date();
  const transition = instructionFetchFailureTransition({
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    retryable: input.retryable,
    now,
  });
  const activePool = pool ?? (await getPool());
  await transaction(activePool, async (client) => {
    const updated = await client.query(
      `UPDATE instruction_fetch_queue
       SET status = $3,
           last_error_code = $4,
           last_checked_at = $5,
           next_attempt_at = $6,
           locked_at = NULL,
           locked_by = NULL,
           updated_at = NOW()
       WHERE registry_product_id = $1
         AND status = 'fetching'
         AND locked_by = $2
       RETURNING registry_product_id`,
      [
        job.registryProductId,
        workerId,
        transition.status,
        input.errorCode,
        now.toISOString(),
        (transition.nextAttemptAt ?? now).toISOString(),
      ],
    );
    if ((updated.rowCount ?? 0) !== 1) {
      throw new Error("instruction_queue_worker_lease_lost");
    }
  });
  return transition.status;
}

export async function scheduleInstructionHashRefresh(
  maxAgeDays = 7,
  pool?: InstructionQueuePool,
): Promise<number> {
  if (!Number.isInteger(maxAgeDays) || maxAgeDays < 1 || maxAgeDays > 90) {
    throw new Error("instruction_queue_refresh_age_invalid");
  }
  const activePool = pool ?? (await getPool());
  return transaction(activePool, async (client) => {
    const result = await client.query(
      `UPDATE instruction_fetch_queue
       SET status = 'source_changed',
           attempts = 0,
           next_attempt_at = NOW(),
           last_error_code = NULL,
           updated_at = NOW()
       WHERE status = 'fetched'
         AND (
           last_checked_at IS NULL
           OR last_checked_at < NOW() - ($1::int * INTERVAL '1 day')
         )
       RETURNING registry_product_id`,
      [maxAgeDays],
    );
    return result.rowCount ?? 0;
  });
}

export async function requeueFailedInstructionFetchJobs(
  errorCode: string,
  limit = 20,
  pool?: InstructionQueuePool,
): Promise<number> {
  if (!/^[a-z0-9:_-]{1,120}$/iu.test(errorCode)) {
    throw new Error("instruction_queue_error_code_invalid");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("instruction_queue_requeue_limit_invalid");
  }
  const activePool = pool ?? (await getPool());
  return transaction(activePool, async (client) => {
    const result = await client.query(
      `WITH selected AS (
         SELECT registry_product_id
         FROM instruction_fetch_queue
         WHERE status = 'parse_failed'
           AND last_error_code = $1
         ORDER BY priority_tier, registration_number
         FOR UPDATE SKIP LOCKED
         LIMIT $2
       )
       UPDATE instruction_fetch_queue AS queue
       SET status = 'pending',
           attempts = 0,
           next_attempt_at = NOW(),
           last_error_code = NULL,
           locked_at = NULL,
           locked_by = NULL,
           updated_at = NOW()
       FROM selected
       WHERE queue.registry_product_id = selected.registry_product_id
       RETURNING queue.registry_product_id`,
      [errorCode, limit],
    );
    return result.rowCount ?? 0;
  });
}
