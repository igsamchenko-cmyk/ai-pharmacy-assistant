import type { RegistryInteractionFindingEvidenceLevel } from "@workspace/api-client-react";

export const interactionEvidenceLevelLabels: Record<
  RegistryInteractionFindingEvidenceLevel,
  string
> = {
  established: "Встановлені докази",
  reference: "Офіційне джерело",
  theoretical: "Теоретичні дані",
};

export const interactionSummaryMetricLabels = {
  checkedPairs: "Перевірено пар",
  verified: "Підтверджено",
  duplicate: "Дублювання",
  insufficient: "Недостатньо даних",
  incomplete: "Склад не зіставлено",
} as const;
