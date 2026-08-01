import { useState } from "react";
import {
  getListHistoryQueryKey,
  useCheckInteractions,
  useCreateHistory,
  useGetInteractionInstructionSignals,
  type InteractionInstructionSignalPair,
  type InteractionInstructionTriageSignal,
  type RegistryInteractionFindingSeverity,
  type RegistryInteractionPairStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpen,
  FileSearch,
  GitCompare,
  Info,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  RegistryInteractionSearchSelect,
  type InteractionProductSelection,
} from "@/components/registry-interaction-search-select";
import { GlobalDisclaimer } from "@/components/disclaimer";
import { ReportIssueButton } from "@/components/report-issue-button";
import {
  interactionEvidenceLevelLabels,
  interactionSummaryMetricLabels,
} from "@/lib/interaction-result-copy";
import {
  buildInteractionResultSummary,
  sortInteractionPairsByRisk,
  type InteractionSummaryState,
} from "@/lib/interaction-result-summary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const pairStatusLabels: Record<RegistryInteractionPairStatus, string> = {
  verified_interaction: "Підтверджена взаємодія",
  same_ingredient: "Однакова діюча речовина",
  insufficient_evidence: "Недостатньо перевірених даних",
  incomplete_composition: "Склад не зіставлено",
};

const pairStatusStyles: Record<RegistryInteractionPairStatus, string> = {
  verified_interaction:
    "border-red-500/30 bg-red-500/5 text-red-800 dark:text-red-200",
  same_ingredient:
    "border-sky-500/30 bg-sky-500/5 text-sky-800 dark:text-sky-200",
  insufficient_evidence:
    "border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-100",
  incomplete_composition:
    "border-orange-500/30 bg-orange-500/5 text-orange-900 dark:text-orange-100",
};

const severityLabels: Record<RegistryInteractionFindingSeverity, string> = {
  contraindicated: "Протипоказано",
  major: "Клінічно значуща",
  moderate: "Помірна",
  minor: "Незначна",
  informational: "Інформаційна",
  unknown: "Недостатньо даних",
};

const summaryStyles: Record<InteractionSummaryState, string> = {
  contraindicated:
    "border-red-600/50 bg-red-500/10 text-red-950 dark:text-red-100",
  major: "border-red-500/40 bg-red-500/5 text-red-950 dark:text-red-100",
  verified:
    "border-orange-500/40 bg-orange-500/5 text-orange-950 dark:text-orange-100",
  duplicate: "border-sky-500/40 bg-sky-500/5 text-sky-950 dark:text-sky-100",
  incomplete:
    "border-amber-500/40 bg-amber-500/5 text-amber-950 dark:text-amber-100",
  insufficient:
    "border-amber-500/40 bg-amber-500/5 text-amber-950 dark:text-amber-100",
};

const actionLabels = {
  avoid_combination: "Уникати комбінації",
  specialist_review: "Потрібна оцінка фахівця",
  monitor: "Потрібен моніторинг",
  consider_alternative: "Розглянути альтернативу з лікарем",
  informational: "Врахувати під час консультації",
} as const;

const instructionSignalLabels: Record<
  InteractionInstructionTriageSignal,
  string
> = {
  contraindication_language: "Формулювання про протипоказання",
  avoidance_language: "Формулювання про уникнення",
  dose_adjustment_language: "Згадка корекції дози",
  monitoring_language: "Згадка моніторингу",
  caution_language: "Формулювання про обережність",
  unspecified: "Згадка без класифікації",
};

const instructionSignalStyles: Record<
  InteractionInstructionTriageSignal,
  string
> = {
  contraindication_language: "border-red-500/40 text-red-700 dark:text-red-200",
  avoidance_language:
    "border-orange-500/40 text-orange-700 dark:text-orange-200",
  dose_adjustment_language:
    "border-amber-500/40 text-amber-800 dark:text-amber-100",
  monitoring_language: "border-sky-500/40 text-sky-800 dark:text-sky-100",
  caution_language: "border-yellow-500/40 text-yellow-800 dark:text-yellow-100",
  unspecified: "border-muted-foreground/30 text-muted-foreground",
};

