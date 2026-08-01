import { createHash } from "node:crypto";
import type { IngredientSeed } from "../knowledge/dictionary/ingredients";
import type { DrugInstructionSnapshot } from "../knowledge/instructions/model";
import { evaluateInteractionRuleEligibility } from "./policy";
import {
  normalizeIngredient,
  normalizedInteractionPairKey,
  type VerifiedInteractionRule,
} from "./model";

export type InteractionCandidateEntityKind = "ingredient" | "therapeutic_class";

export interface InteractionCandidateEntity {
  kind: InteractionCandidateEntityKind;
  id: string;
  canonicalName: string;
  vocabularyStatus:
    | "canonical_dictionary"
    | "official_inn_candidate"
    | "class_phrase_candidate";
}

export interface InteractionClassSeed {
  id: string;
  canonicalName: string;
  aliases: string[];
  provenance: {
    sourceKey: string;
    sourceVersion: string;
  };
}

export const DEFAULT_INTERACTION_CLASS_SEEDS: readonly InteractionClassSeed[] =
  [
    {
      id: "class:nsaids",
      canonicalName: "Non-steroidal anti-inflammatory drugs",
      aliases: [
        "нестероїдні протизапальні засоби",
        "нестероїдними протизапальними засобами",
        "НПЗЗ",
        "non-steroidal anti-inflammatory drugs",
        "NSAIDs",
      ],
      provenance: {
        sourceKey: "curated-interaction-phrase-dictionary",
        sourceVersion: "1.0.0",
      },
    },
    {
      id: "class:oral-anticoagulants",
      canonicalName: "Oral anticoagulants",
      aliases: [
        "пероральні антикоагулянти",
        "пероральними антикоагулянтами",
        "oral anticoagulants",
      ],
      provenance: {
        sourceKey: "curated-interaction-phrase-dictionary",
        sourceVersion: "1.0.0",
      },
    },
    {
      id: "class:potassium-sparing-diuretics",
      canonicalName: "Potassium-sparing diuretics",
      aliases: [
        "калійзберігаючі діуретики",
        "калійзберігаючими діуретиками",
        "potassium-sparing diuretics",
      ],
      provenance: {
        sourceKey: "curated-interaction-phrase-dictionary",
        sourceVersion: "1.0.0",
      },
    },
    {
      id: "class:cyp3a4-inhibitors",
      canonicalName: "CYP3A4 inhibitors",
      aliases: [
        "інгібітори CYP3A4",
        "інгібіторами CYP3A4",
        "CYP3A4 inhibitors",
      ],
      provenance: {
        sourceKey: "curated-interaction-phrase-dictionary",
        sourceVersion: "1.0.0",
      },
    },
    {
      id: "class:cyp3a4-inducers",
      canonicalName: "CYP3A4 inducers",
      aliases: ["індуктори CYP3A4", "індукторами CYP3A4", "CYP3A4 inducers"],
      provenance: {
        sourceKey: "curated-interaction-phrase-dictionary",
        sourceVersion: "1.0.0",
      },
    },
    {
      id: "class:p-gp-inhibitors",
      canonicalName: "P-glycoprotein inhibitors",
      aliases: [
        "інгібітори P-gp",
        "інгібіторами P-gp",
        "інгібітори Р-глікопротеїну",
        "P-glycoprotein inhibitors",
      ],
      provenance: {
        sourceKey: "curated-interaction-phrase-dictionary",
        sourceVersion: "1.0.0",
      },
    },
    {
      id: "class:p-gp-inducers",
      canonicalName: "P-glycoprotein inducers",
      aliases: [
        "індуктори P-gp",
        "індукторами P-gp",
        "індуктори Р-глікопротеїну",
        "P-glycoprotein inducers",
      ],
      provenance: {
        sourceKey: "curated-interaction-phrase-dictionary",
        sourceVersion: "1.0.0",
      },
    },
    {
      id: "class:qt-prolonging-medicines",
      canonicalName: "QT-prolonging medicines",
      aliases: [
        "лікарські засоби, що подовжують інтервал QT",
        "препарати, що подовжують інтервал QT",
        "QT-prolonging medicines",
        "drugs that prolong the QT interval",
      ],
      provenance: {
        sourceKey: "curated-interaction-phrase-dictionary",
        sourceVersion: "1.0.0",
      },
    },
    {
      id: "class:serotonergic-medicines",
      canonicalName: "Serotonergic medicines",
      aliases: [
        "серотонінергічні лікарські засоби",
        "серотонінергічними лікарськими засобами",
        "serotonergic medicines",
        "serotonergic drugs",
      ],
      provenance: {
        sourceKey: "curated-interaction-phrase-dictionary",
        sourceVersion: "1.0.0",
      },
    },
    {
      id: "class:cns-depressants",
      canonicalName: "Central nervous system depressants",
      aliases: [
        "депресанти центральної нервової системи",
        "засоби, що пригнічують центральну нервову систему",
        "central nervous system depressants",
        "CNS depressants",
      ],
      provenance: {
        sourceKey: "curated-interaction-phrase-dictionary",
        sourceVersion: "1.0.0",
      },
    },
  ] as const;

