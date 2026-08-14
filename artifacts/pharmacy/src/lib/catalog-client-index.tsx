import {
  CATALOG_CLIENT_INDEX_MAX_ALIASES,
  CATALOG_CLIENT_INDEX_MAX_MEMORY_BYTES,
  CATALOG_CLIENT_INDEX_MAX_PRODUCTS,
  CATALOG_CLIENT_INDEX_MAX_WIRE_BYTES,
  CATALOG_CLIENT_INDEX_VERSION,
  catalogClientIndexWireBytes,
  compileCatalogClientIndex,
  normalizeAndSearchCatalogClientIndex,
  searchCatalogClientIndex,
  type CatalogClientIndexAliasRow,
  type CatalogClientIndexPayload,
  type CatalogClientIndexRow,
  type CatalogClientIndexSearchOptions,
  type CatalogClientIndexSearchResult,
  type CatalogNormalizedSearchResult,
  type CompiledCatalogClientIndex,
} from "@workspace/catalog-index";
import { getGetCatalogClientIndexUrl } from "@workspace/api-client-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth";
import {
  createIndexedDbCatalogIndexStorage,
  type CatalogClientIndexStorage,
} from "@/lib/catalog-client-index-storage";
import type {
  CatalogClientIndexWorkerRequest,
  CatalogClientIndexWorkerResponse,
} from "@/lib/catalog-client-index.worker";
import { markIndexReady } from "@/lib/search-metrics";

export type CatalogClientIndexStatus = "idle" | "loading" | "ready" | "error";
export type CatalogClientIndexSource = "cache" | "network";

export interface CatalogClientIndexRefreshResult {
  index: CompiledCatalogClientIndex;
  source: CatalogClientIndexSource;
  stale: boolean;
  persistenceAvailable: boolean;
  cold: boolean;
  indexBuildMs: number;
  serializedIndexBytes: number;
}

export type CatalogClientIndexFetcher = (
  activeSnapshotHash: string | null,
  signal?: AbortSignal,
) => Promise<CatalogClientIndexPayload | null>;

export const CATALOG_CLIENT_INDEX_REFRESH_DELAY_MS = 30_000;
export const CATALOG_CLIENT_INDEX_COMPILE_CHUNK_SIZE = 128;

type CatalogClientIndexCompileOptions = {
  chunkSize?: number;
  yieldControl?: () => Promise<void>;
};

function defaultYieldControl(): Promise<void> {
  const scheduler = (
    globalThis as typeof globalThis & {
      scheduler?: { yield?: () => Promise<void> };
    }
  ).scheduler;
  if (typeof scheduler?.yield === "function") return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function compileCatalogClientIndexCooperatively(
  payload: CatalogClientIndexPayload,
  options: CatalogClientIndexCompileOptions = {},
): Promise<CompiledCatalogClientIndex> {
  if (
    payload.productCount !== payload.rows.length ||
    payload.rows.length > CATALOG_CLIENT_INDEX_MAX_PRODUCTS ||
    payload.aliasCount !== payload.aliases.length ||
    payload.aliases.length > CATALOG_CLIENT_INDEX_MAX_ALIASES
  ) {
    throw new Error("Catalog client index count is invalid.");
  }
  const chunkSize = Math.max(
    1,
    Math.floor(options.chunkSize ?? CATALOG_CLIENT_INDEX_COMPILE_CHUNK_SIZE),
  );
  const yieldControl = options.yieldControl ?? defaultYieldControl;
  const identities = new Set<string>();
  const products: CompiledCatalogClientIndex["products"][number][] = [];
  let estimatedMemoryBytes = 0;

  for (let offset = 0; offset < payload.rows.length; offset += chunkSize) {
    const rows = payload.rows.slice(offset, offset + chunkSize);
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== 6)
        throw new Error("Catalog client index row is invalid.");
      const identity = `${row[0]}\u0000${row[1]}`;
      if (identities.has(identity))
        throw new Error("Catalog client index contains duplicates.");
      identities.add(identity);
    }
    const compiled = compileCatalogClientIndex({
      ...payload,
      productCount: rows.length,
      aliasCount: 0,
      rows,
      aliases: [],
    });
    products.push(...compiled.products);
    estimatedMemoryBytes += compiled.estimatedMemoryBytes;
    if (offset + chunkSize < payload.rows.length) await yieldControl();
  }

  const compiledAliases = compileCatalogClientIndex({
    ...payload,
    productCount: 0,
    rows: [],
  });
  estimatedMemoryBytes += compiledAliases.estimatedMemoryBytes;
  if (estimatedMemoryBytes > CATALOG_CLIENT_INDEX_MAX_MEMORY_BYTES) {
    throw new Error("Catalog client index exceeds the memory budget.");
  }
  return {
    version: payload.version,
    snapshotHash: payload.snapshotHash,
    productCount: payload.productCount,
    aliasCount: payload.aliasCount,
    estimatedMemoryBytes,
    products,
    aliases: compiledAliases.aliases,
  };
}

