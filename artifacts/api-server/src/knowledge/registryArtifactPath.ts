import { statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const REGISTRY_ARTIFACT_CSV = "reestr.csv";

export interface ResolvedRegistryArtifact {
  resolvedPath: string;
  displayPath: string;
  sizeBytes: number;
}

export function normalizeArtifactRelativePath(value: string): string {
  const normalized = value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/{2,}/g, "/");
  const segments = normalized.split("/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    segments.some((segment) => segment === ".." || segment === "")
  ) {
    throw new Error(
      "Registry artifact path must stay relative to the download directory.",
    );
  }
  return normalized;
}

export function registryArtifactDisplayPath(relativePath: string): string {
  return `<artifact>/${normalizeArtifactRelativePath(relativePath)}`;
}

export function resolveRegistryArtifactCsv(
  artifactDirectory: string,
  relativePath = REGISTRY_ARTIFACT_CSV,
): ResolvedRegistryArtifact {
  if (!artifactDirectory) {
    throw new Error("Registry artifact download directory is required.");
  }
  const normalized = normalizeArtifactRelativePath(relativePath);
  const root = resolve(artifactDirectory);
  const resolvedPath = resolve(root, ...normalized.split("/"));
  const relativeToRoot = relative(root, resolvedPath);
  if (
    relativeToRoot === ".." ||
    relativeToRoot.startsWith(`..${sep}`) ||
    isAbsolute(relativeToRoot)
  ) {
    throw new Error(
      "Registry artifact CSV resolved outside the download directory.",
    );
  }
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(resolvedPath);
  } catch {
    throw new Error("Registry artifact CSV is missing before database access.");
  }
  if (!stats.isFile()) {
    throw new Error("Registry artifact CSV is not a file.");
  }
  return {
    resolvedPath,
    displayPath: registryArtifactDisplayPath(normalized),
    sizeBytes: stats.size,
  };
}

export function formatRegistryArtifactSummary(
  result: Pick<ResolvedRegistryArtifact, "displayPath" | "sizeBytes"> | null,
  fallbackRelativePath = REGISTRY_ARTIFACT_CSV,
): string {
  return [
    "## Registry artifact preflight",
    "",
    `- Resolved CSV: \`${result?.displayPath ?? registryArtifactDisplayPath(fallbackRelativePath)}\``,
    `- File size: ${result ? `${result.sizeBytes} bytes` : "unavailable"}`,
    `- Ready before database access: **${Boolean(result)}**`,
    "",
  ].join("\n");
}
