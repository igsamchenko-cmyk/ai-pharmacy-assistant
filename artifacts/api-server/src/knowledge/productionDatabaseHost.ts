export type ProtectedProductionDatabaseProvider = "render" | "neon";

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

function isDomainOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function protectedProductionDatabaseProvider(
  host: string,
): ProtectedProductionDatabaseProvider | null {
  const normalized = normalizeHost(host);
  if (
    isDomainOrSubdomain(normalized, "render.com") ||
    /(^|[.-])render-postgres([.-]|$)/u.test(normalized)
  ) {
    return "render";
  }
  if (isDomainOrSubdomain(normalized, "neon.tech")) {
    return "neon";
  }
  return null;
}

export function isProtectedProductionDatabaseHost(host: string): boolean {
  return protectedProductionDatabaseProvider(host) !== null;
}