export interface CatalogClientIndexWorkerLike {
  onmessage:
    | ((event: MessageEvent<CatalogClientIndexWorkerResponse>) => void)
    | null;
  onerror: ((event: Event) => void) | null;
  postMessage(payload: CatalogClientIndexPayload): void;
  terminate(): void;
}

export type CatalogClientIndexWorkerFactory =
  () => CatalogClientIndexWorkerLike;

function createCatalogClientIndexWorker(): CatalogClientIndexWorkerLike {
  return new Worker(
    new URL("./catalog-client-index.worker.ts", import.meta.url),
    { type: "module" },
  ) as unknown as CatalogClientIndexWorkerLike;
}

export async function compileCatalogClientIndexOffMainThread(
  payload: CatalogClientIndexPayload,
  signal?: AbortSignal,
  workerFactory?: CatalogClientIndexWorkerFactory,
): Promise<CompiledCatalogClientIndex> {
  if (signal?.aborted) {
    throw new DOMException("Catalog index compilation aborted.", "AbortError");
  }
  const factory =
    workerFactory ??
    (typeof Worker === "undefined" ? null : createCatalogClientIndexWorker);
  if (!factory) return compileCatalogClientIndexCooperatively(payload);

  let worker: CatalogClientIndexWorkerLike;
  try {
    worker = factory();
  } catch {
    return compileCatalogClientIndexCooperatively(payload);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new DOMException("Catalog index compilation aborted.", "AbortError"),
      );
    };
    worker.onmessage = (event) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (event.data.status === "ready") {
        resolve(event.data.index);
      } else {
        reject(new Error("Catalog index worker rejected the payload."));
      }
    };
    worker.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      void compileCatalogClientIndexCooperatively(payload).then(
        resolve,
        reject,
      );
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      worker.postMessage(payload);
    } catch (error) {
      settled = true;
      cleanup();
      reject(error);
    }
  });
}
export interface CatalogClientIndexSearchWorkerLike {
  onmessage:
    | ((event: MessageEvent<CatalogClientIndexWorkerResponse>) => void)
    | null;
  onerror: ((event: Event) => void) | null;
  postMessage(payload: CatalogClientIndexWorkerRequest): void;
  terminate(): void;
}

export type CatalogClientIndexSearchWorkerFactory =
  () => CatalogClientIndexSearchWorkerLike;

export interface CatalogClientIndexNormalizedSearcher {
  search(
    query: string,
    options?: CatalogClientIndexSearchOptions,
  ): Promise<CatalogNormalizedSearchResult>;
  terminate(): void;
}

function createCatalogClientIndexSearchWorker(): CatalogClientIndexSearchWorkerLike {
  return new Worker(
    new URL("./catalog-client-index.worker.ts", import.meta.url),
    { type: "module" },
  ) as unknown as CatalogClientIndexSearchWorkerLike;
}

function inProcessNormalizedSearcher(
  index: CompiledCatalogClientIndex,
): CatalogClientIndexNormalizedSearcher {
  return {
    search: async (query, options) =>
      normalizeAndSearchCatalogClientIndex(index, query, options),
    terminate: () => undefined,
  };
}