function InstructionSignalPairCard({
  pair,
}: {
  pair: InteractionInstructionSignalPair;
}) {
  const emptyMessage =
    pair.status === "instructions_unavailable"
      ? "Офіційні інструкції цієї пари зараз не завантажені. Висновок про сумісність не робиться."
      : pair.status === "composition_unresolved"
        ? "Точний склад однієї з позицій не зіставлено, тому автоматичний пошук згадок не виконувався."
        : "У завантажених інструкціях точного перехресного згадування не знайдено. Це не підтверджує сумісність.";

  return (
    <Card className="max-w-full overflow-hidden border-cyan-500/25 bg-cyan-500/[0.03]">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <FileSearch className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600" />
          <div className="min-w-0 space-y-1">
            <p className="break-words font-bold">
              {pair.productAName} + {pair.productBName}
            </p>
            <p className="text-xs text-muted-foreground">
              Автоматичний пошук лише в офіційних інструкціях точних реєстрових
              позицій
            </p>
          </div>
        </div>

        {pair.signals.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <div className="space-y-3">
            {pair.signals.map((signal) => (
              <div
                key={signal.id}
                className="space-y-3 rounded-xl border bg-background/75 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={instructionSignalStyles[signal.triageSignal]}
                  >
                    {instructionSignalLabels[signal.triageSignal]}
                  </Badge>
                  <Badge variant="secondary">
                    {signal.reviewStatus === "already_verified"
                      ? "Збігається з перевіреним правилом"
                      : "Кандидат — не правило"}
                  </Badge>
                </div>
                <p className="break-words text-sm font-semibold">
                  {signal.ingredientA} + {signal.ingredientB}
                </p>
                <p className="text-xs text-muted-foreground">
                  Знайдено в {signal.supportingDocumentCount} документі(ах) для{" "}
                  {signal.supportingProductCount} реєстрової позиції(й). Сила й
                  клінічна значущість тут не визначаються автоматично.
                </p>
                <div className="space-y-2">
                  {signal.evidence.map((evidence) => (
                    <details
                      key={`${signal.id}:${evidence.registryProductId}`}
                      className="rounded-lg border p-3"
                    >
                      <summary className="cursor-pointer break-words text-sm font-semibold">
                        {evidence.tradeName} · {evidence.registrationNumber}
                      </summary>
                      <div className="mt-3 space-y-3 text-sm">
                        <p className="whitespace-pre-wrap break-words text-muted-foreground">
                          {evidence.excerpt}
                        </p>
                        <a
                          className="inline-flex items-center gap-1 break-all text-primary underline"
                          href={evidence.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <BookOpen className="h-4 w-4 shrink-0" />
                          Відкрити офіційний документ
                        </a>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function addInteractionSelection(
  current: readonly InteractionProductSelection[],
  product: InteractionProductSelection,
): InteractionProductSelection[] {
  if (
    current.length >= 5 ||
    current.some(
      (item) =>
        item.productId === product.productId ||
        (item.productId === product.productId &&
          item.registration === product.registration),
    )
  ) {
    return [...current];
  }
  return [...current, product];
}

export default function Interactions() {
  const [selectedProducts, setSelectedProducts] = useState<
    InteractionProductSelection[]
  >([]);
  const queryClient = useQueryClient();
  const checkInteractions = useCheckInteractions();
  const instructionSignals = useGetInteractionInstructionSignals();
  const createHistory = useCreateHistory();

  const handleAdd = (product: InteractionProductSelection) => {
    setSelectedProducts((current) => addInteractionSelection(current, product));
    checkInteractions.reset();
    instructionSignals.reset();
  };

  const handleRemove = (productId: string) => {
    setSelectedProducts((current) =>
      current.filter((product) => product.productId !== productId),
    );
    checkInteractions.reset();
    instructionSignals.reset();
  };

  const handleCheck = () => {
    if (selectedProducts.length < 2 || selectedProducts.length > 5) return;
    const data = {
      products: selectedProducts.map((product) => ({
        productId: product.productId,
        registrationNumber: product.registration,
      })),
    };
    instructionSignals.mutate({ data });
    checkInteractions.mutate(
      { data },
      {
        onSuccess: () => {
          createHistory.mutate(
            {
              data: {
                type: "interaction",
                title: `Перевірка взаємодій: ${selectedProducts
                  .map((product) => product.tradeName)
                  .join(", ")}`,
                detail: `Перевірено ${selectedProducts.length} точні реєстрові позиції`,
              },
            },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({
                  queryKey: getListHistoryQueryKey(),
                });
              },
            },
          );
        },
      },
    );
  };

  const selectedContext = selectedProducts
    .map((product) => `${product.productId}:${product.registration}`)
    .join(",");
  const resultSummary = checkInteractions.data
    ? buildInteractionResultSummary(checkInteractions.data)
    : null;
  const sortedPairs = checkInteractions.data
    ? sortInteractionPairsByRisk(checkInteractions.data.pairs)
    : [];

  return (
    <div className="max-w-full space-y-6 overflow-x-hidden pb-10 motion-safe:animate-in motion-safe:fade-in">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-primary">
          <GitCompare className="h-6 w-6" />
          Взаємодії препаратів
        </h1>
        <p className="text-sm text-muted-foreground">
          Оберіть від 2 до 5 конкретних реєстрових позицій. Перевірка
          виконується за підтвердженими діючими речовинами, а не лише за
          торговою назвою.
        </p>
      </div>

      <GlobalDisclaimer />

      <div className="space-y-4">
        <RegistryInteractionSearchSelect
          onSelect={handleAdd}
          disabled={selectedProducts.length >= 5}
        />

        {selectedProducts.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {selectedProducts.map((product) => (
              <Card
                key={`${product.productId}:${product.registration}`}
                className="max-w-full overflow-hidden"
              >
                <CardContent className="flex min-w-0 items-start justify-between gap-3 p-3">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words font-semibold">
                      {product.tradeName}
                    </p>
                    <p className="break-words text-xs text-muted-foreground">
                      {[product.strength, product.form]
                        .filter(Boolean)
                        .join(" · ") || "Форма не вказана"}
                    </p>
                    <p className="break-all text-xs text-muted-foreground">
                      {product.registration}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => handleRemove(product.productId)}
                    aria-label={`Прибрати ${product.tradeName}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        <Button
          className="min-h-12 w-full font-bold"
          disabled={selectedProducts.length < 2 || checkInteractions.isPending}
          onClick={handleCheck}
          data-testid="btn-check-interactions"
        >
          {checkInteractions.isPending
            ? "Перевірка точних позицій…"
            : "Перевірити взаємодії"}
        </Button>

        {checkInteractions.isError ? (
          <div className="space-y-2 rounded-lg border border-destructive/30 px-4 py-4 text-sm text-destructive">
            <p>
              Не вдалося звірити точні реєстрові позиції. Дані про взаємодію не
              показано.
            </p>
            <ReportIssueButton
              type="interaction_issue"
              context={`registry-interaction-error:${selectedContext}`}
              compact
            />
          </div>
        ) : null}
      </div>

      {checkInteractions.data ? (
        <section className="space-y-4 pt-4 motion-safe:animate-in motion-safe:slide-in-from-bottom-2 motion-safe:fade-in">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">Результат для кожної пари</h2>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {checkInteractions.data.coverage.selectedCount} точні позиції
              </Badge>
              <Badge variant="outline">
                {checkInteractions.data.coverage.matchedApprovedPairs}{" "}
                підтверджених збігів
              </Badge>
            </div>
          </div>

          {resultSummary ? (
            <Card
              className={`max-w-full overflow-hidden ${summaryStyles[resultSummary.state]}`}
              data-testid="interaction-result-summary"
            >
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex min-w-0 items-start gap-3">
                  {resultSummary.state === "contraindicated" ||
                  resultSummary.state === "major" ? (
                    <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0" />
                  ) : resultSummary.state === "duplicate" ? (
                    <Info className="mt-0.5 h-6 w-6 shrink-0" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" />
                  )}
                  <div className="min-w-0 space-y-1">
                    <h3 className="break-words text-lg font-bold">
                      {resultSummary.title}
                    </h3>
                    <p className="break-words text-sm">
                      {resultSummary.message}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">
                    {interactionSummaryMetricLabels.checkedPairs}:{" "}
                    {resultSummary.pairCount}
                  </Badge>
                  <Badge variant="outline">
                    {interactionSummaryMetricLabels.verified}:{" "}
                    {resultSummary.verifiedPairCount}
                  </Badge>
                  {resultSummary.duplicatePairCount > 0 ? (
                    <Badge variant="outline">
                      {interactionSummaryMetricLabels.duplicate}:{" "}
                      {resultSummary.duplicatePairCount}
                    </Badge>
                  ) : null}
                  {resultSummary.insufficientPairCount > 0 ? (
                    <Badge variant="outline">
                      {interactionSummaryMetricLabels.insufficient}:{" "}
                      {resultSummary.insufficientPairCount}
                    </Badge>
                  ) : null}
                  {resultSummary.incompletePairCount > 0 ? (
                    <Badge variant="outline">
                      {interactionSummaryMetricLabels.incomplete}:{" "}
                      {resultSummary.incompletePairCount}
                    </Badge>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {checkInteractions.data.coverage.runtimeEligibleRules <
          checkInteractions.data.coverage.totalRules ? (
            <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="font-semibold">
                  Доказове покриття взаємодій обмежене
                </p>
                <p className="text-muted-foreground">
                  До перевірки допущено{" "}
                  {checkInteractions.data.coverage.runtimeEligibleRules} із{" "}
                  {checkInteractions.data.coverage.totalRules} правил.
                  Неперевірені legacy-правила не використовуються. Для
                  непокритих пар FarmAssist показує «Недостатньо перевірених
                  даних», а не робить висновок про сумісність.
                </p>
              </div>
            </div>
          ) : null}

          <div className="space-y-4">
            {sortedPairs.map((pair) => (
              <Card
                key={`${pair.productAId}:${pair.productBId}`}
                className={`max-w-full overflow-hidden ${pairStatusStyles[pair.status]}`}
              >
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-bold">
                        {pair.productAName} + {pair.productBName}
                      </p>
                      <p className="mt-1 text-sm">{pair.message}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className="whitespace-normal text-left"
                    >
                      {pairStatusLabels[pair.status]}
                    </Badge>
                  </div>

                  {pair.duplicateIngredients.length ? (
                    <div className="flex flex-wrap gap-2">
                      {pair.duplicateIngredients.map((ingredient) => (
                        <Badge key={ingredient} variant="secondary">
                          {ingredient}
                        </Badge>
                      ))}
                    </div>
                  ) : null}

                  {pair.findings.map((finding, index) => (
                    <div
                      key={`${finding.ingredientA}:${finding.ingredientB}:${index}`}
                      className="space-y-3 rounded-xl border bg-background/70 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="destructive">
                          {severityLabels[finding.severity]}
                        </Badge>
                        <Badge variant="outline">
                          {
                            interactionEvidenceLevelLabels[
                              finding.evidenceLevel
                            ]
                          }
                        </Badge>
                        <span className="break-words text-sm font-semibold">
                          {finding.ingredientA} + {finding.ingredientB}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Клінічний ефект</p>
                        <p className="text-sm text-muted-foreground">
                          {finding.clinicalEffect}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Що робити</p>
                        <p className="text-sm text-muted-foreground">
                          {actionLabels[finding.actionCategory]}
                        </p>
                      </div>
                      <details className="rounded-lg border p-3">
                        <summary className="cursor-pointer font-semibold">
                          Докази й джерело
                        </summary>
                        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                          <p>{finding.explanation}</p>
                          {finding.mechanism ? (
                            <p>Механізм: {finding.mechanism}</p>
                          ) : null}
                          <p>Переглянуто: {finding.source.reviewedAt}</p>
                          {finding.source.url ? (
                            <a
                              className="inline-flex items-center gap-1 break-all text-primary underline"
                              href={finding.source.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <BookOpen className="h-4 w-4 shrink-0" />
                              {finding.source.label}
                            </a>
                          ) : (
                            <p>{finding.source.documentReference}</p>
                          )}
                        </div>
                      </details>
                    </div>
                  ))}

                  {pair.status !== "verified_interaction" ? (
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      {pair.status === "same_ingredient" ? (
                        <ShieldCheck className="h-4 w-4 shrink-0" />
                      ) : pair.status === "insufficient_evidence" ? (
                        <Info className="h-4 w-4 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                      )}
                      <span>
                        Не використовуйте цей статус як дозвіл на одночасне
                        застосування.
                      </span>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>

          {instructionSignals.isPending ? (
            <div className="flex gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.03] p-4 text-sm">
              <FileSearch className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-cyan-600" />
              <p>Паралельно перевіряємо офіційні інструкції обраних позицій…</p>
            </div>
          ) : null}

          {instructionSignals.isError ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground">
              Офіційні інструкції зараз не вдалося завантажити. Перевірені
              правила вище залишаються доступними.
            </div>
          ) : null}

          {instructionSignals.data ? (
            <section
              className="space-y-4"
              data-testid="instruction-signal-results"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <FileSearch className="h-5 w-5 text-cyan-600" />
                  Перехресна перевірка офіційних інструкцій
                </h2>
                <Badge variant="outline">
                  Інструкції:{" "}
                  {instructionSignals.data.coverage.instructionAvailableCount}/
                  {instructionSignals.data.coverage.selectedCount}
                </Badge>
              </div>
              <div className="space-y-3">
                {instructionSignals.data.pairs.map((pair) => (
                  <InstructionSignalPairCard
                    key={`${pair.productAId}:${pair.productBId}`}
                    pair={pair}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {instructionSignals.data.disclaimer}
              </p>
            </section>
          ) : null}

          <details className="rounded-xl border p-4 text-sm">
            <summary className="cursor-pointer font-semibold">
              Покриття та методологія
            </summary>
            <div className="mt-3 space-y-1 text-muted-foreground">
              <p>
                Набір правил: {checkInteractions.data.coverage.datasetVersion}
              </p>
              <p>Усього правил: {checkInteractions.data.coverage.totalRules}</p>
              <p>
                Допущено safety policy:{" "}
                {checkInteractions.data.coverage.runtimeEligibleRules}
              </p>
              <p>
                Перевірено пар діючих речовин:{" "}
                {checkInteractions.data.coverage.evaluatedIngredientPairs}
              </p>
              <p>{checkInteractions.data.disclaimer}</p>
            </div>
          </details>
        </section>
      ) : null}
    </div>
  );
}
