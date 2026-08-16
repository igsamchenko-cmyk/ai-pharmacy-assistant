import {
  openCatalogIndexDatabase,
  ZERO_RESULTS_LOG_STORE,
} from "@/lib/catalog-index-db";

export const ZERO_RESULTS_LOG_LIMIT = 500;

/**
 * PR-I, I.3: a purely local record of searches that returned zero results,
 * so the pharmacy owner can periodically export and review what pharmacists
 * are searching for that the catalog or instruction index can't answer.
 * Never transmitted over the network -- this is an IndexedDB-only log in
 * the same database as the other client-side performance stores
 * (`catalog-index-db.ts`), read back only from the local `/perf` page.
 */
export type ZeroResultsLogSource =
  | "catalog"
  | "catalog_ingredients"
  | "instruction_search";

export interface ZeroResultsLogRecord {
  id: string;
  ts: number;
  source: ZeroResultsLogSource;
  query: string;
}

export interface ZeroResultsLogStore {
  append(record: ZeroResultsLogRecord): Promise<void>;
  list(limit?: number): Promise<ZeroResultsLogRecord[]>;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

export function retainNewestZeroResultsLog(
  records: readonly ZeroResultsLogRecord[],
  limit = ZERO_RESULTS_LOG_LIMIT,
): ZeroResultsLogRecord[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  return [...byId.values()]
    .sort(
      (left, right) => right.ts - left.ts || right.id.localeCompare(left.id),
    )
    .slice(0, Math.max(0, limit));
}

export function createIndexedDbZeroResultsLogStore(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): ZeroResultsLogStore {
  return {
    async append(record) {
      if (!factory) return;
      const database = await openCatalogIndexDatabase(factory);
      try {
        const readTransaction = database.transaction(
          ZERO_RESULTS_LOG_STORE,
          "readonly",
        );
        const current = (await requestResult(
          readTransaction.objectStore(ZERO_RESULTS_LOG_STORE).getAll(),
        )) as ZeroResultsLogRecord[];
        await transactionDone(readTransaction);
        const retained = retainNewestZeroResultsLog(
          [...current, record],
          ZERO_RESULTS_LOG_LIMIT,
        );
        const retainedIds = new Set(retained.map((item) => item.id));
        const writeTransaction = database.transaction(
          ZERO_RESULTS_LOG_STORE,
          "readwrite",
        );
        const store = writeTransaction.objectStore(ZERO_RESULTS_LOG_STORE);
        if (retainedIds.has(record.id)) store.put(record);
        for (const item of current) {
          if (!retainedIds.has(item.id)) store.delete(item.id);
        }
        await transactionDone(writeTransaction);
      } finally {
        database.close();
      }
    },
    async list(limit = ZERO_RESULTS_LOG_LIMIT) {
      if (!factory) return [];
      const database = await openCatalogIndexDatabase(factory);
      try {
        const transaction = database.transaction(
          ZERO_RESULTS_LOG_STORE,
          "readonly",
        );
        const records = (await requestResult(
          transaction.objectStore(ZERO_RESULTS_LOG_STORE).getAll(),
        )) as ZeroResultsLogRecord[];
        await transactionDone(transaction);
        return retainNewestZeroResultsLog(records, limit);
      } finally {
        database.close();
      }
    },
  };
}

let sharedStore: ZeroResultsLogStore | null = null;

export function getZeroResultsLogStore(): ZeroResultsLogStore {
  if (!sharedStore) sharedStore = createIndexedDbZeroResultsLogStore();
  return sharedStore;
}

let sequence = 0;

/**
 * Fire-and-forget logger for a zero-result search. Trims and caps the query
 * text, skips empty queries (nothing useful to review), and never throws --
 * a blocked or failing local log must not affect the search UI itself.
 */
export function logZeroResults(
  source: ZeroResultsLogSource,
  query: string,
  store: ZeroResultsLogStore = getZeroResultsLogStore(),
  now: () => number = Date.now,
): void {
  const trimmed = query.trim().slice(0, 200);
  if (!trimmed) return;
  const ts = now();
  const id = `${ts.toString(36)}-${(sequence += 1).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  void store.append({ id, ts, source, query: trimmed }).catch(() => undefined);
}

export const SOURCE_LABELS: Record<ZeroResultsLogSource, string> = {
  catalog: "Каталог",
  catalog_ingredients: "Каталог · діючі речовини",
  instruction_search: "Пошук в інструкціях",
};

export function zeroResultsLogToJson(
  records: readonly ZeroResultsLogRecord[],
): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      count: records.length,
      records,
    },
    null,
    2,
  );
}
