import { describe, expect, it } from "vitest";
import type { ProductCardInstruction } from "@workspace/api-client-react";
import {
  INSTRUCTION_CACHE_LIMIT,
  readCachedInstruction,
  retainRecentInstructionCache,
  writeInstructionCache,
  type InstructionCacheRecord,
  type InstructionCacheStore,
} from "./instruction-cache";

class MemoryInstructionCacheStore implements InstructionCacheStore {
  records = new Map<string, InstructionCacheRecord>();

  async get(productId: string) {
    return this.records.get(productId) ?? null;
  }

  async put(record: InstructionCacheRecord) {
    this.records.set(record.productId, record);
    const retained = retainRecentInstructionCache([...this.records.values()]);
    this.records = new Map(retained.map((item) => [item.productId, item]));
  }

  async list() {
    return retainRecentInstructionCache([...this.records.values()]);
  }
}

function instruction(
  overrides: Partial<ProductCardInstruction> = {},
): ProductCardInstruction {
  return {
    available: true,
    sourceStatus: "structured",
    sections: {
      indications: "Показання.",
      contraindications: null,
      adverseReactions: null,
      interactions: null,
      specialWarnings: null,
      pregnancyAndLactation: null,
      administration: null,
      overdose: null,
      storage: null,
    },
    administrationFacts: null,
    source: {
      url: "https://example.gov.ua/doc",
      documentId: "A".repeat(32),
      documentDate: "2026-07-01T00:00:00.000Z",
      checkedAt: "2026-07-02T00:00:00.000Z",
      documentHash: "a".repeat(64),
      contentLength: 1000,
      parserVersion: "ua-drlz-mht-v2",
      datasetTitle: "State Register of Medicines of Ukraine",
      datasetUrl: "https://data.gov.ua/dataset/example",
      license: "CC-BY-4.0",
    },
    provenance: {
      sourceAllowed: true,
      registrationMatched: true,
      contentLocationMatched: true,
      availableSectionCount: 9,
      coveragePct: 100,
    },
    warnings: [],
    ...overrides,
  } as ProductCardInstruction;
}

function record(
  productId: string,
  lastAccessedAt: number,
): InstructionCacheRecord {
  return {
    productId,
    instruction: instruction(),
    productTradeName: "Тестовий препарат",
    registrationNumber: "UA/10001/01/01",
    documentHash: "a".repeat(64),
    cachedAt: lastAccessedAt,
    lastAccessedAt,
  };
}

describe("instruction cache", () => {
  it("retains only the most recently accessed 200 records", () => {
    const retained = retainRecentInstructionCache(
      Array.from({ length: 205 }, (_, index) =>
        record(`product-${index}`, index),
      ),
    );
    expect(retained).toHaveLength(INSTRUCTION_CACHE_LIMIT);
    expect(retained[0]?.productId).toBe("product-204");
    expect(retained.at(-1)?.productId).toBe("product-5");
  });

  it("deduplicates by productId, keeping a single record per key", () => {
    const retained = retainRecentInstructionCache([
      record("product-a", 1),
      record("product-a", 2),
    ]);
    expect(retained).toHaveLength(1);
    expect(retained[0]?.lastAccessedAt).toBe(2);
  });

  const identity = {
    productTradeName: "Тестовий препарат",
    registrationNumber: "UA/10001/01/01",
  };

  it("writes an instruction and reads it back with the document hash", async () => {
    const store = new MemoryInstructionCacheStore();
    await writeInstructionCache(
      store,
      "product-a",
      instruction(),
      identity,
      () => 100,
    );

    const cached = await readCachedInstruction(
      store,
      "product-a",
      () => 200,
    );
    expect(cached?.instruction.sections?.indications).toBe("Показання.");
    expect(cached?.documentHash).toBe("a".repeat(64));
    expect(cached?.productTradeName).toBe("Тестовий препарат");
    expect(cached?.registrationNumber).toBe("UA/10001/01/01");
    expect(cached?.cachedAt).toBe(100);
  });

  it("touches lastAccessedAt on a cache-hit read, keeping the record warm", async () => {
    const store = new MemoryInstructionCacheStore();
    await writeInstructionCache(
      store,
      "product-a",
      instruction(),
      identity,
      () => 100,
    );

    await readCachedInstruction(store, "product-a", () => 500);
    const stored = await store.get("product-a");
    expect(stored?.lastAccessedAt).toBe(500);
  });

  it("returns null on a cache miss without throwing", async () => {
    const store = new MemoryInstructionCacheStore();
    const cached = await readCachedInstruction(store, "unknown-product");
    expect(cached).toBeNull();
  });

  it("swallows store failures on write so the tab never breaks", async () => {
    const failingStore: InstructionCacheStore = {
      async get() {
        throw new Error("blocked");
      },
      async put() {
        throw new Error("blocked");
      },
      async list() {
        throw new Error("blocked");
      },
    };

    await expect(
      writeInstructionCache(failingStore, "product-a", instruction(), {
        productTradeName: "Тестовий препарат",
        registrationNumber: "UA/10001/01/01",
      }),
    ).resolves.toBeUndefined();
    await expect(
      readCachedInstruction(failingStore, "product-a"),
    ).resolves.toBeNull();
  });
});
