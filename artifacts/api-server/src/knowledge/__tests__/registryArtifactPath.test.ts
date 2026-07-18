import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatRegistryArtifactSummary,
  normalizeArtifactRelativePath,
  resolveRegistryArtifactCsv,
} from "../registryArtifactPath";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "registry-artifact-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("registry artifact path contract", () => {
  it("resolves the staged CSV from the explicit download directory", () => {
    const directory = temporaryDirectory();
    const csv = Buffer.from("registry,csv\n", "utf8");
    writeFileSync(join(directory, "reestr.csv"), csv);

    const result = resolveRegistryArtifactCsv(directory);
    expect(result).toMatchObject({
      resolvedPath: join(directory, "reestr.csv"),
      displayPath: "<artifact>/reestr.csv",
      sizeBytes: csv.length,
    });
    const summary = formatRegistryArtifactSummary(result);
    expect(summary).toContain("`<artifact>/reestr.csv`");
    expect(summary).toContain(`${csv.length} bytes`);
    expect(summary).not.toContain(directory);
  });

  it("fails when the CSV is missing before any database step", () => {
    expect(() => resolveRegistryArtifactCsv(temporaryDirectory())).toThrow(
      /missing before database access/,
    );
    expect(formatRegistryArtifactSummary(null)).toContain(
      "Ready before database access: **false**",
    );
  });

  it("normalizes Windows and Linux separators deterministically", () => {
    expect(normalizeArtifactRelativePath("checkpoint\\reestr.csv")).toBe(
      "checkpoint/reestr.csv",
    );
    expect(normalizeArtifactRelativePath("./checkpoint/reestr.csv")).toBe(
      "checkpoint/reestr.csv",
    );
  });

  it("rejects absolute and traversal paths", () => {
    expect(() => normalizeArtifactRelativePath("../reestr.csv")).toThrow();
    expect(() =>
      normalizeArtifactRelativePath("C:\\temp\\reestr.csv"),
    ).toThrow();
    expect(() => normalizeArtifactRelativePath("/tmp/reestr.csv")).toThrow();
  });

  it("rejects a directory where the CSV file is expected", () => {
    const directory = temporaryDirectory();
    mkdirSync(join(directory, "reestr.csv"));
    expect(() => resolveRegistryArtifactCsv(directory)).toThrow(/not a file/);
  });
});