function createInitializedCatalogClientIndexNormalizedSearcher(
  index: CompiledCatalogClientIndex,
  workerFactory?: CatalogClientIndexSearchWorkerFactory,
): CatalogClientIndexNormalizedSearcher {
  const factory =
    workerFactory ??
    (typeof Worker === "undefined"
      ? null
      : createCatalogClientIndexSearchWorker);
  if (!factory) return inProcessNormalizedSearcher(index);

  let worker: CatalogClientIndexSearchWorkerLike;
  try {
    worker = factory();
  } catch {
    return inProcessNormalizedSearcher(index);
  }

  let requestId = 0;
  let readySettled = false;
  let resolveReady: () => void = () => undefined;
  let rejectReady: (error: Error) => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const pending = new Map<
    number,
    {
      resolve: (result: CatalogNormalizedSearchResult) => void;
      reject: (error: Error) => void;
    }
  >();
  const fail = (error: Error) => {
    if (!readySettled) {
      readySettled = true;
      rejectReady(error);
    }
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };

  worker.onmessage = (event) => {
    const message = event.data;
    if (message.status === "search-ready") {
      if (!readySettled) {
        readySettled = true;
        resolveReady();
      }
      return;
    }
    if (message.status === "search-result") {
      const request = pending.get(message.requestId);
      if (!request) return;
      pending.delete(message.requestId);
      request.resolve(message.result);
      return;
    }
    if (message.status === "error") {
      if (message.requestId !== undefined) {
        const request = pending.get(message.requestId);
        if (request) {
          pending.delete(message.requestId);
          request.reject(new Error("Catalog normalized search failed."));
        }
        return;
      }
      fail(new Error("Catalog search Worker initialization failed."));
    }
  };
  worker.onerror = () => fail(new Error("Catalog search Worker failed."));

  try {
    worker.postMessage({ type: "initialize-search", index });
  } catch {
    worker.terminate();
    return inProcessNormalizedSearcher(index);
  }

  return {
    async search(query, options) {
      await ready;
      requestId += 1;
      const activeRequestId = requestId;
      return new Promise<CatalogNormalizedSearchResult>((resolve, reject) => {
        pending.set(activeRequestId, { resolve, reject });
        try {
          worker.postMessage({
            type: "search",
            requestId: activeRequestId,
            query,
            options,
          });
        } catch (error) {
          pending.delete(activeRequestId);
          reject(
            error instanceof Error
              ? error
              : new Error("Catalog normalized search could not start."),
          );
        }
      });
    },
    terminate() {
      worker.terminate();
      fail(new Error("Catalog search Worker terminated."));
    },
  };
}

export function createCatalogClientIndexNormalizedSearcher(
  index: CompiledCatalogClientIndex,
  workerFactory?: CatalogClientIndexSearchWorkerFactory,
): CatalogClientIndexNormalizedSearcher {
  let initialized: CatalogClientIndexNormalizedSearcher | null = null;
  const getInitialized = () => {
    initialized ??= createInitializedCatalogClientIndexNormalizedSearcher(
      index,
      workerFactory,
    );
    return initialized;
  };

  return {
    async search(query, options) {
      // Cloning the 9 MB compiled index into a persistent Worker can occupy a
      // throttled mobile CPU for hundreds of milliseconds. Yield one task so
      // React can commit the synchronous exact result and its TTFR effect
      // before initializing the correction layer.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      return getInitialized().search(query, options);
    },
    terminate() {
      initialized?.terminate();
      initialized = null;
    },
  };
}
function waitForCatalogClientIndexRefreshWindow(
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Catalog index refresh aborted.", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Catalog index refresh aborted.", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, CATALOG_CLIENT_INDEX_REFRESH_DELAY_MS);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function deferCatalogClientIndexFetcher(
  fetcher: CatalogClientIndexFetcher,
): CatalogClientIndexFetcher {
  return async (activeSnapshotHash, signal) => {
    if (!activeSnapshotHash) {
      return fetcher(activeSnapshotHash, signal);
    }
    await waitForCatalogClientIndexRefreshWindow(signal);
    return fetcher(activeSnapshotHash, signal);
  };
}
interface CatalogClientIndexContextValue {
  status: CatalogClientIndexStatus;
  source: CatalogClientIndexSource | null;
  isRefreshing: boolean;
  isStale: boolean;
  productCount: number;
  snapshotHash: string | null;
  estimatedMemoryBytes: number;
  normalizationReady: boolean;
  search(
    query: string,
    options?: CatalogClientIndexSearchOptions,
  ): CatalogClientIndexSearchResult;
  normalizeAndSearch(
    query: string,
    options?: CatalogClientIndexSearchOptions,
  ): Promise<CatalogNormalizedSearchResult>;
}

const EMPTY_RESULT: CatalogClientIndexSearchResult = {
  query: "",
  total: 0,
  items: [],
  durationMs: 0,
};

const CatalogClientIndexContext =
  createContext<CatalogClientIndexContextValue | null>(null);

