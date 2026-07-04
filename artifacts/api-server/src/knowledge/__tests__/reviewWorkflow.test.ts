import { describe, expect, it } from "vitest";
import {
  REVIEW_WORKFLOW_UNAVAILABLE_WARNING,
  MemoryReviewWorkflowStore,
  ReviewItemNotFoundError,
  applyReviewAction,
  createReviewStoreRow,
  encodeReviewList,
  getReviewStats,
  listReviewQueue,
  type ReviewWorkflowStore,
  type ReviewStoreRow,
  type ReviewAuditStoreRow,
  type ReviewMutationInput,
  type ReviewMutationResult,
} from "../reviewWorkflow";

function storeWithRows() {
  return new MemoryReviewWorkflowStore([
    createReviewStoreRow({ id: "pending", name: "Pending", normalized: "pending", reviewStatus: "pending" }),
    createReviewStoreRow({ id: "approved", name: "Approved", normalized: "approved", reviewStatus: "approved", confidence: "verified", confidenceScore: 100 }),
    createReviewStoreRow({ id: "rejected", name: "Rejected", normalized: "rejected", reviewStatus: "rejected" }),
    createReviewStoreRow({ id: "needs", name: "Needs", normalized: "needs", reviewStatus: "needs_review", confidence: "low", confidenceScore: 30 }),
  ]);
}

class FailingStore implements ReviewWorkflowStore {
  async listRows(): Promise<ReviewStoreRow[]> {
    throw new Error("db down");
  }
  async listAudit(): Promise<ReviewAuditStoreRow[]> {
    throw new Error("db down");
  }
  async updateReview(_id: string, _input: ReviewMutationInput): Promise<ReviewMutationResult> {
    throw new Error("db down");
  }
}

