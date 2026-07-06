import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export type AuthProvider = "local" | "supabase" | "disabled";
export type AuthMode = "local_beta" | "private_beta" | "supabase" | "disabled";
export type AuthRole = "admin" | "reviewer" | "user" | "none";

export interface AuthUser {
  email: string;
  name: string | null;
  role: Exclude<AuthRole, "none">;
  disabled: boolean;
}

export interface AuthConfig {
  provider: AuthProvider;
  authRequired: boolean;
  inviteOnly: boolean;
  mode: AuthMode;
  configured: boolean;
  supabaseConfigured: boolean;
  localBetaMode: boolean;
  warnings: string[];
  adminEmails: Set<string>;
  allowedUsers: Map<string, Exclude<AuthRole, "none">>;
  disabledEmails: Set<string>;
}

export interface AuthSession {
  authenticated: boolean;
  authRequired: boolean;
  inviteOnly: boolean;
  provider: AuthProvider;
  mode: AuthMode;
  role: AuthRole;
  user: AuthUser | null;
  supabaseConfigured: boolean;
  warnings: string[];
}

export interface AuthDiagnostics {
  configured: boolean;
  required: boolean;
  inviteOnly: boolean;
  provider: AuthProvider;
  mode: AuthMode;
  currentRole: AuthRole;
  supabaseConfigured: boolean;
  localBetaMode: boolean;
  warnings: string[];
}

const SESSION_COOKIE = "farmassist_session";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 12;
const ROLE_RANK: Record<AuthRole, number> = {
  none: 0,
  user: 1,
  reviewer: 2,
  admin: 3,
};

const sessions = new Map<
  string,
  { user: AuthUser; createdAt: number; expiresAt: number }
>();

function booleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function normalizeEmail(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRole(value: string | undefined): Exclude<AuthRole, "none"> {
  if (value === "admin" || value === "reviewer" || value === "user") return value;
  return "user";
}

function parseAllowedUsers(
  allowed: string | undefined,
  admin: string | undefined,
): Map<string, Exclude<AuthRole, "none">> {
  const users = new Map<string, Exclude<AuthRole, "none">>();
  for (const entry of splitList(allowed)) {
    const [emailPart, rolePart] = entry.split(":");
    const email = normalizeEmail(emailPart);
    if (email) users.set(email, parseRole(rolePart));
  }
  for (const email of splitList(admin).map(normalizeEmail)) {
    if (email) users.set(email, "admin");
  }
  return users;
}

function parseProvider(value: string | undefined): AuthProvider {
  const normalized = (value ?? "local").trim().toLowerCase();
  if (normalized === "supabase" || normalized === "disabled") return normalized;
  return "local";
}

function authMode(
  provider: AuthProvider,
  authRequired: boolean,
  supabaseConfigured: boolean,
): AuthMode {
  if (provider === "disabled") return "disabled";
  if (!authRequired) return "local_beta";
  if (provider === "supabase") return supabaseConfigured ? "supabase" : "supabase";
  return "private_beta";
}

export function getAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const provider = parseProvider(env.AUTH_PROVIDER);
  const authRequired = provider === "disabled" ? false : booleanEnv(env.AUTH_REQUIRED, false);
  const inviteOnly = booleanEnv(env.INVITE_ONLY, true);
  const adminEmails = new Set(splitList(env.ADMIN_EMAILS).map(normalizeEmail));
  const allowedUsers = parseAllowedUsers(env.ALLOWED_EMAILS, env.ADMIN_EMAILS);
  const disabledEmails = new Set(splitList(env.DISABLED_EMAILS).map(normalizeEmail));
  const supabaseConfigured = Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
  const localBetaMode = !authRequired || provider === "disabled";
  const warnings: string[] = [];

  if (provider === "supabase" && !supabaseConfigured) {
    warnings.push("Supabase provider selected but public Supabase config is incomplete.");
  }
  if (authRequired && provider === "local" && inviteOnly && allowedUsers.size === 0) {
    warnings.push("Invite-only local auth has no ADMIN_EMAILS or ALLOWED_EMAILS.");
  }

  return {
    provider,
    authRequired,
    inviteOnly,
    mode: authMode(provider, authRequired, supabaseConfigured),
    configured:
      provider === "disabled" ||
      !authRequired ||
      provider === "local" ||
      (provider === "supabase" && supabaseConfigured),
    supabaseConfigured,
    localBetaMode,
    warnings,
    adminEmails,
    allowedUsers,
    disabledEmails,
  };
}

