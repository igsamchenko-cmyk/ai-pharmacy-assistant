import {
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
      cachedIndex = compileCatalogClientIndex(cachedPayload);
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
    const remoteIndex = compileCatalogClientIndex(remotePayload);
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
      fetchCatalogClientIndex,
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
