import type { CatalogClientIndexPayload } from "@workspace/catalog-index";

const DATABASE_NAME = "farmassist-catalog-index";
const DATABASE_VERSION = 1;
const SNAPSHOT_STORE = "snapshots";
const META_STORE = "meta";
const ACTIVE_KEY = "active";

interface ActiveRecord {
  key: typeof ACTIVE_KEY;
  snapshotHash: string;
}

export interface CatalogClientIndexStorage {
  readActive(): Promise<CatalogClientIndexPayload | null>;
  writeAndActivate(payload: CatalogClientIndexPayload): Promise<void>;
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

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
        database.createObjectStore(SNAPSHOT_STORE, { keyPath: "snapshotHash" });
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB open failed."));
  });
}

export function createIndexedDbCatalogIndexStorage(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): CatalogClientIndexStorage {
  return {
    async readActive() {
      if (!factory) return null;
      const database = await openDatabase(factory);
      try {
        const transaction = database.transaction(
          [META_STORE, SNAPSHOT_STORE],
          "readonly",
        );
        const active = (await requestResult(
          transaction.objectStore(META_STORE).get(ACTIVE_KEY),
        )) as ActiveRecord | undefined;
        if (!active?.snapshotHash) return null;
        const payload = (await requestResult(
          transaction.objectStore(SNAPSHOT_STORE).get(active.snapshotHash),
        )) as CatalogClientIndexPayload | undefined;
        await transactionDone(transaction);
        return payload ?? null;
      } finally {
        database.close();
      }
    },
    async writeAndActivate(payload) {
      if (!factory) return;
      const database = await openDatabase(factory);
      try {
        const transaction = database.transaction(
          [META_STORE, SNAPSHOT_STORE],
          "readwrite",
        );
        const snapshots = transaction.objectStore(SNAPSHOT_STORE);
        snapshots.put(payload);
        transaction.objectStore(META_STORE).put({
          key: ACTIVE_KEY,
          snapshotHash: payload.snapshotHash,
        } satisfies ActiveRecord);
        const cursorRequest = snapshots.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          if (cursor.key !== payload.snapshotHash) cursor.delete();
          cursor.continue();
        };
        await transactionDone(transaction);
      } finally {
        database.close();
      }
    },
  };
}
