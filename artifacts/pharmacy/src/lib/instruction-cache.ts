import type { ProductCardInstruction } from "@workspace/api-client-react";
import {
  INSTRUCTION_CACHE_STORE,
  openCatalogIndexDatabase,
} from "@/lib/catalog-index-db";

export const INSTRUCTION_CACHE_LIMIT = 200;

export interface InstructionCacheRecord {
  productId: string;
  instruction: ProductCardInstruction;
  /** Denormalized so a cached instruction can render before the full
   * product card (identity included) has resolved from the network. */
  productTradeName: string;
  registrationNumber: string;
  documentHash: string | null;
  cachedAt: number;
  lastAccessedAt: number;
}

export interface InstructionCacheStore {
  get(productId: string): Promise<InstructionCacheRecord | null>;
  put(record: InstructionCacheRecord): Promise<void>;
  list(): Promise<InstructionCacheRecord[]>;
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

/**
 * Keeps the most recently accessed instruction records, LRU-evicting the
 * rest once `limit` is exceeded. A record's recency is its
 * `lastAccessedAt`, which callers bump both on cache writes and cache-hit
 * reads so that instructions a pharmacist keeps reopening stay warm.
 */
export function retainRecentInstructionCache(
  records: readonly InstructionCacheRecord[],
  limit = INSTRUCTION_CACHE_LIMIT,
): InstructionCacheRecord[] {
  const byId = new Map(records.map((record) => [record.productId, record]));
  return [...byId.values()]
    .sort(
      (left, right) =>
        right.lastAccessedAt - left.lastAccessedAt ||
        right.productId.localeCompare(left.productId),
    )
    .slice(0, Math.max(0, limit));
}

export function createIndexedDbInstructionCacheStore(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): InstructionCacheStore {
  return {
    async get(productId) {
      if (!factory) return null;
      const database = await openCatalogIndexDatabase(factory);
      try {
        const transaction = database.transaction(
          INSTRUCTION_CACHE_STORE,
          "readonly",
        );
        const record = (await requestResult(
          transaction.objectStore(INSTRUCTION_CACHE_STORE).get(productId),
        )) as InstructionCacheRecord | undefined;
        await transactionDone(transaction);
        return record ?? null;
      } finally {
        database.close();
      }
    },
    async put(record) {
      if (!factory) return;
      const database = await openCatalogIndexDatabase(factory);
      try {
        const readTransaction = database.transaction(
          INSTRUCTION_CACHE_STORE,
          "readonly",
        );
        const current = (await requestResult(
          readTransaction.objectStore(INSTRUCTION_CACHE_STORE).getAll(),
        )) as InstructionCacheRecord[];
        await transactionDone(readTransaction);
        const retained = retainRecentInstructionCache(
          [...current.filter((item) => item.productId !== record.productId), record],
          INSTRUCTION_CACHE_LIMIT,
        );
        const retainedIds = new Set(retained.map((item) => item.productId));
        const writeTransaction = database.transaction(
          INSTRUCTION_CACHE_STORE,
          "readwrite",
        );
        const store = writeTransaction.objectStore(INSTRUCTION_CACHE_STORE);
        if (retainedIds.has(record.productId)) store.put(record);
        for (const item of current) {
          if (!retainedIds.has(item.productId)) store.delete(item.productId);
        }
        await transactionDone(writeTransaction);
      } finally {
        database.close();
      }
    },
    async list() {
      if (!factory) return [];
      const database = await openCatalogIndexDatabase(factory);
      try {
        const transaction = database.transaction(
          INSTRUCTION_CACHE_STORE,
          "readonly",
        );
        const records = (await requestResult(
          transaction.objectStore(INSTRUCTION_CACHE_STORE).getAll(),
        )) as InstructionCacheRecord[];
        await transactionDone(transaction);
        return retainRecentInstructionCache(records, INSTRUCTION_CACHE_LIMIT);
      } finally {
        database.close();
      }
    },
  };
}

let sharedStore: InstructionCacheStore | null = null;

export function getInstructionCacheStore(): InstructionCacheStore {
  if (!sharedStore) sharedStore = createIndexedDbInstructionCacheStore();
  return sharedStore;
}

/**
 * Reads a cached instruction and, on a hit, touches `lastAccessedAt` so the
 * record stays warm under LRU eviction. Failures (private browsing,
 * disabled storage, corrupted DB) resolve to `null` — a cache miss must
 * never block or break the instruction tab.
 */
export async function readCachedInstruction(
  store: InstructionCacheStore,
  productId: string,
  now: () => number = Date.now,
): Promise<InstructionCacheRecord | null> {
  try {
    const record = await store.get(productId);
    if (!record) return null;
    const touched = { ...record, lastAccessedAt: now() };
    void store.put(touched).catch(() => undefined);
    return touched;
  } catch {
    return null;
  }
}

export async function writeInstructionCache(
  store: InstructionCacheStore,
  productId: string,
  instruction: ProductCardInstruction,
  identity: { productTradeName: string; registrationNumber: string },
  now: () => number = Date.now,
): Promise<void> {
  try {
    const timestamp = now();
    await store.put({
      productId,
      instruction,
      productTradeName: identity.productTradeName,
      registrationNumber: identity.registrationNumber,
      documentHash: instruction.source?.documentHash ?? null,
      cachedAt: timestamp,
      lastAccessedAt: timestamp,
    });
  } catch {
    // A blocked or failing cache must never prevent the instruction tab
    // from rendering the freshly fetched card data.
  }
}
