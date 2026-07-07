import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface DataPathResolveOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  moduleUrl?: string;
}

const DATA_DIR_ENV = "FARMASSIST_DATA_DIR";

function existingDirectory(path: string): string | null {
  try {
    return existsSync(path) && statSync(path).isDirectory() ? path : null;
  } catch {
    return null;
  }
}

function moduleDir(moduleUrl: string | undefined, fallback: string): string {
  if (!moduleUrl) return fallback;
  try {
    return dirname(fileURLToPath(moduleUrl));
  } catch {
    return fallback;
  }
}

function unique(paths: string[]): string[] {
  return [...new Set(paths)];
}

export function candidateDataDirs(
  options: DataPathResolveOptions = {},
): string[] {
  const cwd = resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const fromModule = moduleDir(options.moduleUrl, cwd);
  const envDir = env[DATA_DIR_ENV]?.trim();

  return unique([
    ...(envDir ? [resolve(envDir)] : []),
    resolve(cwd, "data"),
    resolve(cwd, "../data"),
    resolve(cwd, "../../data"),
    resolve(cwd, "../../../data"),
    resolve(fromModule, "data"),
    resolve(fromModule, "../data"),
    resolve(fromModule, "../../data"),
    resolve(fromModule, "../../../data"),
    resolve(fromModule, "../../../../data"),
    resolve(fromModule, "../../../../../data"),
    "/opt/render/project/src/data",
  ]);
}

export function findDataDir(
  options: DataPathResolveOptions = {},
): string | null {
  return candidateDataDirs(options)
    .map(existingDirectory)
    .find((dir): dir is string => dir !== null) ?? null;
}

export function findDataSubdir(
  subdir: string,
  options: DataPathResolveOptions = {},
): string | null {
  for (const dir of candidateDataDirs(options)) {
    const fullPath = resolve(dir, subdir);
    const existing = existingDirectory(fullPath);
    if (existing) return existing;
  }
  return null;
}

export { DATA_DIR_ENV };