function payloadFromUnknown(input: unknown): CatalogClientIndexPayload {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Catalog client index response is invalid.");
  }
  const value = input as Record<string, unknown>;
  if (
    value.version !== CATALOG_CLIENT_INDEX_VERSION ||
    typeof value.snapshotHash !== "string" ||
    typeof value.generatedAt !== "string" ||
    typeof value.productCount !== "number" ||
    typeof value.aliasCount !== "number" ||
    !Array.isArray(value.rows) ||
    !value.rows.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 6 &&
        row.every((field) => typeof field === "string"),
    ) ||
    !Array.isArray(value.aliases) ||
    !value.aliases.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 2 &&
        row.every((field) => typeof field === "string"),
    )
  ) {
    throw new Error("Catalog client index response is invalid.");
  }
  const payload: CatalogClientIndexPayload = {
    version: CATALOG_CLIENT_INDEX_VERSION,
    snapshotHash: value.snapshotHash,
    generatedAt: value.generatedAt,
    productCount: value.productCount,
    aliasCount: value.aliasCount,
    rows: value.rows as CatalogClientIndexRow[],
    aliases: value.aliases as CatalogClientIndexAliasRow[],
  };
  if (
    !Number.isFinite(Date.parse(payload.generatedAt)) ||
    catalogClientIndexWireBytes(payload) > CATALOG_CLIENT_INDEX_MAX_WIRE_BYTES
  ) {
    throw new Error("Catalog client index response exceeds safety bounds.");
  }
  return payload;
}

export async function fetchCatalogClientIndex(
  activeSnapshotHash: string | null,
  signal?: AbortSignal,
): Promise<CatalogClientIndexPayload | null> {
  const response = await fetch(getGetCatalogClientIndexUrl(), {
    credentials: "same-origin",
    headers: activeSnapshotHash
      ? { "If-None-Match": `"${activeSnapshotHash}"` }
      : undefined,
    signal,
  });
  if (response.status === 304) return null;
  if (!response.ok)
    throw new Error(
      `Catalog client index request failed (${response.status}).`,
    );
  return payloadFromUnknown(await response.json());
}

export type CatalogClientIndexCompiler = (
  payload: CatalogClientIndexPayload,
  signal?: AbortSignal,
) => Promise<CompiledCatalogClientIndex>;

export async function refreshCatalogClientIndex(
  storage: CatalogClientIndexStorage,
  fetcher: CatalogClientIndexFetcher,
  onCached?: (index: CompiledCatalogClientIndex) => void,
  signal?: AbortSignal,
  compiler: CatalogClientIndexCompiler = compileCatalogClientIndexOffMainThread,
): Promise<CatalogClientIndexRefreshResult> {
  let cachedIndex: CompiledCatalogClientIndex | null = null;
  try {
    cachedIndex = await storage.readActive();
    if (cachedIndex) onCached?.(cachedIndex);
  } catch {
    cachedIndex = null;
  }

  try {
    const remotePayload = await fetcher(
      cachedIndex?.snapshotHash ?? null,
      signal,
    );
    if (!remotePayload) {
      if (!cachedIndex)
        throw new Error("Server returned not-modified without a cached index.");
      return {
        index: cachedIndex,
        source: "cache",
        stale: false,
        persistenceAvailable: true,
        cold: false,
        indexBuildMs: 0,
        serializedIndexBytes: cachedIndex.estimatedMemoryBytes,
      };
    }
    const compileStartedAt = performance.now();
    const remoteIndex = await compiler(remotePayload, signal);
    const indexBuildMs = performance.now() - compileStartedAt;
    let persistenceAvailable = true;
    try {
      await storage.writeAndActivate(remoteIndex);
    } catch {
      persistenceAvailable = false;
    }
    return {
      index: remoteIndex,
      source: "network",
      stale: false,
      persistenceAvailable,
      cold: !cachedIndex,
      indexBuildMs,
      serializedIndexBytes: remoteIndex.estimatedMemoryBytes,
    };
  } catch (error) {
    if (cachedIndex) {
      return {
        index: cachedIndex,
        source: "cache",
        stale: true,
        persistenceAvailable: true,
        cold: false,
        indexBuildMs: 0,
        serializedIndexBytes: cachedIndex.estimatedMemoryBytes,
      };
    }
    throw error;
  }
}

