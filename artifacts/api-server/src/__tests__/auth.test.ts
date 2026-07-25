import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const supabaseMocks = vi.hoisted(() => {
  const signInWithOtp = vi.fn();
  const verifyOtp = vi.fn();
  const createClient = vi.fn(() => ({
    auth: { signInWithOtp, verifyOtp },
  }));
  return { createClient, signInWithOtp, verifyOtp };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: supabaseMocks.createClient,
}));

import app from "../app";
import { resetAuthSessionsForTests } from "../auth";
import { isTreatmentRequest } from "../services/safety";

const AUTH_ENV_KEYS = [
  "AUTH_PROVIDER",
  "AUTH_REQUIRED",
  "INVITE_ONLY",
  "ADMIN_EMAILS",
  "ALLOWED_EMAILS",
  "DISABLED_EMAILS",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "DATABASE_URL",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
] as const;

const originalEnv = { ...process.env };

interface ApiResponse<T = unknown> {
  status: number;
  json: T;
  cookie: string | null;
}

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}/api`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function api<T = unknown>(
  baseUrl: string,
  path: string,
  opts: { method?: string; body?: unknown; cookie?: string | null } = {},
): Promise<ApiResponse<T>> {
  const headers = new Headers();
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  if (opts.cookie) headers.set("cookie", opts.cookie);
  const response = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await response.text();
  return {
    status: response.status,
    json: text ? (JSON.parse(text) as T) : (null as T),
    cookie: response.headers.get("set-cookie")?.split(";", 1)[0] ?? null,
  };
}

function setAuthEnv(values: Record<string, string | undefined>): void {
  for (const key of AUTH_ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
}

async function login(baseUrl: string, email: string, name = "Beta User") {
  return api<{ session: { role: string; authenticated: boolean } }>(
    baseUrl,
    "/auth/login",
    {
      method: "POST",
      body: { email, name },
    },
  );
}

async function requestChallenge(baseUrl: string, email: string) {
  return api<{ accepted: boolean }>(baseUrl, "/auth/challenge", {
    method: "POST",
    body: { email },
  });
}

async function loginWithCode(baseUrl: string, email: string, token?: string) {
  return api<{
    session?: { role: string; authenticated: boolean };
    error?: string;
  }>(baseUrl, "/auth/login", {
    method: "POST",
    body: { email, token },
  });
}

describe("private beta auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    supabaseMocks.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid OTP" },
    });
    resetAuthSessionsForTests();
    setAuthEnv({
      AUTH_PROVIDER: "local",
      AUTH_REQUIRED: "true",
      INVITE_ONLY: "true",
      ADMIN_EMAILS: "admin@example.com",
      ALLOWED_EMAILS: "user@example.com,reviewer@example.com:reviewer",
    });
  });

  afterEach(() => {
    resetAuthSessionsForTests();
    process.env = { ...originalEnv };
  });

  it("blocks unauthenticated protected API requests when auth is required", async () => {
    await withServer(async (baseUrl) => {
      const response = await api(baseUrl, "/drugs/stats");
      expect(response.status).toBe(401);
    });
  });

  it("allows an authenticated user to access normal protected routes", async () => {
    await withServer(async (baseUrl) => {
      const session = await login(baseUrl, "user@example.com");
      expect(session.status).toBe(200);
      const response = await api(baseUrl, "/drugs/stats", {
        cookie: session.cookie,
      });
      expect(response.status).toBe(200);
    });
  });

  it("does not allow a user role to access reviewer routes", async () => {
    await withServer(async (baseUrl) => {
      const session = await login(baseUrl, "user@example.com");
      const response = await api(baseUrl, "/knowledge/quality", {
        cookie: session.cookie,
      });
      expect(response.status).toBe(403);
    });
  });

  it("allows reviewers to access data-quality routes", async () => {
    await withServer(async (baseUrl) => {
      const session = await login(baseUrl, "reviewer@example.com");
      expect(session.json.session.role).toBe("reviewer");
      const response = await api(baseUrl, "/knowledge/quality", {
        cookie: session.cookie,
      });
      expect(response.status).toBe(200);
    });
  });

  it("allows admins past approve route auth checks", async () => {
    await withServer(async (baseUrl) => {
      const session = await login(baseUrl, "admin@example.com");
      const response = await api(baseUrl, "/knowledge/review/missing/approve", {
        method: "POST",
        cookie: session.cookie,
        body: { reviewedBy: "admin@example.com", note: "auth test" },
      });
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });
  });

  it("blocks disabled users", async () => {
    setAuthEnv({
      AUTH_PROVIDER: "local",
      AUTH_REQUIRED: "true",
      INVITE_ONLY: "true",
      ALLOWED_EMAILS: "disabled@example.com",
      DISABLED_EMAILS: "disabled@example.com",
    });
    await withServer(async (baseUrl) => {
      const response = await login(baseUrl, "disabled@example.com");
      expect(response.status).toBe(403);
    });
  });

  it("enforces invite-only allow-list behavior", async () => {
    await withServer(async (baseUrl) => {
      const response = await login(baseUrl, "stranger@example.com");
      expect(response.status).toBe(403);
    });
  });

  it("requests a generic OTP challenge only for an invited email", async () => {
    setAuthEnv({
      AUTH_PROVIDER: "supabase",
      AUTH_REQUIRED: "true",
      INVITE_ONLY: "true",
      ALLOWED_EMAILS: "user@example.com",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_ANON_KEY: "public-anon-key",
    });

    await withServer(async (baseUrl) => {
      const accepted = await requestChallenge(baseUrl, "user@example.com");
      expect(accepted.status).toBe(200);
      expect(accepted.json).toEqual({ accepted: true });
      expect(supabaseMocks.signInWithOtp).toHaveBeenCalledWith({
        email: "user@example.com",
        options: { shouldCreateUser: false },
      });

      vi.clearAllMocks();
      const hidden = await requestChallenge(baseUrl, "stranger@example.com");
      expect(hidden.status).toBe(200);
      expect(hidden.json).toEqual({ accepted: true });
      expect(supabaseMocks.createClient).not.toHaveBeenCalled();
    });
  });

  it("fails closed without provider config and sanitizes provider failures", async () => {
    setAuthEnv({
      AUTH_PROVIDER: "supabase",
      AUTH_REQUIRED: "true",
      INVITE_ONLY: "true",
      ALLOWED_EMAILS: "user@example.com",
    });

    await withServer(async (baseUrl) => {
      const unconfigured = await requestChallenge(baseUrl, "user@example.com");
      expect(unconfigured.status).toBe(503);
      expect(JSON.stringify(unconfigured.json)).not.toContain("SUPABASE");

      setAuthEnv({
        AUTH_PROVIDER: "supabase",
        AUTH_REQUIRED: "true",
        INVITE_ONLY: "true",
        ALLOWED_EMAILS: "user@example.com",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_ANON_KEY: "public-anon-key",
      });
      supabaseMocks.signInWithOtp.mockRejectedValue(
        new Error("public-anon-key provider-internal-detail"),
      );
      const failed = await requestChallenge(baseUrl, "user@example.com");
      expect(failed.status).toBe(503);
      const serialized = JSON.stringify(failed.json);
      expect(serialized).not.toContain("public-anon-key");
    });
  });

  it("blocks email-only impersonation in Supabase mode", async () => {
    setAuthEnv({
      AUTH_PROVIDER: "supabase",
      AUTH_REQUIRED: "true",
      INVITE_ONLY: "true",
      ALLOWED_EMAILS: "user@example.com",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_ANON_KEY: "public-anon-key",
    });

    await withServer(async (baseUrl) => {
      const response = await loginWithCode(baseUrl, "user@example.com");
      expect(response.status).toBe(400);
      expect(supabaseMocks.verifyOtp).not.toHaveBeenCalled();
    });
  });

  it("rejects a verified token that belongs to another email", async () => {
    setAuthEnv({
      AUTH_PROVIDER: "supabase",
      AUTH_REQUIRED: "true",
      INVITE_ONLY: "true",
      ADMIN_EMAILS: "admin@example.com",
      ALLOWED_EMAILS: "user@example.com",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_ANON_KEY: "public-anon-key",
    });
    supabaseMocks.verifyOtp.mockResolvedValue({
      data: {
        user: { email: "user@example.com", user_metadata: {} },
        session: {},
      },
      error: null,
    });

    await withServer(async (baseUrl) => {
      const response = await loginWithCode(
        baseUrl,
        "admin@example.com",
        "123456",
      );
      expect(response.status).toBe(401);
      expect(response.cookie).toBeNull();
    });
  });

  it("creates a local HttpOnly session only after verified OTP and server role mapping", async () => {
    setAuthEnv({
      AUTH_PROVIDER: "supabase",
      AUTH_REQUIRED: "true",
      INVITE_ONLY: "true",
      ALLOWED_EMAILS: "reviewer@example.com:reviewer",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_ANON_KEY: "public-anon-key",
    });
    supabaseMocks.verifyOtp.mockResolvedValue({
      data: {
        user: {
          email: "reviewer@example.com",
          user_metadata: { name: "Verified Reviewer" },
        },
        session: {},
      },
      error: null,
    });

    await withServer(async (baseUrl) => {
      const session = await loginWithCode(
        baseUrl,
        "reviewer@example.com",
        "123456",
      );
      expect(session.status).toBe(200);
      expect(session.json.session).toMatchObject({
        authenticated: true,
        role: "reviewer",
      });
      expect(session.cookie).toContain("farmassist_session=");
      expect(supabaseMocks.verifyOtp).toHaveBeenCalledWith({
        email: "reviewer@example.com",
        token: "123456",
        type: "email",
      });

      const protectedResponse = await api(baseUrl, "/knowledge/quality", {
        cookie: session.cookie,
      });
      expect(protectedResponse.status).toBe(200);
    });
  });

  it("allows local beta access when AUTH_REQUIRED=false", async () => {
    setAuthEnv({
      AUTH_PROVIDER: "local",
      AUTH_REQUIRED: "false",
      INVITE_ONLY: "true",
    });
    await withServer(async (baseUrl) => {
      const response = await api(baseUrl, "/knowledge/quality");
      expect(response.status).toBe(200);
    });
  });

  it("logout clears the session", async () => {
    await withServer(async (baseUrl) => {
      const session = await login(baseUrl, "user@example.com");
      expect(session.cookie).toContain("farmassist_session=");
      const logout = await api(baseUrl, "/auth/logout", {
        method: "POST",
        cookie: session.cookie,
      });
      expect(logout.status).toBe(200);
      const blocked = await api(baseUrl, "/drugs/stats", {
        cookie: session.cookie,
      });
      expect(blocked.status).toBe(401);
    });
  });

  it("diagnostics do not expose secrets, tokens, DATABASE_URL or filesystem paths", async () => {
    setAuthEnv({
      AUTH_PROVIDER: "local",
      AUTH_REQUIRED: "false",
      INVITE_ONLY: "true",
      DATABASE_URL: "postgresql://user:password@example.test/db",
      GEMINI_API_KEY: "gemini-secret",
      OPENAI_API_KEY: "openai-secret",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_ANON_KEY: "supabase-secret-token",
    });
    await withServer(async (baseUrl) => {
      const response = await api(baseUrl, "/diagnostics");
      expect(response.status).toBe(200);
      const json = JSON.stringify(response.json);
      expect(json).not.toContain("postgresql://");
      expect(json).not.toContain("gemini-secret");
      expect(json).not.toContain("openai-secret");
      expect(json).not.toContain("supabase-secret-token");
      expect(json).not.toMatch(/[A-Za-z]:\\/);
    });
  });

  it("keeps treatment-request safety invariants intact", () => {
    expect(isTreatmentRequest("що приймати при температурі")).toBe(true);
    expect(isTreatmentRequest("чим лікувати застуду")).toBe(true);
    expect(isTreatmentRequest("яка доза для дитини")).toBe(true);
    expect(isTreatmentRequest("довідка про препарат ібупрофен")).toBe(false);
    expect(isTreatmentRequest("порівняння ібупрофен та парацетамол")).toBe(
      false,
    );
  });

  it("keeps beta dashboard available to authenticated users", async () => {
    await withServer(async (baseUrl) => {
      const session = await login(baseUrl, "user@example.com");
      const response = await api(baseUrl, "/beta/dashboard/status", {
        cookie: session.cookie,
      });
      expect(response.status).toBe(200);
    });
  });

  it("rate limits repeated login attempts and resets cleanly", async () => {
    await withServer(async (baseUrl) => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const rejected = await login(baseUrl, "stranger@example.com");
        expect(rejected.status).toBe(403);
      }

      const limited = await login(baseUrl, "user@example.com");
      expect(limited.status).toBe(429);
      expect(limited.json).toEqual({
        error: "Забагато спроб входу. Спробуйте пізніше.",
      });

      resetAuthSessionsForTests();
      const allowed = await login(baseUrl, "user@example.com");
      expect(allowed.status).toBe(200);
    });
  });
});