function localBetaUser(): AuthUser {
  return {
    email: "local-beta@farmassist.local",
    name: "Local beta",
    role: "admin",
    disabled: false,
  };
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_MS,
  };
}

function sessionCookie(req: Request): string | null {
  const parsed = (req as Request & { cookies?: Record<string, string> }).cookies;
  if (parsed?.[SESSION_COOKIE]) return parsed[SESSION_COOKIE];
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function createAuthSession(user: AuthUser, res: Response): void {
  const sessionId = randomUUID();
  sessions.set(sessionId, {
    user,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_MAX_AGE_MS,
  });
  res.cookie(SESSION_COOKIE, sessionId, cookieOptions());
}

export function clearAuthSession(req: Request, res: Response): void {
  const sessionId = sessionCookie(req);
  if (sessionId) sessions.delete(sessionId);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

function storedUser(req: Request, config: AuthConfig): AuthUser | null {
  const sessionId = sessionCookie(req);
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  if (config.disabledEmails.has(session.user.email)) {
    sessions.delete(sessionId);
    return null;
  }
  return session.user;
}

export function getSessionUser(req: Request, env?: NodeJS.ProcessEnv): AuthUser | null {
  const config = getAuthConfig(env);
  if (config.localBetaMode) return localBetaUser();
  return storedUser(req, config);
}

export function buildAuthSession(req: Request, env?: NodeJS.ProcessEnv): AuthSession {
  const config = getAuthConfig(env);
  const user = config.localBetaMode ? localBetaUser() : storedUser(req, config);
  return buildAuthSessionForUser(user, config);
}

export function buildAuthSessionForUser(
  user: AuthUser | null,
  config = getAuthConfig(),
): AuthSession {
  return {
    authenticated: Boolean(user),
    authRequired: config.authRequired,
    inviteOnly: config.inviteOnly,
    provider: config.provider,
    mode: config.mode,
    role: user?.role ?? "none",
    user,
    supabaseConfigured: config.supabaseConfigured,
    warnings: config.warnings,
  };
}

export function buildAuthDiagnostics(
  req: Request | null,
  env: NodeJS.ProcessEnv = process.env,
): AuthDiagnostics {
  const config = getAuthConfig(env);
  const user = req ? getSessionUser(req, env) : null;
  return {
    configured: config.configured,
    required: config.authRequired,
    inviteOnly: config.inviteOnly,
    provider: config.provider,
    mode: config.mode,
    currentRole: user?.role ?? "none",
    supabaseConfigured: config.supabaseConfigured,
    localBetaMode: config.localBetaMode,
    warnings: config.warnings,
  };
}

export function loginLocal(
  input: { email: string; name?: string | null },
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; user: AuthUser } | { ok: false; status: number; error: string } {
  const config = getAuthConfig(env);
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    return { ok: false, status: 400, error: "Некоректна електронна пошта." };
  }
  if (config.provider === "disabled" || !config.authRequired) {
    return {
      ok: true,
      user: { ...localBetaUser(), email, name: input.name ?? "Local beta" },
    };
  }
  if (config.provider === "supabase") {
    return {
      ok: false,
      status: 400,
      error: "Supabase auth placeholder is configured; use Supabase client flow in deployment.",
    };
  }
  if (config.disabledEmails.has(email)) {
    return { ok: false, status: 403, error: "Користувача вимкнено." };
  }
  const role = config.allowedUsers.get(email);
  if (config.inviteOnly && !role) {
    return { ok: false, status: 403, error: "Доступ лише за запрошенням." };
  }
  return {
    ok: true,
    user: {
      email,
      name: input.name?.trim() || email,
      role: role ?? "user",
      disabled: false,
    },
  };
}

export function requireRole(required: Exclude<AuthRole, "none">) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const config = getAuthConfig();
    const user = config.localBetaMode ? localBetaUser() : storedUser(req, config);
    if (!user) {
      res.status(401).json({ error: "Потрібен вхід до приватної бети." });
      return;
    }
    if (ROLE_RANK[user.role] < ROLE_RANK[required]) {
      res.status(403).json({ error: "Недостатньо прав доступу." });
      return;
    }
    res.locals.authUser = user;
    next();
  };
}

export function resetAuthSessionsForTests(): void {
  sessions.clear();
}
