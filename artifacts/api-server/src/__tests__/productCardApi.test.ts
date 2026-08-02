import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app";

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

describe("product card API", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects a malformed registry product ID before reading any source", async () => {
    process.env.AUTH_REQUIRED = "false";
    const app = createApp({ nodeEnv: "test" });

    await withServer(createServer(app), async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/catalog/product/not-a-product/card`,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Invalid registry product identifier",
      });
    });
  });

  it("fails closed when the production registry is unavailable", async () => {
    process.env.AUTH_REQUIRED = "false";
    delete process.env.DATABASE_URL;
    const app = createApp({ nodeEnv: "test" });

    await withServer(createServer(app), async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/catalog/product/${"A".repeat(32)}/card`,
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "Exact production registry card is unavailable",
      });
    });
  });
});
