import {
  CATALOG_CLIENT_INDEX_MAX_ALIASES,
  CATALOG_CLIENT_INDEX_MAX_MEMORY_BYTES,
  CATALOG_CLIENT_INDEX_MAX_PRODUCTS,
  CATALOG_CLIENT_INDEX_VERSION,
  type CompiledCatalogClientIndex,
} from "@workspace/catalog-index";

const DATABASE_NAME = "farmassist-catalog-index";
const DATABASE_VERSION = 2;
const SNAPSHOT_STORE = "snapshots";
const META_STORE = "meta";
const ACTIVE_KEY = "active";
const STORAGE_RECORD_VERSION = 1;

interface ActiveRecord {
  key: typeof ACTIVE_KEY;
  snapshotHash: string;
}

interface PersistedCatalogClientIndexRecord {
  storageVersion: typeof STORAGE_RECORD_VERSION;
  snapshotHash: string;
  index: CompiledCatalogClientIndex;
}

export interface CatalogClientIndexStorage {
  readActive(): Promise<CompiledCatalogClientIndex | null>;
  writeAndActivate(index: CompiledCatalogClientIndex): Promise<void>;
}

const PRODUCT_STRING_FIELDS = [
  "productId",
  "registration",
  "tradeName",
  "inn",
  "form",
  "strength",
  "tradeKey",
  "innKey",
  "registrationKey",
  "productKey",
  "formKey",
  "strengthKey",
  "tradeLatinKey",
  "innLatinKey",
] as const;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function boundedString(value: unknown): value is string {
  return typeof value === "string" && value.length <= 1_000;
}

export function validatePersistedCatalogClientIndex(
  value: unknown,
): CompiledCatalogClientIndex | null {
  const record = objectValue(value);
  const index = objectValue(record?.index);
  if (
    record?.storageVersion !== STORAGE_RECORD_VERSION ||
    typeof record.snapshotHash !== "string" ||
    !index ||
    index.version !== CATALOG_CLIENT_INDEX_VERSION ||
    index.snapshotHash !== record.snapshotHash ||
    !/^[a-f0-9]{64}$/u.test(record.snapshotHash) ||
    !Array.isArray(index.products) ||
    !Array.isArray(index.aliases) ||
    index.productCount !== index.products.length ||
    index.aliasCount !== index.aliases.length ||
    index.productCount < 1 ||
    index.productCount > CATALOG_CLIENT_INDEX_MAX_PRODUCTS ||
    index.aliasCount > CATALOG_CLIENT_INDEX_MAX_ALIASES ||
    typeof index.estimatedMemoryBytes !== "number" ||
    !Number.isFinite(index.estimatedMemoryBytes) ||
    index.estimatedMemoryBytes < 1 ||
    index.estimatedMemoryBytes > CATALOG_CLIENT_INDEX_MAX_MEMORY_BYTES
  ) {
    return null;
  }

  const identities = new Set<string>();
  let estimatedMemoryBytes = 0;
  for (const candidate of index.products) {
    const product = objectValue(candidate);
    if (
      !product ||
      PRODUCT_STRING_FIELDS.some((field) => !boundedString(product[field])) ||
      typeof product.combination !== "boolean" ||
      !/^[A-F0-9]{32}$/u.test(String(product.productId)) ||
      !String(product.registration) ||
      (!String(product.tradeKey) &&
        !String(product.innKey) &&
        !String(product.registrationKey))
    ) {
      return null;
    }
    const identity =
      String(product.productId) + "|" + String(product.registration);
    if (identities.has(identity)) return null;
    identities.add(identity);
    estimatedMemoryBytes +=
      72 +
      PRODUCT_STRING_FIELDS.reduce(
        (total, field) => total + String(product[field]).length * 2,
        0,
      );
    if (estimatedMemoryBytes > CATALOG_CLIENT_INDEX_MAX_MEMORY_BYTES) {
      return null;
    }
  }

  for (const candidate of index.aliases) {
    const alias = objectValue(candidate);
    if (
      !alias ||
      !boundedString(alias.aliasKey) ||
      !boundedString(alias.aliasLatinKey) ||
      !boundedString(alias.targetInnLatinKey) ||
      !alias.aliasKey ||
      !alias.targetInnLatinKey
    ) {
      return null;
    }
    estimatedMemoryBytes +=
      32 +
      (alias.aliasKey.length +
        alias.aliasLatinKey.length +
        alias.targetInnLatinKey.length) *
        2;
    if (estimatedMemoryBytes > CATALOG_CLIENT_INDEX_MAX_MEMORY_BYTES) {
      return null;
    }
  }

  if (estimatedMemoryBytes !== index.estimatedMemoryBytes) return null;

  return index as unknown as CompiledCatalogClientIndex;
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
        const record = active?.snapshotHash
          ? await requestResult(
              transaction.objectStore(SNAPSHOT_STORE).get(active.snapshotHash),
            )
          : null;
        await transactionDone(transaction);
        return validatePersistedCatalogClientIndex(record);
      } finally {
        database.close();
      }
    },
    async writeAndActivate(index) {
      if (!factory) return;
      const record: PersistedCatalogClientIndexRecord = {
        storageVersion: STORAGE_RECORD_VERSION,
        snapshotHash: index.snapshotHash,
        index,
      };
      if (!validatePersistedCatalogClientIndex(record)) {
        throw new Error("Compiled catalog client index is invalid.");
      }
      const database = await openDatabase(factory);
      try {
        const transaction = database.transaction(
          [META_STORE, SNAPSHOT_STORE],
          "readwrite",
        );
        const snapshots = transaction.objectStore(SNAPSHOT_STORE);
        snapshots.put(record);
        transaction.objectStore(META_STORE).put({
          key: ACTIVE_KEY,
          snapshotHash: index.snapshotHash,
        } satisfies ActiveRecord);
        const cursorRequest = snapshots.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          if (cursor.key !== index.snapshotHash) cursor.delete();
          cursor.continue();
        };
        await transactionDone(transaction);
      } finally {
        database.close();
      }
    },
  };
}
