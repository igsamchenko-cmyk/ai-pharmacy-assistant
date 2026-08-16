import {
  openCatalogIndexDatabase,
  SEARCH_METRICS_STORE,
} from "@/lib/catalog-index-db";

export const SEARCH_METRICS_LIMIT = 200;

export interface SearchMetricRecord {
  id: string;
  ts: number;
  cold: boolean | null;
  ttir: number | null;
  ttfr: number | null;
  ttc: number | null;
  /** PR-I, I.3: time from app start to the first instruction section a
   * pharmacist opens on the current card ("time to section"). */
  ttSec: number | null;
  catalogSize: number | null;
  indexBuildMs: number | null;
  serializedIndexBytes: number | null;
  uaMobile: boolean;
}

export interface SearchIndexReadyMeta {
  catalogSize: number;
  indexBuildMs: number;
  serializedIndexBytes: number;
  cold: boolean;
}

export interface SearchMetricsStore {
  upsert(record: SearchMetricRecord): Promise<void>;
  list(limit?: number): Promise<SearchMetricRecord[]>;
}

interface PerformanceEntryLike {
  duration: number;
}

interface PerformanceLike {
  mark(name: string): void;
  measure(name: string, startMark: string, endMark: string): void;
  getEntriesByName(name: string): PerformanceEntryLike[];
}

export interface SearchMetricsTracker {
  markAppStart(): void;
  markIndexReady(meta: SearchIndexReadyMeta): void;
  markFirstResult(query: string): void;
  markCardOpen(drugId: string): void;
  markSectionOpen(sectionKey: string): void;
  flush(): Promise<void>;
  snapshot(): SearchMetricRecord | null;
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

export function retainNewestSearchMetrics(
  records: readonly SearchMetricRecord[],
  limit = SEARCH_METRICS_LIMIT,
): SearchMetricRecord[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  return [...byId.values()]
    .sort(
      (left, right) => right.ts - left.ts || right.id.localeCompare(left.id),
    )
    .slice(0, Math.max(0, limit));
}

export function createIndexedDbSearchMetricsStore(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): SearchMetricsStore {
  return {
    async upsert(record) {
      if (!factory) return;
      const database = await openCatalogIndexDatabase(factory);
      try {
        const readTransaction = database.transaction(
          SEARCH_METRICS_STORE,
          "readonly",
        );
        const current = (await requestResult(
          readTransaction.objectStore(SEARCH_METRICS_STORE).getAll(),
        )) as SearchMetricRecord[];
        await transactionDone(readTransaction);
        const retained = retainNewestSearchMetrics(
          [...current, record],
          SEARCH_METRICS_LIMIT,
        );
        const retainedIds = new Set(retained.map((item) => item.id));
        const writeTransaction = database.transaction(
          SEARCH_METRICS_STORE,
          "readwrite",
        );
        const store = writeTransaction.objectStore(SEARCH_METRICS_STORE);
        if (retainedIds.has(record.id)) store.put(record);
        for (const item of current) {
          if (!retainedIds.has(item.id)) store.delete(item.id);
        }
        await transactionDone(writeTransaction);
      } finally {
        database.close();
      }
    },
    async list(limit = SEARCH_METRICS_LIMIT) {
      if (!factory) return [];
      const database = await openCatalogIndexDatabase(factory);
      try {
        const transaction = database.transaction(
          SEARCH_METRICS_STORE,
          "readonly",
        );
        const records = (await requestResult(
          transaction.objectStore(SEARCH_METRICS_STORE).getAll(),
        )) as SearchMetricRecord[];
        await transactionDone(transaction);
        return retainNewestSearchMetrics(records, limit);
      } finally {
        database.close();
      }
    },
  };
}

function metricDuration(
  performanceApi: PerformanceLike,
  measureName: string,
  startMark: string,
  endMark: string,
): number | null {
  performanceApi.measure(measureName, startMark, endMark);
  const entries = performanceApi.getEntriesByName(measureName);
  const duration = entries.at(-1)?.duration;
  return typeof duration === "number" && Number.isFinite(duration)
    ? duration
    : null;
}

export function createSearchMetricsTracker(
  options: {
    performance?: PerformanceLike;
    store?: SearchMetricsStore;
    now?: () => number;
    userAgent?: string;
    sessionId?: string;
  } = {},
): SearchMetricsTracker {
  const performanceApi = options.performance;
  const store = options.store;
  const now = options.now ?? Date.now;
  const sessionId =
    options.sessionId ??
    `${now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const prefix = `farmassist-search-${sessionId}`;
  const startMark = `${prefix}-app-start`;
  let record: SearchMetricRecord | null = null;
  let persistChain = Promise.resolve();

  const persist = () => {
    if (!store || !record) return;
    const snapshot = { ...record };
    persistChain = persistChain
      .then(() => store.upsert(snapshot))
      .catch(() => undefined);
  };

  const markElapsed = (name: string): number | null => {
    if (!performanceApi) return null;
    const endMark = `${prefix}-${name}`;
    performanceApi.mark(endMark);
    return metricDuration(
      performanceApi,
      `${prefix}-${name}-measure`,
      startMark,
      endMark,
    );
  };

  return {
    markAppStart() {
      if (!performanceApi || record) return;
      performanceApi.mark(startMark);
      record = {
        id: sessionId,
        ts: now(),
        cold: null,
        ttir: null,
        ttfr: null,
        ttc: null,
        ttSec: null,
        catalogSize: null,
        indexBuildMs: null,
        serializedIndexBytes: null,
        uaMobile: /Android|iPhone|iPad|iPod|Mobile/iu.test(
          options.userAgent ?? "",
        ),
      };
      persist();
    },
    markIndexReady(meta) {
      if (!record || record.ttir !== null) return;
      record = {
        ...record,
        cold: meta.cold,
        ttir: markElapsed("index-ready"),
        catalogSize: meta.catalogSize,
        indexBuildMs: meta.indexBuildMs,
        serializedIndexBytes: meta.serializedIndexBytes,
      };
      persist();
    },
    markFirstResult(query) {
      if (!record || record.ttfr !== null || !query.trim()) return;
      record = { ...record, ttfr: markElapsed("first-result") };
      persist();
    },
    markCardOpen(drugId) {
      if (!record || record.ttc !== null || !drugId.trim()) return;
      record = { ...record, ttc: markElapsed("card-open") };
      persist();
    },
    markSectionOpen(sectionKey) {
      if (!record || record.ttSec !== null || !sectionKey.trim()) return;
      record = { ...record, ttSec: markElapsed("section-open") };
      persist();
    },
    flush() {
      return persistChain;
    },
    snapshot() {
      return record ? { ...record } : null;
    },
  };
}

const browserPerformance =
  typeof globalThis.performance === "undefined"
    ? undefined
    : globalThis.performance;
const browserStore = createIndexedDbSearchMetricsStore();
const tracker = createSearchMetricsTracker({
  performance: browserPerformance,
  store: browserStore,
  userAgent:
    typeof globalThis.navigator === "undefined"
      ? ""
      : globalThis.navigator.userAgent,
});

export const markAppStart = () => tracker.markAppStart();
export const markIndexReady = (meta: SearchIndexReadyMeta) =>
  tracker.markIndexReady(meta);
export const markFirstResult = (query: string) =>
  tracker.markFirstResult(query);
export const markCardOpen = (drugId: string) => tracker.markCardOpen(drugId);
export const markSectionOpen = (sectionKey: string) =>
  tracker.markSectionOpen(sectionKey);
export const readSearchMetrics = (limit = SEARCH_METRICS_LIMIT) =>
  browserStore.list(limit);
