/**
 * Knowledge import pipeline (v0.3).
 *
 * Turns the static knowledge modules into a normalized snapshot of DB insert
 * shapes (sources, ingredients, name mappings, ATC codes, interaction rules)
 * so it can be validated, loaded into Postgres, or diffed — all without a live
 * database. The pipeline is intentionally staged and pure:
 *
 *   parse → validate → normalize (snapshot) → load
 *
 * `buildKnowledgeSnapshot()` performs parse+normalize deterministically and is
 * fully unit-testable. `runImportPipeline(loader)` wires validation in and hands
 * the snapshot to an injected loader (the DB seed script provides a real one; a
 * dry-run loader is provided for tests and previews).
 */
import type {
  InsertKnowledgeSource,
  InsertKnowledgeIngredient,
  InsertKnowledgeIngredientName,
  InsertKnowledgeAtcCode,
  InsertKnowledgeInteractionRule,
} from "@workspace/db";
import { normalize } from "../../lib/text";
import { listDictionaryEntries } from "../dictionary";
import { getAtcInfo } from "../atc";
import { listSources, provenanceForNameKind } from "../provenance";
import { ingredientSeeds } from "../dictionary/ingredients";
import { interactionRules } from "../../data/interactions";
import { drugs } from "../../data/drugs";
import { validateKnowledge, type QualityReport } from "../validation";

export interface KnowledgeSnapshot {
  sources: InsertKnowledgeSource[];
  ingredients: InsertKnowledgeIngredient[];
  names: InsertKnowledgeIngredientName[];
  atcCodes: InsertKnowledgeAtcCode[];
  interactionRules: InsertKnowledgeInteractionRule[];
}

/**
 * Build the normalized snapshot from the static knowledge modules. Pure and
 * deterministic (order preserved, natural keys stable) so re-running produces
 * an identical result — safe for idempotent upserts.
 */
export function buildKnowledgeSnapshot(): KnowledgeSnapshot {
  const sources: InsertKnowledgeSource[] = listSources().map((s) => ({
    key: s.key,
    label: s.label,
    type: s.type,
    reliability: s.reliability,
    url: s.url ?? null,
    note: s.note,
  }));

  // Dedupe by normalized INN so the normalized table has one row per ingredient
  // (some seeds repeat an INN); first occurrence wins, matching dictionary stats.
  const ingredientByKey = new Map<string, InsertKnowledgeIngredient>();
  for (const seed of ingredientSeeds) {
    const innKey = normalize(seed.inn);
    if (ingredientByKey.has(innKey)) continue;
    ingredientByKey.set(innKey, {
      innKey,
      inn: seed.inn,
      latin: seed.latin ?? "",
      english: seed.english ?? "",
      atcCode: seed.atc ?? null,
      groupName: seed.group ?? "",
      sourceKey: "who-inn",
      evidenceLevel: "reference",
    });
  }
  const ingredients = [...ingredientByKey.values()];

  const names: InsertKnowledgeIngredientName[] = listDictionaryEntries().map(
    (e) => {
      const prov = e.provenance ?? provenanceForNameKind(e.kind);
      return {
        normalized: normalize(e.name),
        name: e.name,
        kind: e.kind,
        ingredientInnKey: normalize(e.ingredient.inn),
        sourceKey: prov.sourceKey,
        evidenceLevel: prov.evidenceLevel,
      };
    },
  );

  // ATC codes referenced by ingredients + catalog, resolved via the classifier.
  const atcSeen = new Map<string, InsertKnowledgeAtcCode>();
  const collectAtc = (code: string | null | undefined) => {
    const info = getAtcInfo(code);
    if (!info || atcSeen.has(info.code)) return;
    atcSeen.set(info.code, {
      code: info.code,
      anatomicalGroup: info.anatomicalGroup,
      therapeuticClass: info.therapeuticClass,
      sourceKey: "who-atc",
    });
  };
  for (const seed of ingredientSeeds) collectAtc(seed.atc);
  for (const d of drugs) collectAtc(d.atcCode);
  const atcCodes = [...atcSeen.values()];

  const ruleRows: InsertKnowledgeInteractionRule[] = interactionRules.map(
    (r) => ({
      pairKey: [r.a.toLowerCase(), r.b.toLowerCase()].sort().join("|"),
      ingredientA: r.a,
      ingredientB: r.b,
      riskLevel: r.riskLevel,
      explanation: r.explanation,
      whatToCheck: r.whatToCheck,
      whenToSeeDoctor: r.whenToSeeDoctor,
      origin: r.origin ?? "curated",
      evidenceLevel: r.evidence ?? "reference",
      mechanism: r.mechanism ?? null,
      sourceKey: r.sourceKey ?? "pharmacology-reference",
    }),
  );

  return {
    sources,
    ingredients,
    names,
    atcCodes,
    interactionRules: ruleRows,
  };
}

export interface SnapshotCounts {
  sources: number;
  ingredients: number;
  names: number;
  atcCodes: number;
  interactionRules: number;
}

export function snapshotCounts(snapshot: KnowledgeSnapshot): SnapshotCounts {
  return {
    sources: snapshot.sources.length,
    ingredients: snapshot.ingredients.length,
    names: snapshot.names.length,
    atcCodes: snapshot.atcCodes.length,
    interactionRules: snapshot.interactionRules.length,
  };
}

/** A loader persists a snapshot. Injected so the pipeline stays DB-free. */
export interface SnapshotLoader {
  readonly id: string;
  load(snapshot: KnowledgeSnapshot): Promise<void>;
}

/** No-op loader: validates the pipeline end-to-end without a database. */
export class DryRunLoader implements SnapshotLoader {
  readonly id = "dry-run";
  loaded: KnowledgeSnapshot | null = null;
  async load(snapshot: KnowledgeSnapshot): Promise<void> {
    this.loaded = snapshot;
  }
}

export interface ImportPipelineResult {
  ok: boolean;
  loaderId: string;
  quality: QualityReport;
  counts: SnapshotCounts;
  loaded: boolean;
}

/**
 * Run the full pipeline: validate the knowledge base, build the snapshot, and
 * hand it to the loader. If validation finds errors the pipeline refuses to load
 * (unless `force` is set) so bad data never reaches persistence.
 */
export async function runImportPipeline(
  loader: SnapshotLoader,
  opts: { force?: boolean } = {},
): Promise<ImportPipelineResult> {
  const quality = validateKnowledge();
  const snapshot = buildKnowledgeSnapshot();
  const counts = snapshotCounts(snapshot);

  const mayLoad = quality.ok || opts.force === true;
  if (mayLoad) {
    await loader.load(snapshot);
  }

  return {
    ok: quality.ok,
    loaderId: loader.id,
    quality,
    counts,
    loaded: mayLoad,
  };
}
