import { describe, expect, it } from "vitest";
import type { RegulatoryRadarRefresh } from "@workspace/api-client-react";
import {
  LAST_SEEN_REG_SNAPSHOT_KEY,
  hasUnseenRegSnapshot,
  markRegSnapshotSeen,
  readLastSeenRegSnapshot,
  regulatorySnapshotVersion,
} from "./regulatory-snapshot-seen";

const snapshot: RegulatoryRadarRefresh = {
  version: "1.0",
  status: "updated",
  checkedAt: "2026-08-15T10:00:00.000Z",
  nextCheckAt: "2026-08-16T10:00:00.000Z",
  latestDocumentDate: "2026-08-15",
  recordCount: 63,
  addedCount: 4,
  updatedCount: 0,
};

describe("regulatory snapshot seen state", () => {
  it("uses a stable data version instead of the daily check timestamp", () => {
    expect(regulatorySnapshotVersion(snapshot)).toBe("2026-08-15:63");
    expect(
      regulatorySnapshotVersion({
        ...snapshot,
        checkedAt: "2026-08-15T22:00:00.000Z",
        status: "unchanged",
      }),
    ).toBe("2026-08-15:63");
  });

  it("shows once for a new version and stays hidden after marking it seen", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const version = regulatorySnapshotVersion(snapshot);
    expect(
      hasUnseenRegSnapshot(version, readLastSeenRegSnapshot(storage)),
    ).toBe(true);
    markRegSnapshotSeen(version!, storage);
    expect(values.get(LAST_SEEN_REG_SNAPSHOT_KEY)).toBe(version);
    expect(
      hasUnseenRegSnapshot(version, readLastSeenRegSnapshot(storage)),
    ).toBe(false);
  });

  it("fails closed when refresh data is unavailable", () => {
    expect(
      regulatorySnapshotVersion({ ...snapshot, status: "failed" }),
    ).toBeNull();
    expect(hasUnseenRegSnapshot(null, null)).toBe(false);
  });
});