describe("review workflow queue", () => {
  it("defaults to pending rows", async () => {
    const queue = await listReviewQueue({}, storeWithRows());
    expect(queue.items.map((item) => item.id)).toEqual(["pending"]);
  });

  it("lists all statuses when requested", async () => {
    const queue = await listReviewQueue({ status: "all" }, storeWithRows());
    expect(queue.total).toBe(4);
  });

  it("filters approved rows", async () => {
    const queue = await listReviewQueue({ status: "approved" }, storeWithRows());
    expect(queue.items[0]?.id).toBe("approved");
  });

  it("filters rejected rows", async () => {
    const queue = await listReviewQueue({ status: "rejected" }, storeWithRows());
    expect(queue.items[0]?.id).toBe("rejected");
  });

  it("filters needs_review rows", async () => {
    const queue = await listReviewQueue({ status: "needs_review" }, storeWithRows());
    expect(queue.items[0]?.id).toBe("needs");
  });

  it("returns counts by status independent of selected status", async () => {
    const queue = await listReviewQueue({ status: "pending" }, storeWithRows());
    expect(queue.counts).toEqual({ pending: 1, approved: 1, rejected: 1, needs_review: 1 });
  });

  it("filters conflict-only rows", async () => {
    const store = new MemoryReviewWorkflowStore([
      createReviewStoreRow({ id: "plain", conflictFlags: "" }),
      createReviewStoreRow({ id: "conflict", conflictFlags: encodeReviewList(["name_multiple_ingredients"]) }),
    ]);
    const queue = await listReviewQueue({ status: "all", conflictOnly: true }, store);
    expect(queue.items.map((item) => item.id)).toEqual(["conflict"]);
  });

  it("reports conflict count across all rows", async () => {
    const store = new MemoryReviewWorkflowStore([
      createReviewStoreRow({ id: "a", conflictFlags: encodeReviewList(["x"]) }),
      createReviewStoreRow({ id: "b", conflictFlags: encodeReviewList(["y"]) }),
      createReviewStoreRow({ id: "c", conflictFlags: "" }),
    ]);
    const queue = await listReviewQueue({ status: "all" }, store);
    expect(queue.conflictCount).toBe(2);
  });

  it("filters by source id", async () => {
    const store = new MemoryReviewWorkflowStore([
      createReviewStoreRow({ id: "who", sourceKey: "who-inn" }),
      createReviewStoreRow({ id: "demo", sourceKey: "demo-catalog" }),
    ]);
    const queue = await listReviewQueue({ status: "all", sourceId: "demo-catalog" }, store);
    expect(queue.items.map((item) => item.id)).toEqual(["demo"]);
  });

  it("filters by locale", async () => {
    const store = new MemoryReviewWorkflowStore([
      createReviewStoreRow({ id: "uk", locale: "uk" }),
      createReviewStoreRow({ id: "en", locale: "en" }),
    ]);
    const queue = await listReviewQueue({ status: "all", locale: "en" }, store);
    expect(queue.items.map((item) => item.id)).toEqual(["en"]);
  });

  it("applies limit and offset", async () => {
    const queue = await listReviewQueue({ status: "all", limit: 2, offset: 1 }, storeWithRows());
    expect(queue.items.map((item) => item.id)).toEqual(["approved", "rejected"]);
  });

  it("clamps invalid low limits to one", async () => {
    const queue = await listReviewQueue({ status: "all", limit: -5 }, storeWithRows());
    expect(queue.limit).toBe(1);
    expect(queue.items).toHaveLength(1);
  });

  it("clamps high limits to one hundred", async () => {
    const queue = await listReviewQueue({ status: "all", limit: 500 }, storeWithRows());
    expect(queue.limit).toBe(100);
  });

  it("maps display metadata for a row", async () => {
    const queue = await listReviewQueue({ status: "pending" }, storeWithRows());
    expect(queue.items[0]).toMatchObject({
      entityType: "ingredient_name",
      displayName: "Pending",
      mappedIngredientName: "Review INN",
      sourceName: "WHO INN",
    });
  });

  it("preserves provenance on queue items", async () => {
    const queue = await listReviewQueue({ status: "pending" }, storeWithRows());
    expect(queue.items[0]?.provenance).toMatchObject({ sourceKey: "who-inn", evidenceLevel: "reference" });
  });

  it("parses conflict flags from JSON text", async () => {
    const store = new MemoryReviewWorkflowStore([
      createReviewStoreRow({ conflictFlags: encodeReviewList(["a", "b"]) }),
    ]);
    const queue = await listReviewQueue({}, store);
    expect(queue.items[0]?.conflictFlags).toEqual(["a", "b"]);
  });

  it("parses warning flags from pipe-delimited legacy text", async () => {
    const store = new MemoryReviewWorkflowStore([
      createReviewStoreRow({ validationWarnings: "a|b" }),
    ]);
    const queue = await listReviewQueue({}, store);
    expect(queue.items[0]?.validationWarnings).toEqual(["a", "b"]);
  });

  it("adds a warning for low confidence rows", async () => {
    const queue = await listReviewQueue({ status: "needs_review" }, storeWithRows());
    expect(queue.items[0]?.validationWarnings).toContain("Low confidence mapping requires review.");
  });

  it("adds a warning when source provenance is missing", async () => {
    const store = new MemoryReviewWorkflowStore([
      createReviewStoreRow({ sourceLabel: null }),
    ]);
    const queue = await listReviewQueue({}, store);
    expect(queue.items[0]?.validationWarnings).toContain("Source is not registered in provenance registry.");
  });

  it("falls back to an empty queue when the DB workflow is unavailable", async () => {
    const queue = await listReviewQueue({ status: "all" }, new FailingStore());
    expect(queue.items).toEqual([]);
    expect(queue.warnings).toContain(REVIEW_WORKFLOW_UNAVAILABLE_WARNING);
  });
});

