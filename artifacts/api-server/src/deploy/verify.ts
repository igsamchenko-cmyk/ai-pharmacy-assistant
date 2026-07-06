export type DeployVerifyCheckStatus = "passed" | "warning" | "failed" | "skipped";

export interface DeployVerifyCheck {
  name: string;
  status: DeployVerifyCheckStatus;
  detail: string;
}

export interface DeployVerifyReport {
  ok: boolean;
  baseUrl: string;
  generatedAt: string;
  checks: DeployVerifyCheck[];
  warnings: string[];
  errors: string[];
}

export interface DeployVerifyOptions {
  baseUrl: string;
  email?: string | null;
  fetchImpl?: typeof fetch;
  secretProbeValues?: string[];
}

interface JsonResponse {
  status: number;
  json: unknown;
  text: string;
  cookie: string | null;
}

const PROTECTED_PATHS = [
  "/api/beta/dashboard/status",
  "/api/diagnostics",
  "/api/knowledge/runtime/status",
] as const;

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function urlFor(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

function check(
  checks: DeployVerifyCheck[],
  name: string,
  status: DeployVerifyCheckStatus,
  detail: string,
): void {
  checks.push({ name, status, detail });
}

function safeSecretValues(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter((value) => value.length >= 6))];
}

function payloadHasSecret(value: unknown, secretProbeValues: string[]): boolean {
  const text = JSON.stringify(value);
  if (/postgresql:\/\//i.test(text)) return true;
  if (/[A-Za-z]:\\/.test(text)) return true;
  return secretProbeValues.some((secret) => text.includes(secret));
}

async function readJson(response: Response): Promise<{ json: unknown; text: string }> {
  const text = await response.text();
  if (!text) return { json: null, text };
  try {
    return { json: JSON.parse(text) as unknown, text };
  } catch {
    return { json: null, text };
  }
}

async function requestJson(
  fetchImpl: typeof fetch,
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<JsonResponse> {
  const response = await fetchImpl(urlFor(baseUrl, path), init);
  const { json, text } = await readJson(response);
  return {
    status: response.status,
    json,
    text,
    cookie: response.headers.get("set-cookie")?.split(";", 1)[0] ?? null,
  };
}

function objectValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>)[key];
}

function authHeader(cookie: string | null): Record<string, string> {
  return cookie ? { cookie } : {};
}

export async function runDeployVerify(options: DeployVerifyOptions): Promise<DeployVerifyReport> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const checks: DeployVerifyCheck[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const secretProbeValues = safeSecretValues(options.secretProbeValues);

  try {
    const health = await requestJson(fetchImpl, baseUrl, "/api/healthz");
    const status = objectValue(health.json, "status");
    check(
      checks,
      "health",
      health.status === 200 && status === "ok" ? "passed" : "failed",
      `GET /api/healthz returned ${health.status}.`,
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    check(checks, "health", "failed", "GET /api/healthz could not be reached.");
  }

  let authSession: unknown = null;
  try {
    const session = await requestJson(fetchImpl, baseUrl, "/api/auth/session");
    authSession = session.json;
    const authRequired = objectValue(session.json, "authRequired") === true;
    const inviteOnly = objectValue(session.json, "inviteOnly") === true;
    const mode = String(objectValue(session.json, "mode") ?? "unknown");
    check(
      checks,
      "auth-mode",
      session.status === 200 && authRequired && inviteOnly ? "passed" : "failed",
      `GET /api/auth/session returned ${session.status}; mode=${mode}; authRequired=${authRequired}; inviteOnly=${inviteOnly}.`,
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    check(checks, "auth-mode", "failed", "GET /api/auth/session could not be reached.");
  }

  if (payloadHasSecret(authSession, secretProbeValues)) {
    check(checks, "auth-session-redaction", "failed", "Auth session response exposed a sensitive marker.");
  } else {
    check(checks, "auth-session-redaction", "passed", "Auth session response did not expose configured secret probes.");
  }

  for (const path of PROTECTED_PATHS) {
    try {
      const unauth = await requestJson(fetchImpl, baseUrl, path);
      check(
        checks,
        `unauth-${path}`,
        unauth.status === 401 ? "passed" : "failed",
        `${path} returned ${unauth.status} without a session.`,
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      check(checks, `unauth-${path}`, "failed", `${path} could not be reached.`);
    }
  }

  const email = options.email?.trim();
  if (!email) {
    warnings.push("DEPLOY_VERIFY_EMAIL was not provided; authenticated dashboard, diagnostics and runtime checks were skipped.");
    check(checks, "authenticated-payloads", "skipped", "Set DEPLOY_VERIFY_EMAIL to an invited reviewer/admin email for full checks.");
  } else {
    let cookie: string | null = null;
    try {
      const login = await requestJson(fetchImpl, baseUrl, "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, name: "Deployment Verify" }),
      });
      cookie = login.cookie;
      check(
        checks,
        "login",
        login.status === 200 && Boolean(cookie) ? "passed" : "failed",
        `POST /api/auth/login returned ${login.status}.`,
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      check(checks, "login", "failed", "POST /api/auth/login could not be reached.");
    }

    if (cookie) {
      const protectedChecks: Array<[string, string, (json: unknown) => boolean]> = [
        [
          "beta-dashboard-api",
          "/api/beta/dashboard/status",
          (json) => Boolean(objectValue(json, "readiness")) && Boolean(objectValue(json, "runtime")),
        ],
        [
          "diagnostics-redaction",
          "/api/diagnostics",
          (json) => Boolean(objectValue(json, "runtime")) && Boolean(objectValue(json, "auth")),
        ],
        [
          "runtime-status",
          "/api/knowledge/runtime/status",
          (json) => typeof objectValue(json, "staticFallbackEnabled") === "boolean",
        ],
      ];

      for (const [name, path, isExpectedShape] of protectedChecks) {
        try {
          const response = await requestJson(fetchImpl, baseUrl, path, {
            headers: authHeader(cookie),
          });
          const hasExpectedShape = isExpectedShape(response.json);
          const leaked = payloadHasSecret(response.json, secretProbeValues);
          check(
            checks,
            name,
            response.status === 200 && hasExpectedShape && !leaked ? "passed" : "failed",
            `${path} returned ${response.status}; expectedShape=${hasExpectedShape}; redacted=${!leaked}.`,
          );
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
          check(checks, name, "failed", `${path} could not be reached.`);
        }
      }
    }
  }

  const failed = checks.filter((item) => item.status === "failed");
  return {
    ok: failed.length === 0,
    baseUrl,
    generatedAt: new Date().toISOString(),
    checks,
    warnings,
    errors,
  };
}
