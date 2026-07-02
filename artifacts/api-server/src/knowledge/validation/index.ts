/**
 * Data-quality validation for the knowledge base (v0.3).
 *
 * `validateKnowledge()` runs a set of pure integrity checks over the static
 * knowledge data (dictionary mappings, ATC classification, interaction rules
 * and the drug catalog) and returns a structured {@link QualityReport}. It has
 * no side effects and no DB dependency so it powers both the CLI validation
 * script and unit tests, and is exposed read-only via the admin API.
 */
import { normalize } from "../../lib/text";
import {
  listDictionaryEntries,
  getDictionaryStats,
  type DictionaryEntry,
} from "../dictionary";
import { getAtcInfo } from "../atc";
import { isKnownSource } from "../provenance";
import { interactionRules, type InteractionRule } from "../../data/interactions";
import { drugs, type DrugRecord } from "../../data/drugs";

export type IssueSeverity = "error" | "warning";

export interface QualityIssue {
  /** Machine code, e.g. "mapping.unknown_source". */
  code: string;
  severity: IssueSeverity;
  /** Ukrainian human-readable message. */
  message: string;
  /** Which subject the issue is about (name, pair, drug id, …). */
  subject: string;
}

export interface QualityCounts {
  ingredients: number;
  mappings: number;
  interactionRules: number;
  curatedRules: number;
  generatedRules: number;
  drugs: number;
  atcCodesReferenced: number;
}

export interface QualityCoverage {
  /** Mappings that carry a provenance with a known source. */
  mappingsWithProvenance: number;
  mappingProvenancePct: number;
  /** Interaction rules that carry a known source key. */
  rulesWithSource: number;
  ruleSourcePct: number;
  /** Drug catalog records that resolve to a valid ATC code. */
  drugsWithValidAtc: number;
  drugAtcPct: number;
}

export interface QualityReport {
  ok: boolean;
  generatedAt: string;
  counts: QualityCounts;
  coverage: QualityCoverage;
  errors: QualityIssue[];
  warnings: QualityIssue[];
}

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/** Unordered pair key for interaction de-duplication checks. */
function pairKey(rule: InteractionRule): string {
  return [rule.a.toLowerCase(), rule.b.toLowerCase()].sort().join("|");
}

interface ValidationInput {
  entries: readonly DictionaryEntry[];
  rules: readonly InteractionRule[];
  catalog: readonly DrugRecord[];
}

/**
 * Core check runner, parameterized on its inputs so tests can inject crafted
 * datasets to exercise individual rules. `validateKnowledge()` calls it with
 * the live static data.
 */
