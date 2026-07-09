import { describe, expect, it } from "vitest";
import { RunBetaDashboardCheckBody } from "@workspace/api-zod";
import {
  buildBetaDashboardStatus,
  runBetaDashboardCheck,
} from "../dashboard";

describe("beta dashboard status", () => {
  it("builds a closed beta dashboard summary", async () => {
    const status = await buildBetaDashboardStatus();
    expect(status.readiness.score).toBeGreaterThanOrEqual(0);
    expect(status.scenarios.total).toBeGreaterThan(0);
    expect(status.searchQuality.hitRatePct).toBeGreaterThanOrEqual(0);
    expect(status.realWorld.total).toBeGreaterThan(0);
    expect(status.realWorld.hitRatePct).toBeGreaterThanOrEqual(0);
    expect(status.ingestion.candidateRows).toBeGreaterThan(0);
    expect(status.ingestion.ok).toBe(true);
    expect(status.runtime.staticFallbackEnabled).toBe(true);
    expect(status.dataQuality.mappingsCount).toBeGreaterThan(0);
  });

  it("never exposes DATABASE_URL or API keys", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalGemini = process.env.GEMINI_API_KEY;
    const originalOpenAi = process.env.OPENAI_API_KEY;
    const originalRuntime = process.env.KNOWLEDGE_DB_RUNTIME;
    process.env.DATABASE_URL = "postgresql://user:password@example.test/db";
    process.env.GEMINI_API_KEY = "gemini-secret";
    process.env.OPENAI_API_KEY = "openai-secret";
    delete process.env.KNOWLEDGE_DB_RUNTIME;
    try {
      const [status, diagnostics] = await Promise.all([
        buildBetaDashboardStatus(),
        runBetaDashboardCheck("diagnostics"),
      ]);
      const json = JSON.stringify({ status, diagnostics });
      expect(json).not.toContain("postgresql://");
      expect(json).not.toContain("gemini-secret");
      expect(json).not.toContain("openai-secret");
      expect(json).not.toContain("password@example");
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
      if (originalGemini === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = originalGemini;
      if (originalOpenAi === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalOpenAi;
      if (originalRuntime === undefined) delete process.env.KNOWLEDGE_DB_RUNTIME;
      else process.env.KNOWLEDGE_DB_RUNTIME = originalRuntime;
    }
  }, 10_000);

  it("reports static fallback when DB is unavailable", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalRuntime = process.env.KNOWLEDGE_DB_RUNTIME;
    delete process.env.DATABASE_URL;
    delete process.env.KNOWLEDGE_DB_RUNTIME;
    try {
      const status = await buildBetaDashboardStatus();
      expect(status.runtime.mode).toBe("static");
      expect(status.runtime.dbConfigured).toBe(false);
      expect(status.runtime.staticFallbackEnabled).toBe(true);
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
      if (originalRuntime === undefined) delete process.env.KNOWLEDGE_DB_RUNTIME;
      else process.env.KNOWLEDGE_DB_RUNTIME = originalRuntime;
    }
  });
});

describe("beta dashboard checks", () => {
  it("runs readiness check", async () => {
    const result = await runBetaDashboardCheck("readiness");
    expect(result.checkType).toBe("readiness");
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.passed).toBeGreaterThan(0);
    expect(result.summary).toContain("Readiness score");
  });

  it("runs all beta scenarios", async () => {
    const result = await runBetaDashboardCheck("scenarios");
    expect(result.checkType).toBe("scenarios");
    expect(result.passed).toBeGreaterThan(0);
    expect(result.failed).toBe(0);
  });

  it("runs search quality check", async () => {
    const result = await runBetaDashboardCheck("search_quality");
    expect(result.checkType).toBe("search_quality");
    expect(result.score).toBe(100);
    expect(result.failed).toBe(0);
  });

  it("runs real-world pharmacy scenarios without exposing local paths", async () => {
    const result = await runBetaDashboardCheck("real_world");
    const json = JSON.stringify(result);

    expect(result.checkType).toBe("real_world");
    expect(result.passed).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(json).not.toMatch(/[A-Za-z]:\\/);
    expect(json).not.toContain("/opt/render/project");
    expect(json).not.toContain("postgresql://");
  });

  it("runs ingestion check without exposing local paths or secrets", async () => {
    const result = await runBetaDashboardCheck("ingestion");
    const json = JSON.stringify(result);

    expect(result.checkType).toBe("ingestion");
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
    expect(json).not.toMatch(/[A-Za-z]:\\/);
    expect(json).not.toContain("/opt/render/project");
    expect(json).not.toContain("postgresql://");
  });

  it("runs full safe check", async () => {
    const result = await runBetaDashboardCheck("full_safe_check");
    expect(result.checkType).toBe("full_safe_check");
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.status).not.toBe("failed");
    expect(result.details).toHaveProperty("readiness");
    expect(result.details).toHaveProperty("realWorld");
    expect(result.details).toHaveProperty("ingestion");
  });

  it("rejects invalid check types at the API schema boundary", () => {
    const parsed = RunBetaDashboardCheckBody.safeParse({ checkType: "run_shell" });
    expect(parsed.success).toBe(false);
  });
});