describe("review workflow stats", () => {
  it("reports status counts", async () => {
    const stats = await getReviewStats(storeWithRows());
    expect(stats.counts).toEqual({ pending: 1, approved: 1, rejected: 1, needs_review: 1 });
  });

  it("reports low confidence count", async () => {
    const stats = await getReviewStats(storeWithRows());
    expect(stats.lowConfidenceCount).toBe(1);
  });

  it("reports approved runtime count", async () => {
    const stats = await getReviewStats(storeWithRows());
    expect(stats.approvedRuntimeCount).toBe(1);
  });

  it("reports latest review activity from audit log", async () => {
    const store = new MemoryReviewWorkflowStore([], [
      { id: "a1", entityType: "ingredient_name", entityId: "x", action: "approved", fromStatus: "pending", toStatus: "approved", note: null, reason: null, reviewedBy: null, importBatchId: null, sourceKey: null, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "a2", entityType: "ingredient_name", entityId: "x", action: "rejected", fromStatus: "approved", toStatus: "rejected", note: null, reason: null, reviewedBy: null, importBatchId: null, sourceKey: null, createdAt: "2026-02-01T00:00:00.000Z" },
    ]);
    const stats = await getReviewStats(store);
    expect(stats.latestReviewActivity).toBe("2026-02-01T00:00:00.000Z");
  });

  it("falls back to empty stats when unavailable", async () => {
    const stats = await getReviewStats(new FailingStore());
    expect(stats.counts.pending).toBe(0);
    expect(stats.warnings).toContain(REVIEW_WORKFLOW_UNAVAILABLE_WARNING);
  });
});

describe("review workflow actions", () => {
  it("approves a pending item", async () => {
    const store = storeWithRows();
    const result = await applyReviewAction("pending", "approved", "approved", { note: "ok", reviewedBy: "qa" }, store);
    expect(result.item.reviewStatus).toBe("approved");
    expect(result.item.reviewedBy).toBe("qa");
  });

  it("creates an audit entry when approving", async () => {
    const store = storeWithRows();
    const result = await applyReviewAction("pending", "approved", "approved", { note: "ok" }, store);
    expect(result.audit).toMatchObject({ action: "approved", fromStatus: "pending", toStatus: "approved" });
  });

  it("rejects an approved item", async () => {
    const store = storeWithRows();
    const result = await applyReviewAction("approved", "rejected", "rejected", { reason: "conflict" }, store);
    expect(result.item.reviewStatus).toBe("rejected");
    expect(result.audit.reason).toBe("conflict");
  });

  it("marks an item as needs_review", async () => {
    const store = storeWithRows();
    const result = await applyReviewAction("pending", "needs_review", "marked_needs_review", { note: "double-check" }, store);
    expect(result.item.reviewStatus).toBe("needs_review");
    expect(result.audit.action).toBe("marked_needs_review");
  });

  it("stores note text on the reviewed row", async () => {
    const store = storeWithRows();
    const result = await applyReviewAction("pending", "approved", "approved", { note: "source checked" }, store);
    expect(result.item.reviewNote).toBe("source checked");
  });

  it("uses reason as row note when note is absent", async () => {
    const store = storeWithRows();
    const result = await applyReviewAction("pending", "rejected", "rejected", { reason: "bad source" }, store);
    expect(result.item.reviewNote).toBe("bad source");
  });

  it("sets reviewedAt and updatedAt timestamps", async () => {
    const store = storeWithRows();
    const result = await applyReviewAction("pending", "approved", "approved", {}, store);
    expect(result.item.reviewedAt).toBeTruthy();
    expect(result.item.updatedAt).toBeTruthy();
  });

  it("preserves provenance during review action", async () => {
    const store = storeWithRows();
    const result = await applyReviewAction("pending", "approved", "approved", {}, store);
    expect(result.item.provenance.sourceKey).toBe("who-inn");
  });

  it("throws a typed error for invalid ids", async () => {
    await expect(
      applyReviewAction("missing", "approved", "approved", {}, storeWithRows()),
    ).rejects.toBeInstanceOf(ReviewItemNotFoundError);
  });
});