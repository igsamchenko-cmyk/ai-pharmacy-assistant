import type {
  RegistryInteractionFindingSeverity,
  RegistryInteractionPair,
  RegistryInteractionResult,
} from "@workspace/api-client-react";

const severityPriority: Record<RegistryInteractionFindingSeverity, number> = {
  contraindicated: 0,
  major: 1,
  moderate: 2,
  minor: 3,
  informational: 4,
  unknown: 5,
};

const pairStatusPriority: Record<RegistryInteractionPair["status"], number> = {
  verified_interaction: 0,
  same_ingredient: 1,
  incomplete_composition: 2,
  insufficient_evidence: 3,
};

export type InteractionSummaryState =
  | "contraindicated"
  | "major"
  | "verified"
  | "duplicate"
  | "incomplete"
  | "insufficient";

export interface InteractionResultSummary {
  state: InteractionSummaryState;
  pairCount: number;
  verifiedPairCount: number;
  duplicatePairCount: number;
  incompletePairCount: number;
  insufficientPairCount: number;
  highestSeverity: RegistryInteractionFindingSeverity | null;
  title: string;
  message: string;
}

function highestPairSeverity(
  pair: RegistryInteractionPair,
): RegistryInteractionFindingSeverity | null {
  return (
    [...pair.findings].sort(
      (a, b) => severityPriority[a.severity] - severityPriority[b.severity],
    )[0]?.severity ?? null
  );
}

export function sortInteractionPairsByRisk(
  pairs: readonly RegistryInteractionPair[],
): RegistryInteractionPair[] {
  return [...pairs].sort((a, b) => {
    const statusDifference =
      pairStatusPriority[a.status] - pairStatusPriority[b.status];
    if (statusDifference !== 0) return statusDifference;

    const severityA = highestPairSeverity(a);
    const severityB = highestPairSeverity(b);
    return (
      (severityA ? severityPriority[severityA] : Number.MAX_SAFE_INTEGER) -
      (severityB ? severityPriority[severityB] : Number.MAX_SAFE_INTEGER)
    );
  });
}

export function buildInteractionResultSummary(
  result: Pick<RegistryInteractionResult, "pairs" | "coverage">,
): InteractionResultSummary {
  const verifiedPairs = result.pairs.filter(
    (pair) => pair.status === "verified_interaction",
  );
  const duplicatePairCount = result.pairs.filter(
    (pair) => pair.status === "same_ingredient",
  ).length;
  const incompletePairCount = result.pairs.filter(
    (pair) => pair.status === "incomplete_composition",
  ).length;
  const insufficientPairCount = result.pairs.filter(
    (pair) => pair.status === "insufficient_evidence",
  ).length;
  const highestSeverity =
    verifiedPairs
      .flatMap((pair) => pair.findings)
      .sort(
        (a, b) => severityPriority[a.severity] - severityPriority[b.severity],
      )[0]?.severity ?? null;

  const metrics = {
    pairCount: result.pairs.length,
    verifiedPairCount: verifiedPairs.length,
    duplicatePairCount,
    incompletePairCount,
    insufficientPairCount,
  };

  if (highestSeverity === "contraindicated") {
    return {
      ...metrics,
      state: "contraindicated",
      highestSeverity,
      title: "Є протипоказане поєднання",
      message:
        "Не застосовуйте цю комбінацію без невідкладної оцінки медичним фахівцем.",
    };
  }

  if (highestSeverity === "major") {
    return {
      ...metrics,
      state: "major",
      highestSeverity,
      title: "Виявлено клінічно значущу взаємодію",
      message:
        "Потрібна оцінка лікаря або фармацевта. Не змінюйте лікування самостійно.",
    };
  }

  if (verifiedPairs.length > 0) {
    return {
      ...metrics,
      state: "verified",
      highestSeverity,
      title: "Є підтверджена інформація про взаємодії",
      message:
        "Перегляньте клінічний ефект і рекомендовану дію для кожної пари нижче.",
    };
  }

  if (duplicatePairCount > 0) {
    return {
      ...metrics,
      state: "duplicate",
      highestSeverity: null,
      title: "Виявлено дублювання діючої речовини",
      message:
        "Перевірте склад препаратів із лікарем або фармацевтом. Це не є висновком про безпечність схеми.",
    };
  }

  if (
    incompletePairCount > 0 ||
    result.coverage.unresolvedIngredientCount > 0
  ) {
    return {
      ...metrics,
      state: "incomplete",
      highestSeverity: null,
      title: "Перевірка неповна",
      message:
        "Частину складу не вдалося точно зіставити. Не використовуйте цей результат як підтвердження сумісності.",
    };
  }

  return {
    ...metrics,
    state: "insufficient",
    highestSeverity: null,
    title: "Надійного висновку про сумісність немає",
    message:
      "Підтвердженої взаємодії не знайдено у поточному evidence registry, але це не означає, що поєднання безпечне.",
  };
}
