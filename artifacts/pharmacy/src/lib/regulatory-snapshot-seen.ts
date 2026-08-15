import type { RegulatoryRadarRefresh } from "@workspace/api-client-react";

export const LAST_SEEN_REG_SNAPSHOT_KEY = "lastSeenRegSnapshot";

interface SnapshotStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserSnapshotStorage(): SnapshotStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function regulatorySnapshotVersion(
  result: RegulatoryRadarRefresh | null,
): string | null {
  if (!result || result.status === "failed") return null;
  if (!result.latestDocumentDate && result.recordCount <= 0) return null;
  return `${result.latestDocumentDate ?? "unknown"}:${result.recordCount}`;
}

export function readLastSeenRegSnapshot(
  target: SnapshotStorage | null = browserSnapshotStorage(),
): string | null {
  if (!target) return null;
  try {
    return target.getItem(LAST_SEEN_REG_SNAPSHOT_KEY);
  } catch {
    return null;
  }
}

export function markRegSnapshotSeen(
  version: string,
  target: SnapshotStorage | null = browserSnapshotStorage(),
): void {
  if (!version || !target) return;
  try {
    target.setItem(LAST_SEEN_REG_SNAPSHOT_KEY, version);
  } catch {
    // A blocked localStorage must not block access to regulatory updates.
  }
}

export function hasUnseenRegSnapshot(
  version: string | null,
  lastSeen: string | null,
): boolean {
  return Boolean(version && version !== lastSeen);
}
