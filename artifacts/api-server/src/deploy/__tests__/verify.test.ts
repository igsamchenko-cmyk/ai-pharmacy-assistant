import { describe, expect, it } from "vitest";
import { runDeployVerify } from "../verify";

type RouteMap = Record<string, { status: number; body: unknown; cookie?: string }>;

function jsonResponse(status: number, body: unknown, cookie?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { "set-cookie": cookie } : {}),
    },
  });
}

const protectedPaths = new Set([
  "/api/beta/dashboard/status",
  "/api/diagnostics",
  "/api/knowledge/runtime/status",
]);

function hasCookie(init: RequestInit | undefined): boolean {
  const headers = init?.headers;
  if (!headers) return false;
  if (headers instanceof Headers) return Boolean(headers.get("cookie"));
  if (Array.isArray(headers)) return headers.some(([key]) => key.toLowerCase() === "cookie");
  return Boolean((headers as Record<string, string>).cookie);
}

function mockFetch(routes: RouteMap): typeof fetch {
  return (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const url = String(input);
    const path = new URL(url).pathname;
    if (protectedPaths.has(path) && !hasCookie(init)) {
      return jsonResponse(401, { error: "auth required" });
    }
    const route = routes[path];
    if (!route) return jsonResponse(404, { error: "missing mock route" });
    return jsonResponse(route.status, route.body, route.cookie);
  }) as typeof fetch;
}

const baseRoutes: RouteMap = {
  "/api/healthz": { status: 200, body: { status: "ok" } },
  "/api/auth/session": {
    status: 200,
    body: {
      authenticated: false,
      authRequired: true,
      inviteOnly: true,
      provider: "local",
      mode: "private_beta",
      role: "none",
      user: null,
      supabaseConfigured: false,
      warnings: [],
    },
  },
  "/api/auth/login": {
    status: 200,
    body: { session: { authenticated: true, role: "reviewer" } },
    cookie: "farmassist_session=abc; Path=/; HttpOnly",
  },
  "/api/beta/dashboard/status": {
    status: 401,
    body: { error: "auth required" },
  },
  "/api/diagnostics": {
    status: 401,
    body: { error: "auth required" },
  },
  "/api/knowledge/runtime/status": {
    status: 401,
    body: { error: "auth required" },
  },
};

describe("deploy verification", () => {
  it("verifies health, auth mode and authenticated protected payloads", async () => {
    const report = await runDeployVerify({
      baseUrl: "https://farmassist.example",
      email: "reviewer@example.com",
      fetchImpl: mockFetch({
        ...baseRoutes,
        "/api/beta/dashboard/status": {
          status: 200,
          body: { readiness: { ready: true }, runtime: { staticFallbackEnabled: true } },
        },
        "/api/diagnostics": {
          status: 200,
          body: { runtime: { dbConfigured: false }, auth: { mode: "private_beta" } },
        },
        "/api/knowledge/runtime/status": {
          status: 200,
          body: { staticFallbackEnabled: true },
        },
      }),
    });

    expect(report.ok).toBe(true);
    expect(report.checks.map((item) => item.name)).toContain("beta-dashboard-api");
    expect(report.checks.map((item) => item.name)).toContain("diagnostics-redaction");
    expect(report.checks.map((item) => item.name)).toContain("runtime-status");
  });

  it("gracefully skips authenticated payload checks when no verify email is provided", async () => {
    const report = await runDeployVerify({
      baseUrl: "https://farmassist.example/",
      fetchImpl: mockFetch(baseRoutes),
    });

    expect(report.ok).toBe(true);
    expect(report.warnings.join(" ")).toContain("DEPLOY_VERIFY_EMAIL");
    expect(report.checks.find((item) => item.name === "authenticated-payloads")?.status).toBe("skipped");
  });

  it("fails when a protected payload exposes a configured secret probe", async () => {
    const report = await runDeployVerify({
      baseUrl: "https://farmassist.example",
      email: "reviewer@example.com",
      secretProbeValues: ["gemini-secret"],
      fetchImpl: mockFetch({
        ...baseRoutes,
        "/api/beta/dashboard/status": {
          status: 200,
          body: { readiness: { ready: true }, runtime: { staticFallbackEnabled: true } },
        },
        "/api/diagnostics": {
          status: 200,
          body: { runtime: { dbConfigured: false }, auth: { mode: "private_beta" }, leaked: "gemini-secret" },
        },
        "/api/knowledge/runtime/status": {
          status: 200,
          body: { staticFallbackEnabled: true },
        },
      }),
    });

    expect(report.ok).toBe(false);
    expect(report.checks.find((item) => item.name === "diagnostics-redaction")?.status).toBe("failed");
  });
});
