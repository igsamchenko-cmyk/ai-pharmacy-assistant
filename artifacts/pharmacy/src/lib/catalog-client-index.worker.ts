import {
  compileCatalogClientIndex,
  type CatalogClientIndexPayload,
  type CompiledCatalogClientIndex,
} from "@workspace/catalog-index";

export type CatalogClientIndexWorkerResponse =
  | { status: "ready"; index: CompiledCatalogClientIndex }
  | { status: "error" };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<CatalogClientIndexPayload>) => void) | null;
  postMessage(message: CatalogClientIndexWorkerResponse): void;
};

workerScope.onmessage = (event) => {
  try {
    workerScope.postMessage({
      status: "ready",
      index: compileCatalogClientIndex(event.data),
    });
  } catch {
    workerScope.postMessage({ status: "error" });
  }
};

export {};
