import { describe, it, expect } from "vitest";
import {
  buildDictionaryBatchSummary,
  listDictionaryBatchFiles,
  parseDictionaryBatchFile,
} from "../import/batches";
import { findCopyrightedSources } from "../import/guard";
import { isKnownSource } from "../provenance";

const files = listDictionaryBatchFiles();

describe("dictionary batch files", () => {
  it("ships the v0.9 batch set", () => {
    expect(files.map((file) => file.fileName)).toEqual([
      "0001-core-analgesics.csv",
      "0002-antibiotics.csv",
      "0003-cardiovascular-diuretics.csv",
      "0004-anticoagulants-antiplatelets.csv",
      "0005-gi-endocrine.csv",
      "0006-respiratory-allergy.csv",
      "0007-neuro-psych.csv",
      "0008-icu-emergency-electrolytes.csv",
      "0009-real-world-pharmacy.csv",
    ]);
  });

  it.each(files)("parses %s without row errors", (file) => {
    const parsed = parseDictionaryBatchFile(file);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.rows.length).toBeGreaterThan(0);
  });

  it.each(files)("keeps %s preview-safe", (file) => {
    const parsed = parseDictionaryBatchFile(file);
    expect(parsed.preview.wouldSucceed).toBe(true);
    expect(parsed.preview.missingSources).toBe(0);
    expect(parsed.preview.invalidAtc).toBe(0);
    expect(parsed.preview.copyrightViolations).toBe(0);
  });

  it.each(files)("uses known non-proprietary sources in %s", (file) => {
    const parsed = parseDictionaryBatchFile(file);
    expect(parsed.rows.every((row) => isKnownSource(row.sourceId))).toBe(true);
    expect(findCopyrightedSources(parsed.rows)).toHaveLength(0);
  });

  it.each(files)("does not ship brand rows in %s", (file) => {
    const parsed = parseDictionaryBatchFile(file);
    expect(parsed.rows.every((row) => row.nameType !== "brand")).toBe(true);
  });

  it.each(files)("keeps ATC and confidence populated in %s", (file) => {
    const parsed = parseDictionaryBatchFile(file);
    expect(parsed.rows.every((row) => row.atcCode)).toBe(true);
    expect(
      parsed.rows.every(
        (row) =>
          row.confidence === "verified" ||
          row.confidence === "high" ||
          row.confidence === "medium",
      ),
    ).toBe(true);
  });

  it("ships real-world additions as generic and review-safe mappings", () => {
    const file = files.find(
      (item) => item.fileName === "0009-real-world-pharmacy.csv",
    );
    expect(file).toBeDefined();
    const parsed = parseDictionaryBatchFile(file!);

    expect(parsed.rows.length).toBeGreaterThanOrEqual(40);
    expect(parsed.rows.every((row) => row.nameType !== "brand")).toBe(true);
    expect(parsed.rows.every((row) => isKnownSource(row.sourceId))).toBe(true);
    expect(findCopyrightedSources(parsed.rows)).toHaveLength(0);
    expect(parsed.preview.reviewDistribution.pending).toBeGreaterThan(0);
    expect(parsed.preview.reviewDistribution.needs_review).toBeGreaterThan(0);
  });
});

describe("dictionary batch summary", () => {
  const summary = buildDictionaryBatchSummary(files);

  it("summarizes all batch files", () => {
    expect(summary.files).toBe(9);
    expect(summary.totalRows).toBeGreaterThanOrEqual(500);
    expect(summary.fileSummaries).toHaveLength(9);
  });

  it("keeps the combined preview importable", () => {
    expect(summary.wouldSucceed).toBe(true);
    expect(summary.parseErrors).toBe(0);
    expect(summary.missingSources).toBe(0);
    expect(summary.invalidAtc).toBe(0);
    expect(summary.copyrightViolations).toBe(0);
  });

  it("reports useful Ukrainian coverage", () => {
    expect(summary.ukrainianRows).toBeGreaterThan(0);
    expect(summary.transliterationRows).toBeGreaterThan(0);
    expect(summary.ukrainianCoveragePct).toBeGreaterThan(40);
  });

  it("reports source, confidence, and review distributions", () => {
    expect(summary.bySource.public_generic_inn).toBeGreaterThan(0);
    expect(summary.bySource.project_generated_transliteration).toBeGreaterThan(
      0,
    );
    expect(summary.byConfidence.verified).toBeGreaterThan(0);
    expect(summary.byConfidence.high).toBeGreaterThan(0);
    expect(summary.byConfidence.medium).toBeGreaterThan(0);
    expect(summary.byReviewStatus.approved).toBeGreaterThan(0);
    expect(summary.byReviewStatus.pending).toBeGreaterThan(0);
    expect(summary.byReviewStatus.needs_review).toBeGreaterThan(0);
    expect(summary.byReviewStatus.rejected).toBe(0);
  });

  it("keeps suspicious rows out of approved batch data", () => {
    expect(summary.suspiciousBrandLikeRows).toBe(0);
    expect(summary.ambiguousAbbreviationRows).toBe(0);
    expect(summary.normalizationConflictRows).toBe(0);
  });

  it("tracks mappings by prioritized category", () => {
    expect(summary.byCategory["antibiotics"]).toBeGreaterThan(0);
    expect(summary.byCategory["cardiovascular diuretics"]).toBeGreaterThan(0);
    expect(summary.byCategory["respiratory allergy"]).toBeGreaterThan(0);
  });
});
