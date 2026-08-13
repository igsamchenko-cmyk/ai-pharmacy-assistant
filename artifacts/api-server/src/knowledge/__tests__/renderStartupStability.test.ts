import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(
  new URL("../../../../../", import.meta.url),
);

describe("Render startup stability", () => {
  it("uses an HTTP health check and avoids blocking startup on instruction indexing", () => {
    const renderBlueprint = readFileSync(
      `${repositoryRoot}/render.yaml`,
      "utf8",
    );
    const serverEntrypoint = readFileSync(
      `${repositoryRoot}/artifacts/api-server/src/index.ts`,
      "utf8",
    );

    expect(renderBlueprint).toContain("healthCheckPath: /api/healthz");
    expect(serverEntrypoint).toContain('app.listen(port, "0.0.0.0"');
    expect(serverEntrypoint).not.toContain("warmInstructionSearchIndex");
  });
});