export type InteractionTriageSignal =
  | "contraindication_language"
  | "avoidance_language"
  | "dose_adjustment_language"
  | "monitoring_language"
  | "caution_language"
  | "unspecified";

export interface InteractionCandidateEvidence {
  registryProductId: string;
  registrationNumber: string;
  tradeName: string;
  subjectIngredients: string[];
  subjectResolution:
    | "canonical_dictionary"
    | "official_inn_candidate"
    | "partial_composition";
  sourceUrl: string;
  documentId: string;
  documentDate: string | null;
  documentHash: string;
  section: "interactions";
  excerpt: string;
  excerptHash: string;
  triageSignal: InteractionTriageSignal;
}

export interface InteractionEvidenceCandidate {
  id: string;
  pairKey: string;
  left: InteractionCandidateEntity;
  right: InteractionCandidateEntity;
  reviewStatus: "needs_review" | "already_verified";
  triageSignal: InteractionTriageSignal;
  supportingDocumentCount: number;
  supportingProductCount: number;
  registryReach: number | null;
  priorityScore: number;
  evidence: InteractionCandidateEvidence[];
}

export interface InteractionCandidatePipelineReport {
  schemaVersion: "interaction-candidate-pipeline-v2";
  counts: {
    instructionDocuments: number;
    eligibleInstructionDocuments: number;
    documentsWithInteractionSection: number;
    resolvedSubjectDocuments: number;
    officialInnFallbackDocuments: number;
    partialSubjectDocuments: number;
    unresolvedSubjectDocuments: number;
    rawEvidenceRecords: number;
    uniqueCandidates: number;
    ingredientToIngredientCandidates: number;
    ingredientToClassCandidates: number;
    alreadyVerifiedCandidates: number;
    needsReviewCandidates: number;
  };
  safety: {
    candidatesOnly: true;
    automaticApproval: false;
    runtimeRulesChanged: false;
    partialCompositionRuntimeEligible: false;
    classMembershipInference: false;
    missingEvidenceMeansCompatible: false;
  };
  unresolvedSubjects: Array<{
    registryProductId: string;
    registrationNumber: string;
    tradeName: string;
    inn: string;
  }>;
  candidates: InteractionEvidenceCandidate[];
  reviewQueue: InteractionEvidenceCandidate[];
}

export interface InteractionCandidatePipelineInput {
  snapshots: readonly DrugInstructionSnapshot[];
  ingredientSeeds: readonly IngredientSeed[];
  verifiedRules: readonly VerifiedInteractionRule[];
  classSeeds?: readonly InteractionClassSeed[];
  observedRegistryRowsByInn?: ReadonlyMap<string, number>;
  reviewQueueLimit?: number;
  evidenceLimitPerCandidate?: number;
}

interface EntityDescriptor {
  entity: InteractionCandidateEntity;
  aliases: string[];
  rawAliases: string[];
}

interface CandidateAccumulator {
  left: InteractionCandidateEntity;
  right: InteractionCandidateEntity;
  evidence: InteractionCandidateEvidence[];
  evidenceKeys: Set<string>;
}

const SIGNAL_ORDER: Record<InteractionTriageSignal, number> = {
  contraindication_language: 6,
  avoidance_language: 5,
  dose_adjustment_language: 4,
  monitoring_language: 3,
  caution_language: 2,
  unspecified: 1,
};

