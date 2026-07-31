import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findWorkspaceRoot, resolveWorkspacePath } from "./dataPath";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function workspaceFixture(): Promise<{
  root: string;
  packageDirectory: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "farmassist-workspace-"));
  temporaryDirectories.push(root);
  const packageDirectory = join(root, "artifacts", "api-server");
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
  return { root, packageDirectory };
}

describe("workspace-relative output paths", () => {
  it("finds the workspace root from a filtered package cwd", async () => {
    const fixture = await workspaceFixture();

    expect(findWorkspaceRoot({ cwd: fixture.packageDirectory })).toBe(
      fixture.root,
    );
  });

  it("writes a relative candidate path under the workspace root", async () => {
    const fixture = await workspaceFixture();

    expect(
      resolveWorkspacePath("data/series-restrictions/ua-dls.json", {
        cwd: fixture.packageDirectory,
      }),
    ).toBe(join(fixture.root, "data", "series-restrictions", "ua-dls.json"));
  });

  it("preserves absolute output paths", async () => {
    const fixture = await workspaceFixture();
    const absoluteOutput = resolve(
      fixture.root,
      "reports",
      "regulatory-update.json",
    );

    expect(isAbsolute(absoluteOutput)).toBe(true);
    expect(
      resolveWorkspacePath(absoluteOutput, { cwd: fixture.packageDirectory }),
    ).toBe(absoluteOutput);
  });
});
