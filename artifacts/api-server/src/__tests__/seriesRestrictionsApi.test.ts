import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { clearSeriesRestrictionCache } from "../knowledge/seriesRestrictions/catalog";

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
  registrationNumber: string,
  series: string,
): string {
  const params = new URLSearchParams({
    productId: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    registrationNumber,
    series,
  });
  return `${baseUrl}/api/catalog/series-restrictions?${params}`;
}

describe("series restriction API", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    clearSeriesRestrictionCache();
  });

  it("returns a bounded exact-series stop signal from the verified DLS snapshot", async () => {
    process.env.AUTH_REQUIRED = "false";
    const app = createApp({ nodeEnv: "test" });
    await withServer(createServer(app), async (baseUrl) => {
      const response = await fetch(
        checkUrl(baseUrl, "UA/15145/01/01", "AO261002"),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown> & {
        events: Array<{ documentNumber: string }>;
        source: { complete: boolean; recordCount: number; freshness: string };
      };
      expect(body.status).toBe("blocked");
      expect(body.action).toBe("stop");
      expect(body.events[0]?.documentNumber).toBe("336-001.001/002.0/17-26");
      expect(body.source).toMatchObject({
        complete: true,
        freshness: "current",
      });
      expect(body.source.recordCount).toBeGreaterThan(20_000);
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/[A-Za-z]:\\/u);
      expect(serialized).not.toContain("DATABASE_URL");
    });
  });

  it("matches an all-series prohibition without claiming that no-match is safe", async () => {
    process.env.AUTH_REQUIRED = "false";
    const app = createApp({ nodeEnv: "test" });
    await withServer(createServer(app), async (baseUrl) => {
      const allSeries = await fetch(
        checkUrl(baseUrl, "UA/15338/01/01", "SERIES-FROM-PACKAGE"),
      );
      expect(allSeries.status).toBe(200);
      expect(await allSeries.json()).toMatchObject({
        status: "blocked",
        action: "stop",
        matchedAllSeries: true,
      });

      const noMatch = await fetch(
        checkUrl(baseUrl, "UA/99999/99/99", "UNKNOWN"),
      );
      expect(noMatch.status).toBe(200);
      expect(await noMatch.json()).toMatchObject({
        status: "no_match",
        action: "manual_review",
      });
    });
  });

  it("rejects malformed identifiers before reading the snapshot", async () => {
    process.env.AUTH_REQUIRED = "false";
    const app = createApp({ nodeEnv: "test" });
    await withServer(createServer(app), async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/catalog/series-restrictions?productId=bad&registrationNumber=bad&series=x`,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Invalid product, registration number or series",
      });
    });
  });
});
