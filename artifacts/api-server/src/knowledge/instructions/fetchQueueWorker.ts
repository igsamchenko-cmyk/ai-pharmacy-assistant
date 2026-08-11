import type { InstructionSources } from "./model";
import { parseOfficialInstructionMht } from "./parser";
import {
  claimInstructionFetchJobs,
  completeInstructionFetchJob,
  failInstructionFetchJob,
  type ClaimedInstructionFetchJob,
  type InstructionQueuePool,
} from "./fetchQueueRepository";

const MAX_DOCUMENT_BYTES = 3_000_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MINIMUM_SECTIONS = 8;
const DEFAULT_START_INTERVAL_MS = 300;

class InstructionDownloadError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
  }
}

export interface InstructionFetchWorkerOptions {
  limit?: number;
  concurrency?: number;
  minimumSectionCount?: number;
  startIntervalMs?: number;
  timeoutMs?: number;
  workerId?: string;
  now?: () => Date;
  pool?: InstructionQueuePool;
}

export interface InstructionFetchWorkerReport {
  workerId: string;
  claimedCount: number;
  fetchedCount: number;
  retryScheduledCount: number;
  failedCount: number;
  errorCounts: Record<string, number>;
}

interface DownloadedInstruction {
  bytes: Buffer;
  lastModified: string | null;
}

function validateInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(code);
  }
  return value;
}

function defaultWorkerId(): string {
  return `instruction-worker-${process.pid}-${Date.now()}`;
}

async function responseBytes(
  response: Response,
  maximumBytes: number,
): Promise<Buffer> {
  if (!response.body)
    throw new InstructionDownloadError("download_body_missing", true);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const current = await reader.read();
    if (current.done) break;
    size += current.value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new InstructionDownloadError("document_size_invalid", false);
    }
    chunks.push(current.value);
  }
  if (!size) throw new InstructionDownloadError("document_size_invalid", false);
  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    size,
  );
}

export async function downloadOfficialInstruction(
  sourceUrl: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<DownloadedInstruction> {
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: "message/rfc822,text/plain,*/*",
      "User-Agent": "FarmAssist/1.8 official-instruction-worker",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new InstructionDownloadError(
      `download_http_${response.status}`,
      response.status === 408 ||
        response.status === 429 ||
        response.status >= 500,
    );
  }
  const announcedLength = Number(response.headers.get("content-length") ?? 0);
  if (announcedLength > MAX_DOCUMENT_BYTES) {
    throw new InstructionDownloadError("document_size_invalid", false);
  }
  return {
    bytes: await responseBytes(response, MAX_DOCUMENT_BYTES),
    lastModified: response.headers.get("last-modified"),
  };
}

export function classifyInstructionFetchError(error: unknown): {
  code: string;
  retryable: boolean;
} {
  if (error instanceof InstructionDownloadError) {
    return { code: error.code, retryable: error.retryable };
  }
  if (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return { code: "download_timeout", retryable: true };
  }
  if (error instanceof TypeError) {
    return { code: "download_network_error", retryable: true };
  }
  if (error instanceof Error && /^[a-z0-9:_-]{1,120}$/iu.test(error.message)) {
    return { code: error.message, retryable: false };
  }
  return { code: "instruction_fetch_failed", retryable: false };
}

export async function fetchInstructionSnapshot(
  job: ClaimedInstructionFetchJob,
  dataset: Pick<InstructionSources["dataset"], "title" | "url" | "license">,
  options: {
    minimumSectionCount?: number;
    timeoutMs?: number;
    checkedAt?: Date;
  } = {},
) {
  const minimumSectionCount =
    options.minimumSectionCount ?? DEFAULT_MINIMUM_SECTIONS;
  const downloaded = await downloadOfficialInstruction(
    job.source.sourceUrl,
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  let snapshot;
  try {
    snapshot = parseOfficialInstructionMht(downloaded.bytes, {
      source: job.source,
      dataset,
      checkedAt: options.checkedAt,
      lastModified: downloaded.lastModified,
    });
  } catch (error) {
    if (error instanceof TypeError) throw new Error("instruction_parse_failed");
    throw error;
  }
  if (
    (snapshot.status !== "available" && snapshot.status !== "partial") ||
    !snapshot.provenance.sourceAllowed ||
    !snapshot.provenance.registrationMatched ||
    !snapshot.provenance.contentLocationMatched
  ) {
    throw new Error("provenance_validation_failed");
  }
  if (snapshot.provenance.availableSectionCount < minimumSectionCount) {
    throw new Error("insufficient_section_coverage");
  }
  return snapshot;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function startRateLimiter(intervalMs: number): () => Promise<void> {
  let nextStartAt = 0;
  let gate = Promise.resolve();
  return () => {
    const turn = gate.then(async () => {
      const waitMs = Math.max(0, nextStartAt - Date.now());
      if (waitMs) await delay(waitMs);
      nextStartAt = Date.now() + intervalMs;
    });
    gate = turn.catch(() => undefined);
    return turn;
  };
}

export async function runInstructionFetchWorker(
  dataset: Pick<InstructionSources["dataset"], "title" | "url" | "license">,
  options: InstructionFetchWorkerOptions = {},
): Promise<InstructionFetchWorkerReport> {
  const limit = validateInteger(
    options.limit ?? 20,
    1,
    100,
    "instruction_worker_limit_invalid",
  );
  const concurrency = validateInteger(
    options.concurrency ?? 2,
    1,
    4,
    "instruction_worker_concurrency_invalid",
  );
  const minimumSectionCount = validateInteger(
    options.minimumSectionCount ?? DEFAULT_MINIMUM_SECTIONS,
    1,
    9,
    "instruction_worker_minimum_sections_invalid",
  );
  const startIntervalMs = validateInteger(
    options.startIntervalMs ?? DEFAULT_START_INTERVAL_MS,
    250,
    5_000,
    "instruction_worker_rate_invalid",
  );
  const workerId = options.workerId ?? defaultWorkerId();
  const jobs = await claimInstructionFetchJobs(limit, workerId, options.pool);
  const waitForStart = startRateLimiter(startIntervalMs);
  const report: InstructionFetchWorkerReport = {
    workerId,
    claimedCount: jobs.length,
    fetchedCount: 0,
    retryScheduledCount: 0,
    failedCount: 0,
    errorCounts: {},
  };
  let cursor = 0;
  const processJobs = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor];
      cursor += 1;
      if (!job) return;
      await waitForStart();
      let snapshot;
      try {
        snapshot = await fetchInstructionSnapshot(job, dataset, {
          minimumSectionCount,
          timeoutMs: options.timeoutMs,
          checkedAt: (options.now ?? (() => new Date()))(),
        });
      } catch (error) {
        const failure = classifyInstructionFetchError(error);
        report.errorCounts[failure.code] =
          (report.errorCounts[failure.code] ?? 0) + 1;
        const status = await failInstructionFetchJob(
          job,
          workerId,
          {
            errorCode: failure.code,
            retryable: failure.retryable,
            now: (options.now ?? (() => new Date()))(),
          },
          options.pool,
        );
        if (status === "pending") report.retryScheduledCount += 1;
        else report.failedCount += 1;
        continue;
      }
      await completeInstructionFetchJob(job, workerId, snapshot, options.pool);
      report.fetchedCount += 1;
    }
  };
  const settled = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, jobs.length) }, processJobs),
  );
  const infrastructureFailure = settled.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (infrastructureFailure) throw infrastructureFailure.reason;
  return report;
}
