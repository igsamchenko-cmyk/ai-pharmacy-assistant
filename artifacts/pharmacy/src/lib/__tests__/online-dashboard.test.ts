import { describe, expect, it } from "vitest";
import type { BetaDashboardStatus, DataSourcesResponse } from "@workspace/api-client-react";
import { DISCLAIMER_TEXT } from "../constants";
import {
  COMPARE_EXAMPLES,
  DASHBOARD_CARDS,
  DB_ABSENT_WARNING,
  GEMINI_ABSENT_WARNING,
  INTERACTION_EXAMPLES,
  SEARCH_EXAMPLES,
  buildRuntimeSummary,
  containsSecretMarkers,
  visibleDashboardCards,
  visibleNavItems,
} from "../online-dashboard";

const betaStatus: BetaDashboardStatus = {
  generatedAt: "2026-07-07T00:00:00.000Z",
  status: "warning",
  readiness: { score: 93, ready: true, summary: "ready", warnings: [] },
  scenarios: { passed: 24, failed: 0, total: 24, warnings: [] },
  searchQuality: {
    totalQueries: 7,
    hitRatePct: 100,
    topResultAccuracyPct: 100,
    missesCount: 0,
    warnings: [],
  },
  runtime: {
    mode: "static",
    dbConfigured: false,
    dbAvailable: false,
    staticFallbackEnabled: true,
    warnings: [],
  },
  dataQuality: {
    mappingsCount: 0,
    sourceCoveragePct: 100,
    atcCoveragePct: 100,
    conflicts: 0,
    ok: true,
    warnings: [],
  },
  reviewQueue: { pending: 0, needsReview: 0, approved: 0, rejected: 0, warnings: [] },
  diagnostics: { releaseLabel: "v1.4", version: "1.4.0", warnings: [] },
};

const sources: DataSourcesResponse = {
  sources: [
    {
      id: "gemini",
      name: "Gemini",
      category: "ai",
      status: "optional",
      requiresKey: true,
      detail: "disabled safely",
    },
    {
      id: "openai",
      name: "OpenAI",
      category: "ai",
      status: "disabled",
      requiresKey: true,
      detail: "disabled safely",
    },
  ],
};

describe("usable online dashboard configuration", () => {
  it("exposes the post-login dashboard cards for authenticated users", () => {
    const cards = visibleDashboardCards("user");
    expect(cards.map((card) => card.title)).toEqual(
      expect.arrayContaining([
        "Пошук препарату",
        "Перевірка взаємодій",
        "Порівняння препаратів",
        "Beta Dashboard / Панель тестування",
        "Hospital quick mode",
      ]),
    );
  });

  it("keeps the beta dashboard link prominent", () => {
    const betaCard = DASHBOARD_CARDS.find((card) => card.id === "beta-dashboard");
    expect(betaCard?.href).toBe("/beta-dashboard");
    expect(betaCard?.prominent).toBe(true);
  });

  it("renders search, interaction and compare examples", () => {
    expect(SEARCH_EXAMPLES.map((example) => example.label)).toEqual([
      "Нурофен",
      "Парацетамол",
      "Ібупрофен",
      "Амоксиклав",
      "Варфарин",
      "Цефтріаксон",
      "Лозартан",
    ]);
    expect(INTERACTION_EXAMPLES.map((example) => example.label)).toContain(
      "Варфарин + Ібупрофен",
    );
    expect(COMPARE_EXAMPLES[0]).toMatchObject({
      label: "Ібупрофен vs Парацетамол",
      href: expect.stringContaining("/compare?example="),
    });
  });

  it("summarizes runtime status without exposing secret-looking values", () => {
    const summary = buildRuntimeSummary({
      status: betaStatus,
      sources,
      role: "user",
      isLocalBeta: true,
    });
    const serialized = JSON.stringify(summary);

    expect(summary.runtimeMode).toBe("static fallback");
    expect(summary.postgresqlConfigured).toBe(false);
    expect(summary.openAiEnabled).toBe(false);
    expect(summary.authMode).toBe("local private beta");
    expect(containsSecretMarkers(serialized)).toBe(false);
  });

  it("shows safe DB and Gemini absent warnings", () => {
    const summary = buildRuntimeSummary({
      status: betaStatus,
      sources,
      role: "user",
      isLocalBeta: true,
    });

    expect(summary.dbWarning).toBe(DB_ABSENT_WARNING);
    expect(summary.geminiWarning).toBe(GEMINI_ABSENT_WARNING);
    expect(summary.dbWarning).not.toContain("DATABASE_URL");
    expect(summary.geminiWarning).not.toContain("API_KEY");
  });

  it("keeps role-based navigation scoped", () => {
    const userNav = visibleNavItems("user").map((item) => item.href);
    const reviewerNav = visibleNavItems("reviewer").map((item) => item.href);
    const adminNav = visibleNavItems("admin").map((item) => item.href);

    expect(userNav).toContain("/beta-dashboard");
    expect(userNav).not.toContain("/review");
    expect(userNav).not.toContain("/data-quality");
    expect(reviewerNav).toEqual(expect.arrayContaining(["/review", "/data-quality"]));
    expect(adminNav).toContain("/about");
  });

  it("detects secret markers if unsafe diagnostics are accidentally added", () => {
    expect(containsSecretMarkers("DATABASE_URL=postgresql://example")).toBe(true);
    expect(containsSecretMarkers("OPENAI_API_KEY=sk-test")).toBe(true);
  });

  it("keeps medical safety disclaimer copy available", () => {
    expect(DISCLAIMER_TEXT).toContain("медичною консультацією");
    expect(DISCLAIMER_TEXT).toContain("лікаря");
    expect(DISCLAIMER_TEXT.length).toBeGreaterThan(120);
  });
});
