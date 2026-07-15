import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app";

const originalEnv = { ...process.env };

async function withServer<T>(server: Server, fn: (baseUrl: string) => Promise<T>): Promise<T> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

describe("drug instruction API", () => {
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
      const body = await response.json() as Record<string, unknown>;
      const serialized = JSON.stringify(body);
      expect(body.registryProductId).toBe("FDF34C07D1E7F97CC2258C8400321E41");
      expect(body.registrationNumber).toBe("UA/13141/01/01");
      expect(serialized.length).toBeLessThan(600_000);
      expect(serialized).not.toMatch(/[A-Za-z]:\\/u);
      expect(serialized).not.toContain("/opt/render/");
      expect(serialized).not.toContain("DATABASE_URL");
    });
  });

  it("returns sanitized 400 and 404 responses", async () => {
    process.env.AUTH_REQUIRED = "false";
    const app = createApp({ nodeEnv: "test" });
    await withServer(createServer(app), async (baseUrl) => {
      const invalid = await fetch(`${baseUrl}/api/catalog/products/not-valid/instruction`);
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toEqual({ error: "Invalid product identifier" });

      const missing = await fetch(
        `${baseUrl}/api/catalog/products/FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF/instruction`,
      );
      expect(missing.status).toBe(404);
      expect(await missing.json()).toEqual({ error: "Official instruction is not available" });
    });
  });
});
