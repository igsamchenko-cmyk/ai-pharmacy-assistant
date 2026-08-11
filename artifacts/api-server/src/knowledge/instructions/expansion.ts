import type { RegistryRawRow } from "../ingestion";
import {
  InstructionSourceProductSchema,
  type InstructionSourceProduct,
} from "./model";
import { hasStructuredOfficialInstructionSource } from "./source";

export const DEFAULT_INSTRUCTION_EXPANSION_TARGET = 200;

const OPERATIONAL_PRIORITY_NAMES = [
  { query: "парацетамол", targets: ["парацетамол"] },
  { query: "еліквіс", targets: ["еліквіс"] },
  { query: "нурофен", targets: ["нурофен", "нурофєн"] },
  { query: "амоксиклав", targets: ["амоксиклав"] },
  { query: "цефтріаксон", targets: ["цефтріаксон"] },
  { query: "метформін", targets: ["метформін"] },
  { query: "омепразол", targets: ["омепразол"] },
  { query: "амлодипін", targets: ["амлодипін"] },
  { query: "ксарелто", targets: ["ксарелто"] },
  { query: "прадакса", targets: ["прадакса"] },
  { query: "симбікорт", targets: ["симбікорт"] },
  { query: "гептрал", targets: ["гептрал"] },
  { query: "форксига", targets: ["форксига", "форксіга"] },
  { query: "джардінс", targets: ["джардінс"] },
] as const;

const NON_SPECIFIC_INN_KEYS = new Set([
  "comb drug",
  "combination",
  "combinations",
  "mono",
  "multiple",
  "other",
  "various",
]);

export type InstructionExpansionPriorityReason =
  | "operational_search"
  | "registry_breadth";

export interface InstructionExpansionCandidate {
  source: InstructionSourceProduct;
  priorityReason: InstructionExpansionPriorityReason;
  priorityQuery: string | null;
  registryInnPositionCount: number;
}

