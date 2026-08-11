import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { loadInstructionSources } from "../knowledge/instructions/catalog";
import { getInstructionForProduct } from "../knowledge/instructions/catalog";
import { warmInstructionSearchIndex } from "../services/instructionSearchService";

const originalEnv = { ...process.env };

async function withServer<T>(
  server: Server,
  fn: (baseUrl: string) => Promise<T>,
): Promise<T> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe("drug instruction API", () => {
  beforeAll(() => {
    warmInstructionSearchIndex();
  }, 30_000);

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns one bounded exact-product snapshot without local paths", async () => {
    process.env.AUTH_REQUIRED = "false";
    const app = createApp({ nodeEnv: "test" });
    await withServer(createServer(app), async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/catalog/products/FDF34C07D1E7F97CC2258C8400321E41/instruction`,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      const serialized = JSON.stringify(body);
      expect(body.registryProductId).toBe("FDF34C07D1E7F97CC2258C8400321E41");
      expect(body.registrationNumber).toBe("UA/13141/01/01");
      const facts = body.administrationFacts as {
        incompatibilities: Array<{
          text: string;
          sectionKey: string;
          charStart: number;
          charEnd: number;
        }>;
      };
      expect(facts.incompatibilities[0]?.text).toContain("кальцій");
      expect(serialized.length).toBeLessThan(600_000);
      expect(serialized).not.toMatch(/[A-Za-z]:\\/u);
      expect(serialized).not.toContain("/opt/render/");
      expect(serialized).not.toContain("DATABASE_URL");
    });
  });

  it("serves representative expanded instructions by exact registry product", async () => {
    process.env.AUTH_REQUIRED = "false";
    const representativeInns = [
      "Ceftriaxone",
      "Amoxicillin and beta-lactamase inhibitor",
      "Ibuprofen",
      "Diclofenac",
      "Metformin",
      "Omeprazole",
      "Amlodipine",
      "Warfarin",
      "Apixaban",
      "Rivaroxaban",
      "Dexamethasone",
      "Ondansetron",
    ];
    const sources = loadInstructionSources();
    const products = representativeInns.map((inn) =>
      sources.products.find((product) => product.inn === inn),
    );
    expect(products.every((product) => product !== undefined)).toBe(true);

    const app = createApp({ nodeEnv: "test" });
    await withServer(createServer(app), async (baseUrl) => {
      for (const product of products) {
        if (!product) throw new Error("representative_instruction_missing");
        const response = await fetch(
          `${baseUrl}/api/catalog/products/${product.registryProductId}/instruction`,
        );
        expect(response.status).toBe(200);
        const body = (await response.json()) as {
          registryProductId: string;
          registrationNumber: string;
          sections: Record<string, string | null>;
          source: { url: string };
        };
        expect(body.registryProductId).toBe(product.registryProductId);
        expect(body.registrationNumber).toBe(product.registrationNumber);
        expect(
          Object.values(body.sections).filter(Boolean).length,
        ).toBeGreaterThanOrEqual(8);
        expect(body.source.url).toMatch(/^http:\/\/www\.drlz\.com\.ua\//u);
      }
    });
  });
  it("searches verified instruction text and returns exact source offsets", async () => {
    process.env.AUTH_REQUIRED = "false";
    const app = createApp({ nodeEnv: "test" });
    await withServer(createServer(app), async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/catalog/instructions/search?q=${encodeURIComponent("кальцій")}&section=interactions`,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-instruction-index-count")).toBe("200");
      const body = (await response.json()) as {
        total: number;
        indexedInstructionCount: number;
        items: Array<{
          registryProductId: string;
          sectionKey: string;
          quote: {
            text: string;
            sectionKey: string;
            charStart: number;
            charEnd: number;
          };
          highlights: Array<{ charStart: number; charEnd: number }>;
        }>;
      };
      expect(body.indexedInstructionCount).toBe(200);
      expect(body.total).toBeGreaterThan(0);
      const item = body.items[0]!;
      expect(item.sectionKey).toBe("interactions");
      const snapshot = getInstructionForProduct(item.registryProductId);
      expect(snapshot).not.toBeNull();
      const section = snapshot?.sections.interactions;
      expect(section?.slice(item.quote.charStart, item.quote.charEnd)).toBe(
        item.quote.text,
      );
      expect(item.highlights.length).toBeGreaterThan(0);
      for (const highlight of item.highlights) {
        expect(highlight.charStart).toBeGreaterThanOrEqual(
          item.quote.charStart,
        );
        expect(highlight.charEnd).toBeLessThanOrEqual(item.quote.charEnd);
      }
    });
  });

  it("rejects blank and one-character instruction queries", async () => {
    process.env.AUTH_REQUIRED = "false";
    const app = createApp({ nodeEnv: "test" });
    await withServer(createServer(app), async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/catalog/instructions/search?q=%20`,
      );
      expect(response.status).toBe(400);
    });
  });

  it("returns sanitized 400 and 404 responses", async () => {
    process.env.AUTH_REQUIRED = "false";
    const app = createApp({ nodeEnv: "test" });
    await withServer(createServer(app), async (baseUrl) => {
      const invalid = await fetch(
        `${baseUrl}/api/catalog/products/not-valid/instruction`,
      );
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toEqual({
        error: "Invalid product identifier",
      });

      const missing = await fetch(
        `${baseUrl}/api/catalog/products/FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF/instruction`,
      );
      expect(missing.status).toBe(404);
      expect(await missing.json()).toEqual({
        error: "Official instruction is not available",
      });
    });
  });
});
