export const FARMASSIST_RELEASE = {
  version: "v1.6.0",
  label: "v1.6.0 - Ukrainian Registry Database Scaling",
} as const;

function configuredValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function packageVersion(value: string | undefined): string | undefined {
  const version = configuredValue(value);
  return version && version !== "0.0.0" ? version : undefined;
}

export function resolveReleaseMetadata(env: NodeJS.ProcessEnv): {
  version: string;
  label: string;
} {
  const version =
    packageVersion(env.APP_RELEASE_VERSION) ??
    packageVersion(env.npm_package_version) ??
    FARMASSIST_RELEASE.version;

  return {
    version,
    label:
      configuredValue(env.APP_RELEASE_LABEL) ??
      (version === FARMASSIST_RELEASE.version
        ? FARMASSIST_RELEASE.label
        : `${version} - FarmAssist`),
  };
}