export interface InstructionExpansionPlan {
  targetCount: number;
  retainedCount: number;
  retainedInCurrentRegistry: number;
  retainedOutsideCurrentRegistry: number;
  requiredAcceptedCount: number;
  eligibleCandidateCount: number;
  eligibleDistinctInnCount: number;
  rejectedInvalidMetadataCount: number;
  invalidMetadataFieldCounts: Record<string, number>;
  rejectedNonStructuredSourceCount: number;
  rejectedDuplicateRegistrationCount: number;
  rejectedNonSpecificInnCount: number;
  candidates: InstructionExpansionCandidate[];
}

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("uk-UA")
    .replace(/[’ʼ'`]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function hasSpecificInn(row: Pick<RegistryRawRow, "inn">): boolean {
  const key = normalized(row.inn);
  return key.length >= 3 && !NON_SPECIFIC_INN_KEYS.has(key);
}
function exactKey(
  registryProductId: string,
  registrationNumber: string,
): string {
  return `${registryProductId}\u0000${registrationNumber}`;
}

const STRENGTH_UNIT = "(?:мкг|мг|кг|нг|г|мл|л|МО|МЕ|ОД|IU|КУО|МБк|кБк|Бк|%)";
const STRENGTH_AMOUNT = `\\d+(?:[.,]\\d+)?\\s*(?:тис\\.?\\s*|млн\\s*)?${STRENGTH_UNIT}`;
const STRENGTH_EXPRESSION = new RegExp(
  `${STRENGTH_AMOUNT}(?:(?:\\s*(?:\\+|та)\\s*${STRENGTH_AMOUNT})|(?:\\s*\\/\\s*(?:\\d+(?:[.,]\\d+)?\\s*)?${STRENGTH_UNIT})){0,3}`,
  "iu",
);

export function literalStrengthFromRegistryRow(
  row: Pick<RegistryRawRow, "strength" | "form" | "activeIngredient">,
): string | null {
  const declared = row.strength.trim();
  if (declared) return declared;
  for (const value of [row.form, row.activeIngredient]) {
    const match = value.match(STRENGTH_EXPRESSION)?.[0];
    if (!match) continue;
    return match
      .replace(/\s+/gu, " ")
      .replace(/\s*([/+])\s*/gu, "$1")
      .trim();
  }
  return null;
}

function sourceFromRegistryRow(
  row: RegistryRawRow,
  invalidMetadataFieldCounts: Record<string, number>,
): InstructionSourceProduct | null {
  const parsed = InstructionSourceProductSchema.safeParse({
    registryProductId: row.registryId,
    registrationNumber: row.registrationNumber,
    tradeName: row.tradeName,
    inn: row.inn,
    activeIngredient: row.activeIngredient,
    dosageForm: row.form,
    strength: literalStrengthFromRegistryRow(row) ?? "",
    manufacturer: row.manufacturer,
    manufacturerCountry: row.country,
    registrationStartDate: row.registrationStartDate,
    registrationEndDate: row.registrationEndDate,
    sourceUrl: row.instructionUrl,
  });
  if (parsed.success) return parsed.data;
  for (const issue of parsed.error.issues) {
    const field = issue.path.join(".") || "root";
    invalidMetadataFieldCounts[field] =
      (invalidMetadataFieldCounts[field] ?? 0) + 1;
  }
  return null;
}

function sourceSort(
  left: InstructionSourceProduct,
  right: InstructionSourceProduct,
): number {
  const leftUnlimited = normalized(left.registrationEndDate).includes(
    "необмежений",
  );
  const rightUnlimited = normalized(right.registrationEndDate).includes(
    "необмежений",
  );
  return (
    Number(rightUnlimited) - Number(leftUnlimited) ||
    left.tradeName.localeCompare(right.tradeName, "uk-UA") ||
    left.registrationNumber.localeCompare(right.registrationNumber, "uk-UA") ||
    left.registryProductId.localeCompare(right.registryProductId)
  );
}

function matchesPriorityName(
  source: InstructionSourceProduct,
  targets: readonly string[],
): boolean {
  const tradeName = normalized(source.tradeName);
  const inn = normalized(source.inn);
  return targets.some((target) => {
    const key = normalized(target);
    return tradeName.includes(key) || inn === key;
  });
}

export function buildInstructionExpansionPlan(
  rows: readonly RegistryRawRow[],
  retained: readonly InstructionSourceProduct[],
  targetCount = DEFAULT_INSTRUCTION_EXPANSION_TARGET,
): InstructionExpansionPlan {
  if (!Number.isInteger(targetCount) || targetCount < retained.length) {
    throw new Error("instruction_expansion_target_invalid");
  }

  const retainedKeys = new Set(
    retained.map((source) =>
      exactKey(source.registryProductId, source.registrationNumber),
    ),
  );
  const currentKeys = new Set(
    rows.map((row) => exactKey(row.registryId, row.registrationNumber)),
  );
  const usedRegistrationNumbers = new Set(
    retained.map((source) => source.registrationNumber),
  );
  const eligible: InstructionSourceProduct[] = [];
  let rejectedInvalidMetadataCount = 0;
  const invalidMetadataFieldCounts: Record<string, number> = {};
  let rejectedNonStructuredSourceCount = 0;
  let rejectedDuplicateRegistrationCount = 0;

  let rejectedNonSpecificInnCount = 0;
  for (const row of rows) {
    const key = exactKey(row.registryId, row.registrationNumber);
    if (retainedKeys.has(key)) continue;
    if (
      !hasStructuredOfficialInstructionSource(
        row.instructionUrl,
        row.registrationNumber,
      )
    ) {
      rejectedNonStructuredSourceCount += 1;
      continue;
    }
    if (!hasSpecificInn(row)) {
      rejectedNonSpecificInnCount += 1;
      continue;
    }
    const source = sourceFromRegistryRow(row, invalidMetadataFieldCounts);
    if (!source) {
      rejectedInvalidMetadataCount += 1;
      continue;
    }
    if (usedRegistrationNumbers.has(source.registrationNumber)) {
      rejectedDuplicateRegistrationCount += 1;
      continue;
    }
    usedRegistrationNumbers.add(source.registrationNumber);
    eligible.push(source);
  }

  const registryInnPositionCount = new Map<string, number>();
  for (const source of eligible) {
    const innKey = normalized(source.inn);
    registryInnPositionCount.set(
      innKey,
      (registryInnPositionCount.get(innKey) ?? 0) + 1,
    );
  }

  const candidates: InstructionExpansionCandidate[] = [];
  const queued = new Set<string>();
  const addCandidate = (
    source: InstructionSourceProduct,
    priorityReason: InstructionExpansionPriorityReason,
    priorityQuery: string | null,
  ) => {
    const key = exactKey(source.registryProductId, source.registrationNumber);
    if (queued.has(key)) return;
    queued.add(key);
    candidates.push({
      source,
      priorityReason,
      priorityQuery,
      registryInnPositionCount:
        registryInnPositionCount.get(normalized(source.inn)) ?? 1,
    });
  };

  for (const priority of OPERATIONAL_PRIORITY_NAMES) {
    if (
      retained.some((source) => matchesPriorityName(source, priority.targets))
    ) {
      continue;
    }
    const match = eligible
      .filter((source) => matchesPriorityName(source, priority.targets))
      .sort(sourceSort)[0];
    if (match) addCandidate(match, "operational_search", priority.query);
  }

  const groups = new Map<string, InstructionSourceProduct[]>();
  for (const source of eligible) {
    const innKey = normalized(source.inn);
    const group = groups.get(innKey) ?? [];
    group.push(source);
    groups.set(innKey, group);
  }
  const orderedGroups = [...groups.entries()]
    .map(([innKey, sources]) => ({
      innKey,
      sources: sources.sort(sourceSort),
    }))
    .sort(
      (left, right) =>
        right.sources.length - left.sources.length ||
        left.innKey.localeCompare(right.innKey, "uk-UA"),
    );
  const maximumDepth = Math.max(
    0,
    ...orderedGroups.map((group) => group.sources.length),
  );
  for (let depth = 0; depth < maximumDepth; depth += 1) {
    for (const group of orderedGroups) {
      const source = group.sources[depth];
      if (source) addCandidate(source, "registry_breadth", null);
    }
  }

  const retainedInCurrentRegistry = retained.filter((source) =>
    currentKeys.has(
      exactKey(source.registryProductId, source.registrationNumber),
    ),
  ).length;
  return {
    targetCount,
    retainedCount: retained.length,
    retainedInCurrentRegistry,
    retainedOutsideCurrentRegistry: retained.length - retainedInCurrentRegistry,
    requiredAcceptedCount: targetCount - retained.length,
    eligibleCandidateCount: eligible.length,
    eligibleDistinctInnCount: groups.size,
    rejectedInvalidMetadataCount,
    invalidMetadataFieldCounts,
    rejectedDuplicateRegistrationCount,
    rejectedNonStructuredSourceCount,
    rejectedNonSpecificInnCount,
    candidates,
  };
}
