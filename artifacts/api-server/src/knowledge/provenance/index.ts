/**
 * Provenance — where every piece of knowledge comes from.
 *
 * v0.3 makes the knowledge base auditable: every mapping (name → ingredient),
 * every interaction rule and every catalog record can name its source and how
 * strong the evidence behind it is. This module is the single registry of
 * sources and the helpers that attach a {@link Provenance} to a record.
 *
 * It is deliberately data-only and DB-free so it stays pure and testable.
 */

/** How reliable a source is considered for a professional reference tool. */
export type SourceReliability = "high" | "medium" | "low";

/** The nature of a source. */
export type SourceType =
  | "official" // national/international register or official instruction
  | "reference" // pharmacology reference / nomenclature (e.g. WHO INN, ATC)
  | "demo" // illustrative demo data shipped with the MVP
  | "external"; // live third-party API (RxNorm, openFDA, …)

export interface Source {
  /** Stable natural key used as a foreign key across the knowledge base. */
  key: string;
  /** Human-readable Ukrainian label shown in the admin UI. */
  label: string;
  type: SourceType;
  reliability: SourceReliability;
  url?: string;
  /** Short Ukrainian note about scope / caveats. */
  note: string;
}

/**
 * Strength of evidence behind an individual record.
 * - established: well-documented, clinically established
 * - reference:  from a standard nomenclature/reference source
 * - theoretical: plausible/class-based, needs verification
 * - demo:       illustrative demo data, not validated
 */
export type EvidenceLevel =
  | "established"
  | "reference"
  | "theoretical"
  | "demo";

export interface Provenance {
  sourceKey: string;
  evidenceLevel: EvidenceLevel;
  /** ISO date (YYYY-MM-DD) the record was last reviewed, when known. */
  lastReviewed?: string;
}

const SOURCE_LIST: Source[] = [
  {
    key: "who-inn",
    label: "ВООЗ — Міжнародні непатентовані назви (INN)",
    type: "reference",
    reliability: "high",
    url: "https://www.who.int/teams/health-product-and-policy-standards/inn",
    note: "Джерело канонічних МНН (UA/латина/англ.).",
  },
  {
    key: "who-atc",
    label: "ВООЗ — ATC/DDD класифікація",
    type: "reference",
    reliability: "high",
    url: "https://www.whocc.no/atc_ddd_index/",
    note: "Анатомічно-терапевтично-хімічна класифікація.",
  },
  {
    key: "pharmacology-reference",
    label: "Довідкова фармакологія (клас-клас взаємодії)",
    type: "reference",
    reliability: "medium",
    note: "Референсні правила взаємодій рівня класів; потребують перевірки за інструкцією.",
  },
  {
    key: "project_static_curated",
    label: "Project-owned curated generic dictionary",
    type: "reference",
    reliability: "high",
    note: "Curated generic-name mappings maintained in this repository; no proprietary catalog payloads.",
  },
  {
    key: "project_generated_transliteration",
    label: "Project-generated Ukrainian transliterations",
    type: "reference",
    reliability: "medium",
    note: "Deterministic Ukrainian-to-Latin search variants generated from curated generic names.",
  },
  {
    key: "public_generic_inn",
    label: "Public generic INN / MNN naming",
    type: "reference",
    reliability: "high",
    note: "Public generic names used for auditable INN/MNN dictionary rows.",
  },
  {
    key: "rxnorm_reference",
    label: "RxNorm reference mapping candidate",
    type: "external",
    reliability: "high",
    url: "https://www.nlm.nih.gov/research/umls/rxnorm/",
    note: "Public RxNorm-derived generic-name reference; use for non-proprietary generic mappings only.",
  },
  {
    key: "manual_review_candidate",
    label: "Manual review candidate",
    type: "demo",
    reliability: "low",
    note: "Project-owned candidate rows that must remain pending or needs_review until a reviewer approves them.",
  },
  {
    key: "demo-catalog",
    label: "Демонстраційний каталог MVP",
    type: "demo",
    reliability: "low",
    note: "Ілюстративні дані про торгові назви; не є валідованим джерелом.",
  },
  {
    key: "rxnorm",
    label: "RxNorm (NLM)",
    type: "external",
    reliability: "high",
    url: "https://www.nlm.nih.gov/research/umls/rxnorm/",
    note: "Зовнішній API нормалізації назв ліків (best-effort).",
  },
  {
    key: "openfda",
    label: "openFDA",
    type: "external",
    reliability: "medium",
    url: "https://open.fda.gov/",
    note: "Зовнішній API етикеток ліків (best-effort).",
  },
];

const byKey = new Map<string, Source>(SOURCE_LIST.map((s) => [s.key, s]));

/** All registered sources. */
export function listSources(): readonly Source[] {
  return SOURCE_LIST;
}

/** Look up a source by key, or null if unknown. */
export function getSource(key: string): Source | null {
  return byKey.get(key) ?? null;
}

/** True when a source key is registered. Used by validation. */
export function isKnownSource(key: string): boolean {
  return byKey.has(key);
}

import type { NameKind } from "../dictionary/kinds";

/**
 * Deterministic provenance for a dictionary name mapping, based on how the name
 * is used. INN/English come from the WHO INN nomenclature, Latin from the same
 * reference tradition, brands are demo-catalog data, synonyms are internal
 * reference. This guarantees every mapping carries a concrete provenance.
 */
export function provenanceForNameKind(kind: NameKind): Provenance {
  switch (kind) {
    case "inn":
    case "english":
      return { sourceKey: "who-inn", evidenceLevel: "reference" };
    case "latin":
      return { sourceKey: "who-inn", evidenceLevel: "reference" };
    case "brand":
      return { sourceKey: "demo-catalog", evidenceLevel: "demo" };
    case "synonym":
      return {
        sourceKey: "pharmacology-reference",
        evidenceLevel: "reference",
      };
  }
}
