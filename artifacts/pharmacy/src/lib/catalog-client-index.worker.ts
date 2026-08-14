import {
  compileCatalogClientIndex,
  normalizeAndSearchCatalogClientIndex,
  type CatalogClientIndexPayload,
  type CatalogClientIndexSearchOptions,
  type CatalogNormalizedSearchResult,
  type CompiledCatalogClientIndex,
} from "@workspace/catalog-index";

export type CatalogClientIndexWorkerRequest =
  | CatalogClientIndexPayload
  | { type: "initialize-search"; index: CompiledCatalogClientIndex }
  | {
      type: "search";
      requestId: number;
      query: string;
      options?: CatalogClientIndexSearchOptions;
    };

export type CatalogClientIndexWorkerResponse =
  | { status: "ready"; index: CompiledCatalogClientIndex }
  | { status: "search-ready" }
  | {
      status: "search-result";
      requestId: number;
      result: CatalogNormalizedSearchResult;
    }
  | { status: "error"; requestId?: number };

const workerScope = self as unknown as {
  onmessage:
    | ((event: MessageEvent<CatalogClientIndexWorkerRequest>) => void)
    | null;
  postMessage(message: CatalogClientIndexWorkerResponse): void;
};

let searchIndex: CompiledCatalogClientIndex | null = null;

/** The single normalized query entry point owned by the Worker. */
function normalizeAndSearch(
  rawQuery: string,
  options?: CatalogClientIndexSearchOptions,
): CatalogNormalizedSearchResult {
  if (!searchIndex) throw new Error("Catalog search Worker is not ready.");
  return normalizeAndSearchCatalogClientIndex(searchIndex, rawQuery, options);
}

workerScope.onmessage = (event) => {
  const message = event.data;
  try {
    if ("type" in message && message.type === "initialize-search") {
      searchIndex = message.index;
      workerScope.postMessage({ status: "search-ready" });
      return;
    }
    if ("type" in message && message.type === "search") {
      workerScope.postMessage({
        status: "search-result",
        requestId: message.requestId,
        result: normalizeAndSearch(message.query, message.options),
      });
      return;
    }
    workerScope.postMessage({
      status: "ready",
      index: compileCatalogClientIndex(message as CatalogClientIndexPayload),
    });
  } catch {
    workerScope.postMessage({
      status: "error",
      ...(typeof message === "object" &&
      message !== null &&
      "requestId" in message &&
      typeof message.requestId === "number"
        ? { requestId: message.requestId }
        : {}),
    });
  }
};

export {};
