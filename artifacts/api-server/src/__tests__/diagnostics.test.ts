import { describe, expect, it } from "vitest";
import { buildDiagnosticsPanelData } from "../diagnostics";

describe("diagnostics panel data", () => {
  it("reports sanitized runtime and provider booleans", async () => {
    const data = await buildDiagnosticsPanelData({
      GEMINI_API_KEY: "gemini-secret",
      OPENAI_API_KEY: "openai-secret",
      ENABLE_OPENAI: "true",
      APP_RELEASE_LABEL: "test-release",
      APP_RELEASE_VERSION: "v1.2.3",
      npm_package_version: "1.2.3",
    });
    expect(data.app.releaseLabel).toBe("test-release");
    expect(data.app.version).toBe("v1.2.3");
    expect(data.providers.geminiConfigured).toBe(true);
    expect(data.providers.openAiEnabled).toBe(true);
  });

  it("uses the production release metadata when package env is unavailable", async () => {
    const data = await buildDiagnosticsPanelData({ npm_package_version: "0.0.0" });

    expect(data.app.releaseLabel).toContain("v1.6.0");
    expect(data.app.version).toBe("v1.6.0");
    expect(data.app.version).not.toBe("0.0.0");
  });

  it("never exposes provider keys", async () => {
    const data = await buildDiagnosticsPanelData({
      GEMINI_API_KEY: "gemini-secret",
      OPENAI_API_KEY: "openai-secret",
      ENABLE_OPENAI: "true",
    });
    const json = JSON.stringify(data);
    expect(json).not.toContain("gemini-secret");
    expect(json).not.toContain("openai-secret");
  });

  it("never exposes DATABASE_URL contents", async () => {
    const data = await buildDiagnosticsPanelData({
      DATABASE_URL: "postgresql://user:password@example.test/db",
    });
    expect(JSON.stringify(data)).not.toContain("postgresql://");
    expect(data.runtime).toHaveProperty("dbConfigured");
  });

  it("includes dictionary and mapping counts", async () => {
    const data = await buildDiagnosticsPanelData();
    expect(data.knowledge.dictionaryBatchCount).toBeGreaterThan(0);
    expect(data.knowledge.mappingsCount).toBeGreaterThan(0);
  });

  it("never exposes report filesystem paths", async () => {
    const data = await buildDiagnosticsPanelData();
    expect(data.reports.quality).not.toHaveProperty("path");
    expect(data.reports.searchQuality).not.toHaveProperty("path");
    expect(data.reports.readiness).not.toHaveProperty("path");
    const json = JSON.stringify(data.reports);
    expect(json).not.toContain("artifacts/reports");
    expect(json).not.toMatch(/[A-Za-z]:\\/);
  });

  it("links to closed beta docs by path only", async () => {
    const data = await buildDiagnosticsPanelData();
    expect(data.references.scenarioDocs).toBe("docs/TEST_SCENARIOS.md");
    expect(data.references.checklistDocs).toBe("docs/CLOSED_BETA_CHECKLIST.md");
  });
});

