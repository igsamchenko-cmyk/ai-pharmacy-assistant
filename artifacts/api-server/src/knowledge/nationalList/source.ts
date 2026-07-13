import {
  NATIONAL_LIST_SOURCE_URL,
  NATIONAL_LIST_EXPECTED_DOCUMENT_HASH,
  isOfficialNationalListUrl,
  type NationalListSnapshot,
} from "./model";
import { parseNationalListHtml } from "./parser";

export async function downloadNationalListHtml(
  sourceUrl = NATIONAL_LIST_SOURCE_URL,
): Promise<{ html: string; checkedAt: string }> {
  if (!isOfficialNationalListUrl(sourceUrl)) {
    throw new Error("National-list source must use an official Ukrainian government domain.");
  }
  const response = await fetch(sourceUrl, {
    headers: { Accept: "text/html", "User-Agent": "FarmAssist/1.8 source-audit" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error("Official national-list source download failed.");
  const html = await response.text();
  if (html.length < 100_000 || html.length > 2_000_000) {
    throw new Error("Official national-list source size is outside the expected safety bounds.");
  }
  return { html, checkedAt: new Date().toISOString() };
}

export interface ActivationGateResult {
  ready: boolean;
  blockers: string[];
}

export function evaluateNationalListActivation(
  snapshot: NationalListSnapshot,
  previous?: NationalListSnapshot,
): ActivationGateResult {
  const blockers: string[] = [];
  if (snapshot.status !== "reviewed") blockers.push("Release is not reviewed.");
  if (!isOfficialNationalListUrl(snapshot.source.sourceUrl)) blockers.push("Source is not official.");
  if (!/^[a-f\d]{64}$/u.test(snapshot.source.documentHash)) blockers.push("Source hash is missing.");
  if (snapshot.source.documentHash !== NATIONAL_LIST_EXPECTED_DOCUMENT_HASH) {
    blockers.push("Source hash has not been reviewed for this release.");
  }
  if (snapshot.counts.invalid > 0 || snapshot.errors.length > 0) blockers.push("Parser errors exist.");
  if (snapshot.counts.raw !== snapshot.counts.parsed ||
    snapshot.counts.parsed !== snapshot.counts.valid + snapshot.counts.invalid ||
    snapshot.entries.length !== snapshot.counts.valid) {
    blockers.push("Snapshot counts do not match parsed entries.");
  }
  if (snapshot.counts.provenanceCoverage !== 100) blockers.push("Provenance coverage is below 100%.");
  if (snapshot.counts.valid < 100) blockers.push("Parsed entry count is anomalously low.");
  if (previous?.counts.valid) {
    const delta = Math.abs(snapshot.counts.valid - previous.counts.valid) / previous.counts.valid;
    if (delta > 0.3) blockers.push("Entry-count delta exceeds 30%.");
  }
  const duplicateExactKeys = snapshot.entries.length -
    new Set(snapshot.entries.map((entry) => entry.stableKey)).size;
  if (duplicateExactKeys > 0) blockers.push("Duplicate stable entry keys exist.");
  if (snapshot.entries.some((entry) =>
    entry.reviewStatus !== "reviewed" ||
    entry.sourceHash !== snapshot.source.documentHash ||
    !entry.sourceLocator ||
    !isOfficialNationalListUrl(entry.sourceUrl))) {
    blockers.push("Entry review or provenance is incomplete.");
  }
  return { ready: blockers.length === 0, blockers };
}

function comparableEntry(entry: NationalListSnapshot["entries"][number]): string {
  return JSON.stringify({
    officialNameUa: entry.officialNameUa,
    officialNameEn: entry.officialNameEn,
    ingredients: entry.ingredients,
    compositionSignature: entry.compositionSignature,
    dosageForms: entry.dosageForms,
    routes: entry.routes,
    strengths: entry.strengths,
    dosageText: entry.dosageText,
    section: entry.section,
    category: entry.category,
    restrictions: entry.restrictions,
    reviewStatus: entry.reviewStatus,
  });
}

export function diffNationalListSnapshots(
  current: NationalListSnapshot,
  previous?: NationalListSnapshot,
) {
  if (!previous) {
    return { added: current.counts.valid, removed: 0, changed: 0 };
  }
  const oldEntries = new Map(previous.entries.map((entry) => [entry.stableKey, entry]));
  const newEntries = new Map(current.entries.map((entry) => [entry.stableKey, entry]));
  const added = [...newEntries.keys()].filter((key) => !oldEntries.has(key)).length;
  const removed = [...oldEntries.keys()].filter((key) => !newEntries.has(key)).length;
  const changed = [...newEntries.entries()].filter(([key, entry]) => {
    const previousEntry = oldEntries.get(key);
    return previousEntry && comparableEntry(entry) !== comparableEntry(previousEntry);
  }).length;
  return { added, removed, changed };
}

export async function downloadAndParseNationalList(): Promise<NationalListSnapshot> {
  const { html, checkedAt } = await downloadNationalListHtml();
  return parseNationalListHtml(html, { checkedAt });
}
