/**
 * Copyrighted / proprietary source guard.
 *
 * The dictionary may only grow from project-owned demo data and public, freely
 * usable references (WHO INN/ATC, public generic names). This guard refuses rows
 * whose `source_id` (or notes) reference known proprietary/commercial drug
 * databases, so a copyrighted dataset can never be imported by accident.
 *
 * It is a denylist of distinctive identifiers, matched case-insensitively as
 * whole tokens against the row's `source_id` and `notes`.
 */
import type { ImportRow } from "./format";

/** Distinctive tokens for proprietary drug databases we must never ingest. */
export const COPYRIGHTED_SOURCE_TOKENS = [
  "compendium",
  "vidal",
  "rlsnet",
  "rls",
  "drugs.com",
  "drugscom",
  "medscape",
  "uptodate",
  "micromedex",
  "lexicomp",
  "drugbank",
  "pdr",
  "davis",
  "epocrates",
] as const;

export interface GuardViolation {
  row: number;
  sourceId: string;
  token: string;
  message: string;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9.]+/i)
    .filter(Boolean);
}

function matchToken(haystack: string): string | null {
  const tokens = new Set(tokenize(haystack));
  for (const bad of COPYRIGHTED_SOURCE_TOKENS) {
    if (tokens.has(bad)) return bad;
  }
  return null;
}

/**
 * Scan rows for references to proprietary sources. Returns one violation per
 * offending row (checking `source_id` first, then `notes`).
 */
export function findCopyrightedSources(
  rows: readonly ImportRow[],
): GuardViolation[] {
  const violations: GuardViolation[] = [];
  rows.forEach((r, idx) => {
    const hit = matchToken(r.sourceId) ?? (r.notes ? matchToken(r.notes) : null);
    if (hit) {
      violations.push({
        row: idx + 1,
        sourceId: r.sourceId,
        token: hit,
        message: `Джерело «${r.sourceId}» схоже на пропрієтарну базу («${hit}») — імпорт заборонено.`,
      });
    }
  });
  return violations;
}

/** True when no row references a proprietary source. */
export function isImportSourceSafe(rows: readonly ImportRow[]): boolean {
  return findCopyrightedSources(rows).length === 0;
}
