import type { Server } from "node:http";

// Render's edge can retain upstream connections for longer than Node's
// defaults. Keep these values aligned so the proxy never reuses a socket that
// the application has already closed.
export const KEEP_ALIVE_TIMEOUT_MS = 120_000;
export const HEADERS_TIMEOUT_MS = 121_000;
export const REQUEST_TIMEOUT_MS = 120_000;

export function configureHttpServer(server: Server): void {
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  server.requestTimeout = REQUEST_TIMEOUT_MS;
}
