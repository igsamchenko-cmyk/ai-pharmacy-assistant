export const CATALOG_INDEX_DATABASE_NAME = "farmassist-catalog-index";
export const CATALOG_INDEX_DATABASE_VERSION = 3;
export const CATALOG_INDEX_SNAPSHOT_STORE = "snapshots";
export const CATALOG_INDEX_META_STORE = "meta";
export const SEARCH_METRICS_STORE = "perf_metrics";

export function openCatalogIndexDatabase(
  factory: IDBFactory,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(
      CATALOG_INDEX_DATABASE_NAME,
      CATALOG_INDEX_DATABASE_VERSION,
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CATALOG_INDEX_SNAPSHOT_STORE)) {
        database.createObjectStore(CATALOG_INDEX_SNAPSHOT_STORE, {
          keyPath: "snapshotHash",
        });
      }
      if (!database.objectStoreNames.contains(CATALOG_INDEX_META_STORE)) {
        database.createObjectStore(CATALOG_INDEX_META_STORE, {
          keyPath: "key",
        });
      }
      if (!database.objectStoreNames.contains(SEARCH_METRICS_STORE)) {
        database.createObjectStore(SEARCH_METRICS_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB open failed."));
  });
}
