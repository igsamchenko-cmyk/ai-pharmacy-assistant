import { appendFileSync } from "node:fs";
import {
  formatRegistryArtifactSummary,
  REGISTRY_ARTIFACT_CSV,
  resolveRegistryArtifactCsv,
} from "../knowledge/registryArtifactPath";

function appendOutput(path: string | undefined, content: string): void {
  if (path) appendFileSync(path, content, "utf8");
}

const artifactDirectory = process.env.REGISTRY_ARTIFACT_DIRECTORY ?? "";

try {
  const result = resolveRegistryArtifactCsv(
    artifactDirectory,
    REGISTRY_ARTIFACT_CSV,
  );
  const summary = formatRegistryArtifactSummary(result);
  appendOutput(
    process.env.GITHUB_OUTPUT,
    `csv_path=${result.resolvedPath}\ncsv_size_bytes=${result.sizeBytes}\n`,
  );
  appendOutput(process.env.GITHUB_STEP_SUMMARY, summary);
  process.stdout.write(summary);
} catch {
  const summary = formatRegistryArtifactSummary(null);
  appendOutput(process.env.GITHUB_STEP_SUMMARY, summary);
  process.stdout.write(summary);
  console.error("Registry artifact preflight failed before database access.");
  process.exitCode = 1;
}
