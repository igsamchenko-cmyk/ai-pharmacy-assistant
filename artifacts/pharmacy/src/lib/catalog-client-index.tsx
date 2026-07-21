import {
  CATALOG_CLIENT_INDEX_MAX_ALIASES,
  CATALOG_CLIENT_INDEX_MAX_MEMORY_BYTES,
  CATALOG_CLIENT_INDEX_MAX_PRODUCTS,
  CATALOG_CLIENT_INDEX_MAX_WIRE_BYTES,
  CATALOG_CLIENT_INDEX_VERSION,
  catalogClientIndexWireBytes,
  compileCatalogClientIndex,
  searchCatalogClientIndex,
  type CatalogClientIndexAliasRow,
  type CatalogClientIndexPayload,
  type CatalogClientIndexRow,
  type CatalogClientIndexSearchOptions,
  type CatalogClientIndexSearchResult,
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

export type CatalogClientIndexStatus = "idle" | "loading" | "ready" | "error";
export type CatalogClientIndexSource = "cache" | "network";

export interface CatalogClientIndexRefreshResult {
  index: CompiledCatalogClientIndex;
  source: CatalogClientIndexSource;
  stale: boolean;
  persistenceAvailable: boolean;
}

export type CatalogClientIndexFetcher = (
  activeSnapshotHash: string | null,
  signal?: AbortSignal,
) => Promise<CatalogClientIndexPayload | null>;

export const CATALOG_CLIENT_INDEX_INITIAL_FETCH_DELAY_MS = 6_000;
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

function waitForCatalogClientIndexBackgroundWindow(
  activeSnapshotHash: string | null,
  signal?: AbortSignal,
): Promise<void> {
  const delayMs = activeSnapshotHash
    ? CATALOG_CLIENT_INDEX_REFRESH_DELAY_MS
    : CATALOG_CLIENT_INDEX_INITIAL_FETCH_DELAY_MS;
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
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function deferCatalogClientIndexFetcher(
  fetcher: CatalogClientIndexFetcher,
): CatalogClientIndexFetcher {
  return async (activeSnapshotHash, signal) => {
    await waitForCatalogClientIndexBackgroundWindow(activeSnapshotHash, signal);
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
  search(
    query: string,
    options?: CatalogClientIndexSearchOptions,
  ): CatalogClientIndexSearchResult;
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

export async function refreshCatalogClientIndex(
  storage: CatalogClientIndexStorage,
  fetcher: CatalogClientIndexFetcher,
  onCached?: (index: CompiledCatalogClientIndex) => void,
  signal?: AbortSignal,
): Promise<CatalogClientIndexRefreshResult> {
  let cachedPayload: CatalogClientIndexPayload | null = null;
  let cachedIndex: CompiledCatalogClientIndex | null = null;
  try {
    cachedPayload = await storage.readActive();
    if (cachedPayload) {
      cachedIndex = await compileCatalogClientIndexCooperatively(cachedPayload);
      onCached?.(cachedIndex);
    }
  } catch {
    cachedPayload = null;
    cachedIndex = null;
  }

  try {
    const remotePayload = await fetcher(
      cachedPayload?.snapshotHash ?? null,
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
      };
    }
    const remoteIndex =
      await compileCatalogClientIndexCooperatively(remotePayload);
    let persistenceAvailable = true;
    try {
      await storage.writeAndActivate(remotePayload);
    } catch {
      persistenceAvailable = false;
    }
    return {
      index: remoteIndex,
      source: "network",
      stale: false,
      persistenceAvailable,
    };
  } catch (error) {
    if (cachedIndex) {
      return {
        index: cachedIndex,
        source: "cache",
        stale: true,
        persistenceAvailable: true,
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

  useEffect(() => {
    if (!auth.isAuthenticated) {
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
      },
      controller.signal,
    )
      .then((result) => {
        if (!active) return;
        setIndex(result.index);
        setSource(result.source);
        setIsStale(result.stale);
        setStatus("ready");
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
  }, [auth.isAuthenticated, storage]);

  const search = useCallback(
    (query: string, options?: CatalogClientIndexSearchOptions) => {
      return index
        ? searchCatalogClientIndex(index, query, options)
        : { ...EMPTY_RESULT, query };
    },
    [index],
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
      search,
    }),
    [index, isRefreshing, isStale, search, source, status],
  );

  return (
    <CatalogClientIndexContext.Provider value={value}>
      {children}
    </CatalogClientIndexContext.Provider>
  );
}

export function useCatalogClientIndex(): CatalogClientIndexContextValue {
  const value = useContext(CatalogClientIndexContext);
  if (!value)
    throw new Error(
      "useCatalogClientIndex must be used within CatalogClientIndexProvider",
    );
  return value;
}
