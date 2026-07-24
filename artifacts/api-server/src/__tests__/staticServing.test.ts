import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

async function createFrontendDist(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "farmassist-static-"));
  await mkdir(join(dir, "assets"));
  await writeFile(
    join(dir, "index.html"),
    '<!doctype html><html><body><div id="root">FarmAssist</div></body></html>',
  );
  await writeFile(join(dir, "assets", "app.js"), "console.log('farmassist');");
  return dir;
}

describe("production static frontend serving", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("serves direct frontend routes in production", async () => {
    const frontendDist = await createFrontendDist();
    const app = createApp({ nodeEnv: "production", frontendDist });

    await withServer(createServer(app), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/beta-dashboard`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-cache");
      expect(response.headers.get("x-powered-by")).toBeNull();
      expect(await response.text()).toContain("FarmAssist");
    });
  });

  it("keeps /api routes ahead of the SPA fallback", async () => {
    const frontendDist = await createFrontendDist();
    const app = createApp({ nodeEnv: "production", frontendDist });

    await withServer(createServer(app), async (baseUrl) => {
      const health = await fetch(`${baseUrl}/api/healthz`);
      expect(health.status).toBe(200);
      expect(health.headers.get("content-type")).toContain("application/json");
      expect(await health.json()).toEqual({ status: "ok" });

      const missingApi = await fetch(`${baseUrl}/api/not-a-real-route`);
      expect(missingApi.status).not.toBe(200);
      expect(await missingApi.text()).not.toContain("FarmAssist");
    });
  });

  it("serves built static assets when the frontend dist exists", async () => {
    const frontendDist = await createFrontendDist();
    const app = createApp({ nodeEnv: "production", frontendDist });

    await withServer(createServer(app), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/assets/app.js`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain(
        "max-age=31536000",
      );
      expect(response.headers.get("cache-control")).toContain("immutable");
      expect(await response.text()).toContain("farmassist");
    });
  });

  it("keeps unhashed public files on a short cache lifetime", async () => {
    const frontendDist = await createFrontendDist();
    await writeFile(join(frontendDist, "favicon.svg"), "<svg></svg>");
    const app = createApp({ nodeEnv: "production", frontendDist });

    await withServer(createServer(app), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/favicon.svg`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("max-age=3600");
      expect(response.headers.get("cache-control")).not.toContain("immutable");
    });
  });
});