const SIGNAL_SCORE: Record<InteractionTriageSignal, number> = {
  contraindication_language: 60_000,
  avoidance_language: 50_000,
  dose_adjustment_language: 40_000,
  monitoring_language: 30_000,
  caution_language: 20_000,
  unspecified: 10_000,
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeMention(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("uk-UA")
    .replace(/[’ʼ`]/gu, "'")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function containsMention(text: string, alias: string): boolean {
  if (` ${text} `.includes(` ${alias} `)) return true;
  if (!/^\p{Script=Cyrillic}{6,}$/u.test(alias)) return false;

  // Ukrainian INNs are commonly inflected in official instructions
  // (for example, "ібупрофеном"). The bounded suffix list accepts only
  // grammatical endings and does not enable general fuzzy matching.
  const grammaticalSuffixes = [
    "а",
    "у",
    "і",
    "ом",
    "ем",
    "ою",
    "ею",
    "ами",
    "ями",
    "ів",
  ];
  return text
    .split(" ")
    .some((token) =>
      grammaticalSuffixes.some((suffix) => token === `${alias}${suffix}`),
    );
}

function isCompositeSeed(seed: IngredientSeed): boolean {
  return /[+/]|\band\b/iu.test(seed.english);
}

function uniqueAliases(values: readonly string[]): string[] {
  return [
    ...new Set(
      values.map(normalizeMention).filter((value) => value.length >= 4),
    ),
  ].sort((a, b) => b.length - a.length || a.localeCompare(b, "uk"));
}

function ingredientDescriptors(
  seeds: readonly IngredientSeed[],
): EntityDescriptor[] {
  const byCanonical = new Map<string, IngredientSeed[]>();
  for (const seed of seeds) {
    if (isCompositeSeed(seed)) continue;
    const key = normalizeIngredient(seed.english);
    const values = byCanonical.get(key) ?? [];
    values.push(seed);
    byCanonical.set(key, values);
  }

  const aliasOwners = new Map<string, Set<string>>();
  for (const [canonicalKey, values] of byCanonical) {
    for (const seed of values) {
      for (const alias of [
        seed.inn,
        seed.latin,
        seed.english,
        ...(seed.synonyms ?? []),
      ]) {
        const normalized = normalizeMention(alias);
        if (normalized.length < 4) continue;
        const owners = aliasOwners.get(normalized) ?? new Set<string>();
        owners.add(canonicalKey);
        aliasOwners.set(normalized, owners);
      }
    }
  }

  return [...byCanonical.entries()]
    .map(([canonicalKey, values]) => {
      const canonicalName = values[0]!.english.trim();
      const rawAliases = [
        ...new Set(
          values.flatMap((seed) => [
            seed.inn,
            seed.latin,
            seed.english,
            ...(seed.synonyms ?? []),
          ]),
        ),
      ].filter((alias) => {
        const normalized = normalizeMention(alias);
        return (
          normalized.length >= 4 && aliasOwners.get(normalized)?.size === 1
        );
      });
      return {
        entity: {
          kind: "ingredient" as const,
          id: `ingredient:${canonicalKey}`,
          canonicalName,
          vocabularyStatus: "canonical_dictionary" as const,
        },
        aliases: uniqueAliases(rawAliases),
        rawAliases,
      };
    })
    .filter((descriptor) => descriptor.aliases.length > 0)
    .sort((a, b) => a.entity.id.localeCompare(b.entity.id, "en"));
}

function isAtomicOfficialInn(value: string): boolean {
  const normalized = normalizeMention(value);
  return (
    normalized.length >= 4 &&
    !/[+/;]/u.test(value) &&
    !/\b(?:and|comb(?:ination)? drug)\b/iu.test(normalized)
  );
}

function addOfficialInnCandidates(
  canonicalDescriptors: readonly EntityDescriptor[],
  snapshots: readonly DrugInstructionSnapshot[],
): EntityDescriptor[] {
  const descriptors = [...canonicalDescriptors];
  const entityIds = new Set(
    descriptors.map((descriptor) => descriptor.entity.id),
  );

  for (const snapshot of snapshots) {
    const rawInn = snapshot.inn.trim();
    if (!isAtomicOfficialInn(rawInn)) continue;
    if (matchingEntities(normalizeMention(rawInn), descriptors).length > 0) {
      continue;
    }
    const id = `ingredient:${normalizeIngredient(rawInn)}`;
    if (entityIds.has(id)) continue;
    entityIds.add(id);
    descriptors.push({
      entity: {
        kind: "ingredient",
        id,
        canonicalName: rawInn,
        vocabularyStatus: "official_inn_candidate",
      },
      aliases: uniqueAliases([rawInn]),
      rawAliases: [rawInn],
    });
  }

  return descriptors.sort((a, b) =>
    a.entity.id.localeCompare(b.entity.id, "en"),
  );
}

function classDescriptors(
  seeds: readonly InteractionClassSeed[],
): EntityDescriptor[] {
  return seeds
    .map((seed) => ({
      entity: {
        kind: "therapeutic_class" as const,
        id: seed.id,
        canonicalName: seed.canonicalName,
        vocabularyStatus: "class_phrase_candidate" as const,
      },
      aliases: uniqueAliases(seed.aliases),
      rawAliases: [...seed.aliases],
    }))
    .filter((descriptor) => descriptor.aliases.length > 0)
    .sort((a, b) => a.entity.id.localeCompare(b.entity.id, "en"));
}

function matchingEntities(
  normalizedText: string,
  descriptors: readonly EntityDescriptor[],
): EntityDescriptor[] {
  return descriptors.filter((descriptor) =>
    descriptor.aliases.some((alias) => containsMention(normalizedText, alias)),
  );
}

function pairEntities(
  a: InteractionCandidateEntity,
  b: InteractionCandidateEntity,
): [InteractionCandidateEntity, InteractionCandidateEntity] {
  return a.id.localeCompare(b.id, "en") <= 0 ? [a, b] : [b, a];
}

function pairKey(
  a: InteractionCandidateEntity,
  b: InteractionCandidateEntity,
): string {
  return pairEntities(a, b)
    .map((entity) => entity.id)
    .join("|");
}

function excerptForMention(text: string, descriptor: EntityDescriptor): string {
  const lower = text.toLocaleLowerCase("uk-UA");
  let matchIndex = -1;
  let matchLength = 0;
  for (const alias of descriptor.rawAliases) {
    const normalizedAlias = alias.trim().toLocaleLowerCase("uk-UA");
    if (normalizedAlias.length < 4) continue;
    const index = lower.indexOf(normalizedAlias);
    if (index >= 0 && (matchIndex < 0 || index < matchIndex)) {
      matchIndex = index;
      matchLength = normalizedAlias.length;
    }
  }

  if (matchIndex < 0) {
    const compact = text.replace(/\s+/gu, " ").trim();
    return compact.slice(0, 700);
  }

  const radius = 340;
  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(text.length, matchIndex + matchLength + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).replace(/\s+/gu, " ").trim()}${suffix}`;
}

export function detectInteractionTriageSignal(
  value: string,
): InteractionTriageSignal {
  const text = normalizeMention(value);
  if (/протипоказ|contraindicat/iu.test(text)) {
    return "contraindication_language";
  }
  if (
    /слід уникати|не слід застосовувати|не рекомендується|уникати одночасного|\bavoid(?:ed|ance)?\b|should not be used/iu.test(
      text,
    )
  ) {
    return "avoidance_language";
  }
  if (
    /корекц(?:ія|ії|ію) доз|зменш(?:ити|ення) доз|dose adjustment|dose reduction/iu.test(
      text,
    )
  ) {
    return "dose_adjustment_language";
  }
  if (
    /монітор|контролювати|контроль показник|спостереж|\bmonitor/iu.test(text)
  ) {
    return "monitoring_language";
  }
  if (/обережн|з обережністю|\bcaution/iu.test(text)) {
    return "caution_language";
  }
  return "unspecified";
}

function strongestSignal(
  evidence: readonly InteractionCandidateEvidence[],
): InteractionTriageSignal {
  return evidence.reduce<InteractionTriageSignal>(
    (strongest, item) =>
      SIGNAL_ORDER[item.triageSignal] > SIGNAL_ORDER[strongest]
        ? item.triageSignal
        : strongest,
    "unspecified",
  );
}

function observedReach(
  entities: readonly InteractionCandidateEntity[],
  rows: ReadonlyMap<string, number> | undefined,
): number | null {
  if (!rows || entities.some((entity) => entity.kind !== "ingredient")) {
    return null;
  }
  const values = entities.map((entity) => rows.get(entity.canonicalName));
  if (values.every((value) => value === undefined)) return null;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function evidenceRecord(
  snapshot: DrugInstructionSnapshot,
  subjects: readonly EntityDescriptor[],
  mentioned: EntityDescriptor,
): InteractionCandidateEvidence {
  const excerpt = excerptForMention(snapshot.sections.interactions!, mentioned);
  const subjectResolution = !isAtomicOfficialInn(snapshot.inn)
    ? "partial_composition"
    : subjects.some(
          (subject) =>
            subject.entity.vocabularyStatus === "official_inn_candidate",
        )
      ? "official_inn_candidate"
      : "canonical_dictionary";
  return {
    registryProductId: snapshot.registryProductId,
    registrationNumber: snapshot.registrationNumber,
    tradeName: snapshot.tradeName,
    subjectIngredients: subjects.map((subject) => subject.entity.canonicalName),
    subjectResolution,
    sourceUrl: snapshot.source.url,
    documentId: snapshot.source.documentId,
    documentDate: snapshot.source.documentDate,
    documentHash: snapshot.source.documentHash,
    section: "interactions",
    excerpt,
    excerptHash: sha256(excerpt),
    triageSignal: detectInteractionTriageSignal(excerpt),
  };
}

function eligibleSnapshot(snapshot: DrugInstructionSnapshot): boolean {
  return (
    (snapshot.status === "available" || snapshot.status === "partial") &&
    snapshot.provenance.sourceAllowed &&
    snapshot.provenance.registrationMatched &&
    snapshot.provenance.contentLocationMatched
  );
}

export function buildInteractionCandidatePipelineReport(
  input: InteractionCandidatePipelineInput,
): InteractionCandidatePipelineReport {
  const ingredients = addOfficialInnCandidates(
    ingredientDescriptors(input.ingredientSeeds),
    input.snapshots,
  );
  const classes = classDescriptors(
    input.classSeeds ?? DEFAULT_INTERACTION_CLASS_SEEDS,
  );
  const accumulators = new Map<string, CandidateAccumulator>();
  const unresolvedSubjects: InteractionCandidatePipelineReport["unresolvedSubjects"] =
    [];
  const eligibleSnapshots = input.snapshots.filter(eligibleSnapshot);
  const documentsWithSection = eligibleSnapshots.filter((snapshot) =>
    snapshot.sections.interactions?.trim(),
  );
  let resolvedSubjectDocuments = 0;
  let officialInnFallbackDocuments = 0;
  let partialSubjectDocuments = 0;

  for (const snapshot of documentsWithSection) {
    const subjectText = normalizeMention(
      `${snapshot.inn} ${snapshot.activeIngredient}`,
    );
    const subjects = matchingEntities(subjectText, ingredients);
    if (!subjects.length) {
      unresolvedSubjects.push({
        registryProductId: snapshot.registryProductId,
        registrationNumber: snapshot.registrationNumber,
        tradeName: snapshot.tradeName,
        inn: snapshot.inn,
      });
      continue;
    }
    resolvedSubjectDocuments += 1;
    if (!isAtomicOfficialInn(snapshot.inn)) partialSubjectDocuments += 1;

    if (
      subjects.some(
        (subject) =>
          subject.entity.vocabularyStatus === "official_inn_candidate",
      )
    )
      officialInnFallbackDocuments += 1;

    const interactionText = snapshot.sections.interactions!;
    const normalizedText = normalizeMention(interactionText);
    const subjectIds = new Set(subjects.map((subject) => subject.entity.id));
    const mentions = [
      ...matchingEntities(normalizedText, ingredients).filter(
        (descriptor) => !subjectIds.has(descriptor.entity.id),
      ),
      ...matchingEntities(normalizedText, classes),
    ];

    for (const subject of subjects) {
      for (const mentioned of mentions) {
        if (subject.entity.id === mentioned.entity.id) continue;
        const key = pairKey(subject.entity, mentioned.entity);
        const [left, right] = pairEntities(subject.entity, mentioned.entity);
        const accumulator = accumulators.get(key) ?? {
          left,
          right,
          evidence: [],
          evidenceKeys: new Set<string>(),
        };
        const evidence = evidenceRecord(snapshot, subjects, mentioned);
        const evidenceKey = `${evidence.documentHash}|${evidence.excerptHash}`;
        if (!accumulator.evidenceKeys.has(evidenceKey)) {
          accumulator.evidenceKeys.add(evidenceKey);
          accumulator.evidence.push(evidence);
        }
        accumulators.set(key, accumulator);
      }
    }
  }

  const verifiedExactPairs = new Set(
    input.verifiedRules
      .filter((rule) => evaluateInteractionRuleEligibility(rule).eligible)
      .map((rule) =>
        normalizedInteractionPairKey(rule.ingredientA, rule.ingredientB),
      ),
  );
  const evidenceLimit = Math.max(1, input.evidenceLimitPerCandidate ?? 8);

  const candidates = [...accumulators.entries()].map(([key, accumulator]) => {
    const triageSignal = strongestSignal(accumulator.evidence);
    const documentCount = new Set(
      accumulator.evidence.map((evidence) => evidence.documentHash),
    ).size;
    const productCount = new Set(
      accumulator.evidence.map((evidence) => evidence.registryProductId),
    ).size;
    const exactPair =
      accumulator.left.kind === "ingredient" &&
      accumulator.right.kind === "ingredient"
        ? normalizedInteractionPairKey(
            accumulator.left.canonicalName,
            accumulator.right.canonicalName,
          )
        : null;
    const reviewStatus =
      exactPair && verifiedExactPairs.has(exactPair)
        ? ("already_verified" as const)
        : ("needs_review" as const);
    const registryReach = observedReach(
      [accumulator.left, accumulator.right],
      input.observedRegistryRowsByInn,
    );
    return {
      id: `candidate-${sha256(key).slice(0, 16)}`,
      pairKey: key,
      left: accumulator.left,
      right: accumulator.right,
      reviewStatus,
      triageSignal,
      supportingDocumentCount: documentCount,
      supportingProductCount: productCount,
      registryReach,
      priorityScore:
        SIGNAL_SCORE[triageSignal] +
        Math.min(documentCount, 99) * 1_000 +
        Math.min(productCount, 99) * 100 +
        Math.min(registryReach ?? 0, 99),
      evidence: accumulator.evidence
        .sort(
          (a, b) =>
            SIGNAL_ORDER[b.triageSignal] - SIGNAL_ORDER[a.triageSignal] ||
            b.documentHash.localeCompare(a.documentHash, "en"),
        )
        .slice(0, evidenceLimit),
    } satisfies InteractionEvidenceCandidate;
  });

  candidates.sort(
    (a, b) =>
      (a.reviewStatus === "needs_review" ? 0 : 1) -
        (b.reviewStatus === "needs_review" ? 0 : 1) ||
      b.priorityScore - a.priorityScore ||
      a.pairKey.localeCompare(b.pairKey, "en"),
  );
  const reviewQueueLimit = Math.max(1, input.reviewQueueLimit ?? 100);
  const reviewQueue = candidates
    .filter((candidate) => candidate.reviewStatus === "needs_review")
    .slice(0, reviewQueueLimit);

  return {
    schemaVersion: "interaction-candidate-pipeline-v2",
    counts: {
      instructionDocuments: input.snapshots.length,
      eligibleInstructionDocuments: eligibleSnapshots.length,
      documentsWithInteractionSection: documentsWithSection.length,
      resolvedSubjectDocuments,
      officialInnFallbackDocuments,
      partialSubjectDocuments,
      unresolvedSubjectDocuments:
        documentsWithSection.length - resolvedSubjectDocuments,
      rawEvidenceRecords: [...accumulators.values()].reduce(
        (total, accumulator) => total + accumulator.evidence.length,
        0,
      ),
      uniqueCandidates: candidates.length,
      ingredientToIngredientCandidates: candidates.filter(
        (candidate) =>
          candidate.left.kind === "ingredient" &&
          candidate.right.kind === "ingredient",
      ).length,
      ingredientToClassCandidates: candidates.filter(
        (candidate) => candidate.left.kind !== candidate.right.kind,
      ).length,
      alreadyVerifiedCandidates: candidates.filter(
        (candidate) => candidate.reviewStatus === "already_verified",
      ).length,
      needsReviewCandidates: candidates.filter(
        (candidate) => candidate.reviewStatus === "needs_review",
      ).length,
    },
    safety: {
      candidatesOnly: true,
      automaticApproval: false,
      runtimeRulesChanged: false,
      partialCompositionRuntimeEligible: false,
      classMembershipInference: false,
      missingEvidenceMeansCompatible: false,
    },
    unresolvedSubjects: unresolvedSubjects.sort((a, b) =>
      a.registrationNumber.localeCompare(b.registrationNumber, "uk"),
    ),
    candidates,
    reviewQueue,
  };
}
