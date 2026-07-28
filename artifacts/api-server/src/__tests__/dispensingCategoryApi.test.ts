import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { clearDispensingCategoryCache } from "../knowledge/dispensingCategories/catalog";

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

function checkUrl(
  baseUrl: string,
  productId: string,
  registrationNumber: string,
): string {
  const params = new URLSearchParams({ productId, registrationNumber });
  return `${baseUrl}/api/catalog/dispensing-category?${params}`;
}

describe("dispensing category API", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    clearDispensingCategoryCache();
  });

  it("returns exact DRLZ evidence for OTC and package-dependent records", async () => {
    process.env.AUTH_REQUIRED = "false";
    const app = createApp({ nodeEnv: "test" });
    await withServer(createServer(app), async (baseUrl) => {
      const otcResponse = await fetch(
        checkUrl(baseUrl, "A2AE669DFB4C71F0C2258D6F002D26CC", "UA/17438/01/01"),
      );
      expect(otcResponse.status).toBe(200);
      const otc = (await otcResponse.json()) as Record<string, unknown> & {
        source: { complete: boolean; officialRowCount: number };
      };
      expect(otc).toMatchObject({
        status: "otc",
        matchStatus: "product_and_registration",
        conditions: ["без рецепта"],
        packageDependent: false,
      });
      expect(otc.source).toMatchObject({ complete: true });
      expect(otc.source.officialRowCount).toBeGreaterThan(16_000);

      const conditionalResponse = await fetch(
        checkUrl(baseUrl, "7F38AFA1DA2089E6C2258D7E0047FAFF", "UA/7331/01/01"),
      );
      expect(conditionalResponse.status).toBe(200);
      expect(await conditionalResponse.json()).toMatchObject({
        status: "conditional",
        packageDependent: true,
      });

      const serialized = JSON.stringify(otc);
      expect(serialized).not.toMatch(/[A-Za-z]:\\/u);
      expect(serialized).not.toContain("DATABASE_URL");
    });
  });

  it("fails closed for a record with no structured dispensing conditions", async () => {
    process.env.AUTH_REQUIRED = "false";
    const app = createApp({ nodeEnv: "test" });
    await withServer(createServer(app), async (baseUrl) => {
      const response = await fetch(
        checkUrl(baseUrl, "05D4A8DEE2E75BF5C2258DED00443C49", "UA/10532/01/01"),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        status: "unknown",
        action: "manual_review",
        conditions: [],
      });
    });
  });

  it("rejects malformed exact-product identifiers", async () => {
    process.env.AUTH_REQUIRED = "false";
    const app = createApp({ nodeEnv: "test" });
    await withServer(createServer(app), async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/catalog/dispensing-category?productId=bad&registrationNumber=bad`,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Invalid product or registration number",
      });
    });
  });
});