export function runQualityChecks(input: ValidationInput): QualityReport {
  const { entries, rules, catalog } = input;
  const errors: QualityIssue[] = [];
  const warnings: QualityIssue[] = [];

  // --- Dictionary mappings ------------------------------------------------
  const normalizedToInn = new Map<string, string>();
  let mappingsWithProvenance = 0;
  const knownInns = new Set<string>();
  for (const e of entries) knownInns.add(normalize(e.ingredient.inn));

  for (const e of entries) {
    const norm = normalize(e.name);
    // Duplicate name pointing at a different ingredient is a real conflict.
    const existing = normalizedToInn.get(norm);
    const inn = normalize(e.ingredient.inn);
    if (existing !== undefined && existing !== inn) {
      errors.push({
        code: "mapping.duplicate_conflict",
        severity: "error",
        message: `Назва «${e.name}» вказує на різні діючі речовини.`,
        subject: e.name,
      });
    } else {
      normalizedToInn.set(norm, inn);
    }

    // Provenance is mandatory for every mapping in v0.3.
    if (!e.provenance || !e.provenance.sourceKey) {
      errors.push({
        code: "mapping.missing_provenance",
        severity: "error",
        message: `Відсутнє джерело для назви «${e.name}».`,
        subject: e.name,
      });
    } else if (!isKnownSource(e.provenance.sourceKey)) {
      errors.push({
        code: "mapping.unknown_source",
        severity: "error",
        message: `Невідоме джерело «${e.provenance.sourceKey}» для назви «${e.name}».`,
        subject: e.name,
      });
    } else {
      mappingsWithProvenance++;
    }

    // Every ingredient should classify against ATC (warning, not fatal).
    if (!getAtcInfo(e.ingredient.atc)) {
      warnings.push({
        code: "ingredient.unresolved_atc",
        severity: "warning",
        message: `ATC-код «${e.ingredient.atc}» не розпізнано для «${e.ingredient.inn}».`,
        subject: e.ingredient.inn,
      });
    }
  }

  // --- Interaction rules --------------------------------------------------
  const seenPairs = new Set<string>();
  let curatedRules = 0;
  let generatedRules = 0;
  let rulesWithSource = 0;
  const validRisks = new Set(["low", "medium", "high", "critical"]);

  for (const r of rules) {
    if (r.origin === "curated") curatedRules++;
    else if (r.origin === "generated") generatedRules++;

    const na = r.a.trim().toLowerCase();
    const nb = r.b.trim().toLowerCase();
    if (na === "" || nb === "") {
      errors.push({
        code: "rule.empty_matcher",
        severity: "error",
        message: "Правило взаємодії має порожній матчер (a або b).",
        subject: `${r.a}|${r.b}`,
      });
    }
    if (na !== "" && na === nb) {
      errors.push({
        code: "rule.self_pair",
        severity: "error",
        message: `Правило взаємодії речовини самої з собою: «${r.a}».`,
        subject: r.a,
      });
    }
    if (!validRisks.has(r.riskLevel)) {
      errors.push({
        code: "rule.invalid_risk",
        severity: "error",
        message: `Невідомий рівень ризику «${r.riskLevel}» для «${r.a}»/«${r.b}».`,
        subject: `${r.a}|${r.b}`,
      });
    }
    if (!r.explanation.trim() || !r.whatToCheck.trim() || !r.whenToSeeDoctor.trim()) {
      errors.push({
        code: "rule.missing_text",
        severity: "error",
        message: `Неповний текст правила для «${r.a}»/«${r.b}».`,
        subject: `${r.a}|${r.b}`,
      });
    }

    const key = pairKey(r);
    if (seenPairs.has(key)) {
      warnings.push({
        code: "rule.duplicate_pair",
        severity: "warning",
        message: `Дубльована пара взаємодії: «${r.a}»/«${r.b}».`,
        subject: key,
      });
    } else {
      seenPairs.add(key);
    }

    if (r.sourceKey && isKnownSource(r.sourceKey)) {
      rulesWithSource++;
    } else if (r.sourceKey) {
      errors.push({
        code: "rule.unknown_source",
        severity: "error",
        message: `Невідоме джерело «${r.sourceKey}» для правила «${r.a}»/«${r.b}».`,
        subject: key,
      });
    } else {
      warnings.push({
        code: "rule.missing_source",
        severity: "warning",
        message: `Відсутнє джерело для правила «${r.a}»/«${r.b}».`,
        subject: key,
      });
    }
  }

  // --- Drug catalog -------------------------------------------------------
  const seenIds = new Set<string>();
  const atcReferenced = new Set<string>();
  let drugsWithValidAtc = 0;
  for (const d of catalog) {
    if (seenIds.has(d.id)) {
      errors.push({
        code: "drug.duplicate_id",
        severity: "error",
        message: `Дубльований ідентифікатор препарату «${d.id}».`,
        subject: d.id,
      });
    } else {
      seenIds.add(d.id);
    }
    if (!d.source || !d.source.trim()) {
      errors.push({
        code: "drug.missing_source",
        severity: "error",
        message: `Відсутнє джерело для препарату «${d.brandName}».`,
        subject: d.id,
      });
    }
    if (d.atcCode) {
      atcReferenced.add(d.atcCode.toUpperCase());
      if (getAtcInfo(d.atcCode)) {
        drugsWithValidAtc++;
      } else {
        warnings.push({
          code: "drug.unresolved_atc",
          severity: "warning",
          message: `ATC-код «${d.atcCode}» не розпізнано для «${d.brandName}».`,
          subject: d.id,
        });
      }
    }
  }

  const counts: QualityCounts = {
    ingredients: getDictionaryStats().ingredients,
    mappings: entries.length,
    interactionRules: rules.length,
    curatedRules,
    generatedRules,
    drugs: catalog.length,
    atcCodesReferenced: atcReferenced.size,
  };

  const coverage: QualityCoverage = {
    mappingsWithProvenance,
    mappingProvenancePct: pct(mappingsWithProvenance, entries.length),
    rulesWithSource,
    ruleSourcePct: pct(rulesWithSource, rules.length),
    drugsWithValidAtc,
    drugAtcPct: pct(drugsWithValidAtc, catalog.length),
  };

  return {
    ok: errors.length === 0,
    generatedAt: new Date().toISOString(),
    counts,
    coverage,
    errors,
    warnings,
  };
}

/** Validate the live static knowledge base. */
export function validateKnowledge(): QualityReport {
  return runQualityChecks({
    entries: listDictionaryEntries(),
    rules: interactionRules,
    catalog: drugs,
  });
}
