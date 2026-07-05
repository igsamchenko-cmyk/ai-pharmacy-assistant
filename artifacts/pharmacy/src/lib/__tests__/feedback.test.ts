import { describe, expect, it } from "vitest";
import {
  createFeedbackPayload,
  FEEDBACK_STORAGE_KEY,
  getMemoryFeedbackReports,
  saveFeedbackReport,
  validateFeedbackPayload,
  type FeedbackStorage,
} from "../feedback";

function memoryStorage(seed: Record<string, string> = {}): FeedbackStorage {
  const data = { ...seed };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe("feedback payload validation", () => {
  it("creates a typed closed beta feedback payload", () => {
    const payload = createFeedbackPayload({
      id: "feedback-1",
      type: "search_miss",
      context: "query:Нурофен",
      timestamp: new Date("2026-07-05T00:00:00.000Z"),
    });
    expect(payload.type).toBe("search_miss");
    expect(payload.timestamp).toBe("2026-07-05T00:00:00.000Z");
  });

  it("rejects invalid feedback types", () => {
    const payload = createFeedbackPayload({
      id: "feedback-1",
      type: "other",
      context: "context",
    });
    const invalid = { ...payload, type: "billing" };
    expect(validateFeedbackPayload(invalid as typeof payload)).toContain(
      "Feedback type is invalid.",
    );
  });

  it("requires context", () => {
    const payload = createFeedbackPayload({
      id: "feedback-1",
      type: "other",
      context: "   ",
    });
    expect(validateFeedbackPayload(payload)).toContain(
      "Feedback context is required.",
    );
  });

  it("rejects patient-identifiable notes", () => {
    const payload = createFeedbackPayload({
      id: "feedback-1",
      type: "safety_issue",
      context: "interaction",
      note: "телефон +380 50 111 22 33",
    });
    expect(validateFeedbackPayload(payload).join(" ")).toContain(
      "patient-identifiable",
    );
  });

  it("rejects secret-looking source snapshots", () => {
    const payload = createFeedbackPayload({
      id: "feedback-1",
      type: "ui_bug",
      context: "diagnostics",
      sourceSnapshot: { DATABASE_URL: "postgresql://secret" },
    });
    expect(validateFeedbackPayload(payload).join(" ")).toContain("secrets");
  });
});

describe("feedback storage fallback", () => {
  it("stores valid feedback in localStorage-compatible storage", () => {
    const storage = memoryStorage();
    const payload = createFeedbackPayload({
      id: "feedback-1",
      type: "interaction_issue",
      context: "warfarin+ibuprofen",
    });
    const result = saveFeedbackReport(payload, storage);
    expect(result.ok).toBe(true);
    expect(result.storedIn).toBe("localStorage");
    expect(storage.getItem(FEEDBACK_STORAGE_KEY)).toContain("warfarin");
  });

  it("prepends new reports", () => {
    const storage = memoryStorage({
      [FEEDBACK_STORAGE_KEY]: JSON.stringify([
        createFeedbackPayload({
          id: "old",
          type: "other",
          context: "old",
        }),
      ]),
    });
    const payload = createFeedbackPayload({
      id: "new",
      type: "other",
      context: "new",
    });
    saveFeedbackReport(payload, storage);
    expect(storage.getItem(FEEDBACK_STORAGE_KEY)?.indexOf("new")).toBeLessThan(
      storage.getItem(FEEDBACK_STORAGE_KEY)?.indexOf("old") ?? 999,
    );
  });

  it("falls back to memory when storage throws", () => {
    const payload = createFeedbackPayload({
      id: "feedback-memory",
      type: "ui_bug",
      context: "offline",
    });
    const result = saveFeedbackReport(payload, {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(result.ok).toBe(true);
    expect(result.storedIn).toBe("memory");
    expect(getMemoryFeedbackReports()[0].id).toBe("feedback-memory");
  });

  it("does not store invalid payloads", () => {
    const payload = createFeedbackPayload({
      id: "bad",
      type: "other",
      context: "телефон +380 50 111 22 33",
    });
    const result = saveFeedbackReport(payload, memoryStorage());
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("uses memory storage when no browser storage is provided", () => {
    const payload = createFeedbackPayload({
      id: "feedback-no-storage",
      type: "other",
      context: "no-storage",
    });
    const result = saveFeedbackReport(payload, null);
    expect(result.ok).toBe(true);
    expect(result.storedIn).toBe("memory");
  });
});