export function CatalogClientIndexProvider({
  children,
}: {
  children: ReactNode;
}) {
  const auth = useAuth();
  const storage = useMemo(() => createIndexedDbCatalogIndexStorage(), []);
  const [status, setStatus] = useState<CatalogClientIndexStatus>("idle");
  const [index, setIndex] = useState<CompiledCatalogClientIndex | null>(null);
  const [source, setSource] = useState<CatalogClientIndexSource | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [normalizedSearcher, setNormalizedSearcher] =
    useState<CatalogClientIndexNormalizedSearcher | null>(null);

  useEffect(() => {
    if (!auth.canUseReference) {
      setStatus("idle");
      setIndex(null);
      setSource(null);
      setIsRefreshing(false);
      setIsStale(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setStatus("loading");
    setIsRefreshing(true);
    void refreshCatalogClientIndex(
      storage,
      deferCatalogClientIndexFetcher(fetchCatalogClientIndex),
      (cached) => {
        if (!active) return;
        setIndex(cached);
        setSource("cache");
        setStatus("ready");
        markIndexReady({
          catalogSize: cached.productCount,
          indexBuildMs: 0,
          serializedIndexBytes: cached.estimatedMemoryBytes,
          cold: false,
        });
      },
      controller.signal,
    )
      .then((result) => {
        if (!active) return;
        setIndex(result.index);
        setSource(result.source);
        setIsStale(result.stale);
        setStatus("ready");
        markIndexReady({
          catalogSize: result.index.productCount,
          indexBuildMs: result.indexBuildMs,
          serializedIndexBytes: result.serializedIndexBytes,
          cold: result.cold,
        });
      })
      .catch(() => {
        if (!active) return;
        setStatus("error");
      })
      .finally(() => {
        if (active) setIsRefreshing(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [auth.canUseReference, storage]);

  useEffect(() => {
    if (!index) {
      setNormalizedSearcher(null);
      return;
    }
    const searcher = createCatalogClientIndexNormalizedSearcher(index);
    setNormalizedSearcher(searcher);
    return () => searcher.terminate();
  }, [index]);
  const search = useCallback(
    (query: string, options?: CatalogClientIndexSearchOptions) => {
      return index
        ? searchCatalogClientIndex(index, query, options)
        : { ...EMPTY_RESULT, query };
    },
    [index],
  );

  const normalizeAndSearch = useCallback(
    (query: string, options?: CatalogClientIndexSearchOptions) => {
      if (!index) {
        return Promise.resolve<CatalogNormalizedSearchResult>({
          query,
          primary: [],
          suggested: [],
          durationMs: 0,
        });
      }
      return normalizedSearcher
        ? normalizedSearcher.search(query, options)
        : Promise.resolve<CatalogNormalizedSearchResult>({
            query,
            primary: [],
            suggested: [],
            durationMs: 0,
          });
    },
    [index, normalizedSearcher],
  );

  const value = useMemo<CatalogClientIndexContextValue>(
    () => ({
      status,
      source,
      isRefreshing,
      isStale,
      productCount: index?.productCount ?? 0,
      snapshotHash: index?.snapshotHash ?? null,
      estimatedMemoryBytes: index?.estimatedMemoryBytes ?? 0,
      normalizationReady: Boolean(normalizedSearcher),
      search,
      normalizeAndSearch,
    }),
    [
      index,
      isRefreshing,
      isStale,
      normalizeAndSearch,
      normalizedSearcher,
      search,
      source,
      status,
    ],
  );

  return (
    <CatalogClientIndexContext.Provider value={value}>
      {children}
    </CatalogClientIndexContext.Provider>
  );
}

export function catalogCorrectionFallbackQuery(
  query: string,
  directResultCount: number,
): string {
  return directResultCount > 0 ? "" : query.trim();
}

export function useCatalogClientNormalizedSearch(
  query: string,
  options: CatalogClientIndexSearchOptions = {},
  directResultCount = 0,
): CatalogNormalizedSearchResult | null {
  const catalog = useCatalogClientIndex();
  const correctionQuery = catalogCorrectionFallbackQuery(
    query,
    directResultCount,
  );
  const limit = options.limit;
  const form = options.form;
  const strength = options.strength;
  const compositionType = options.compositionType;
  const scope = options.scope;
  const requestKey = [
    correctionQuery,
    limit ?? "",
    form ?? "",
    strength ?? "",
    compositionType ?? "",
    scope ?? "",
  ].join("\u0000");
  const [resolved, setResolved] = useState<{
    key: string;
    result: CatalogNormalizedSearchResult;
  } | null>(null);

  useEffect(() => {
    if (
      catalog.status !== "ready" ||
      !catalog.normalizationReady ||
      !correctionQuery
    ) {
      setResolved(null);
      return;
    }
    let active = true;
    void catalog
      .normalizeAndSearch(correctionQuery, {
        limit,
        form,
        strength,
        compositionType,
        scope,
      })
      .then((result) => {
        if (active) setResolved({ key: requestKey, result });
      })
      .catch(() => {
        if (active) setResolved(null);
      });
    return () => {
      active = false;
    };
  }, [
    catalog,
    compositionType,
    correctionQuery,
    form,
    limit,
    requestKey,
    scope,
    strength,
  ]);

  return resolved?.key === requestKey ? resolved.result : null;
}
export function useCatalogClientIndex(): CatalogClientIndexContextValue {
  const value = useContext(CatalogClientIndexContext);
  if (!value)
    throw new Error(
      "useCatalogClientIndex must be used within CatalogClientIndexProvider",
    );
  return value;
}
