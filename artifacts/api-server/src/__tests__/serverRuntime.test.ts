import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import {
  configureHttpServer,
  HEADERS_TIMEOUT_MS,
  KEEP_ALIVE_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
} from "../serverRuntime";

describe("production HTTP server runtime", () => {
  it("keeps upstream sockets compatible with the Render edge", () => {
    const server = createServer();

    configureHttpServer(server);

    expect(server.keepAliveTimeout).toBe(KEEP_ALIVE_TIMEOUT_MS);
    expect(server.headersTimeout).toBe(HEADERS_TIMEOUT_MS);
    expect(server.requestTimeout).toBe(REQUEST_TIMEOUT_MS);
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
  });
});
