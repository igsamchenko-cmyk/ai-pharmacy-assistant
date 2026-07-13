export const NATIONAL_LIST_SOURCE_URL =
  "https://zakon.rada.gov.ua/laws/show/333-2009-%D0%BF/print";
export const NATIONAL_LIST_CANONICAL_URL =
  "https://zakon.rada.gov.ua/laws/show/333-2009-%D0%BF#Text";
export const NATIONAL_LIST_TITLE =
  "Деякі питання державного регулювання цін на лікарські засоби і вироби медичного призначення";
export const NATIONAL_LIST_ACT_NUMBER = "333";
export const NATIONAL_LIST_ACT_DATE = "2009-03-25";
export const NATIONAL_LIST_REVISION_DATE = "2025-10-10";
export const NATIONAL_LIST_EFFECTIVE_DATE = "2025-10-10";
export const NATIONAL_LIST_EXPECTED_DOCUMENT_HASH =
  "483ce7c0319e72294762fdec7032de64271ee263dea8f3b9dc9197ffe0faaa75";
export const NATIONAL_LIST_PARSER_VERSION = "national-list-html-v2";
export const NATIONAL_LIST_RESOLVER_VERSION = "national-list-resolver-v2";

export const NATIONAL_LIST_MATCH_STATUSES = [
  "exact",
  "ingredient_only",
  "uncertain",
  "not_listed",
  "not_applicable",
] as const;
export type NationalListMatchStatus =
  (typeof NATIONAL_LIST_MATCH_STATUSES)[number];

export interface NationalListSourceMetadata {
  title: string;
  actNumber: string;
  actDate: string;
  revisionDate: string;
  effectiveDate: string;
  sourceUrl: string;
  canonicalUrl: string;
  sourceDomain: string;
  checkedAt: string;
  sourceFormat: "html";
  documentHash: string;
  byteSize: number;
  parserVersion: string;
}

export interface NationalListEntry {
  stableKey: string;
  officialNameUa: string;
  officialNameEn: string;
  ingredients: string[];
  compositionSignature: string;
  dosageForms: string[];
  routes: string[];
  strengths: string[];
  dosageText: string;
  section: string;
  category: string;
  restrictions: string;
  sourceUrl: string;
  sourceHash: string;
  sourceLocator: string;
  reviewStatus: "reviewed" | "needs_review";
}

export interface NationalListSnapshot {
  releaseId: string;
  status: "draft" | "reviewed" | "active" | "superseded";
  source: NationalListSourceMetadata;
  counts: {
    raw: number;
    parsed: number;
    valid: number;
    invalid: number;
    provenanceCoverage: number;
  };
  errors: string[];
  entries: NationalListEntry[];
}

export interface NationalListMatch {
  status: NationalListMatchStatus;
  entryStableKey: string | null;
  reason: string;
  ingredientMatch: "match" | "mismatch" | "unknown" | "not_applicable";
  formMatch: "match" | "mismatch" | "unknown" | "not_applicable";
  routeMatch: "match" | "mismatch" | "unknown" | "not_applicable";
  strengthMatch: "match" | "mismatch" | "unknown" | "not_applicable";
  resolverVersion: string;
}

export function isOfficialNationalListUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "zakon.rada.gov.ua" ||
        url.hostname.endsWith(".gov.ua"));
  } catch {
    return false;
  }
}
