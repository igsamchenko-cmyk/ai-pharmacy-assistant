import React from "react";
import {
  Activity,
  AlertTriangle,
  BookOpenCheck,
  ChevronDown,
  ExternalLink,
  Info,
  Microscope,
  Scale,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ClinicalEvidenceComparison,
  ComparisonClassification,
  EvidenceComparisonResolution,
  EvidenceDirectness,
} from "@/lib/evidence-comparisons";

export const EVIDENCE_COMPARISON_DISCLAIMER =
  "Клінічний висновок застосовується лише до exact INN/composition, вибраного показання, population та outcomes у verified evidence record. Він не переноситься автоматично на інші дози, форми, комбінації або показання, не є висновком про конкретний бренд і не замінює рішення лікаря.";

function confidenceLabel(
  value: ClinicalEvidenceComparison["confidence"],
): string {
  if (value === "high") return "Висока впевненість";
  return value === "moderate" ? "Помірна впевненість" : "Низька впевненість";
}

function confidenceBadgeClass(
  value: ClinicalEvidenceComparison["confidence"],
): string {
  return value === "moderate"
    ? "border-sky-500/40 bg-sky-500/10 text-sky-950 dark:text-sky-100"
    : "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100";
}

function withoutRankingLanguage(value: string): string {
  return value
    .replace(
      "назвати один кращим за інший",
      "стверджувати про перевагу одного над іншим",
    )
    .replace(
      "визначити кращий препарат",
      "визначити перевагу одного препарату",
    );
}

const CONFIDENCE_GUIDE = [
  {
    value: "low",
    label: "Низька",
    description:
      "Дані обмежені; висновок може змінитися після нових досліджень.",
  },
  {
    value: "moderate",
    label: "Помірна",
    description:
      "Дані достатньо узгоджені, але важлива невизначеність залишається.",
  },
  {
    value: "high",
    label: "Висока",
    description: "Надійні прямі дані; суттєва зміна висновку малоймовірна.",
  },
] as const;

function directnessPresentation(value: EvidenceDirectness): {
  label: string;
  description: string;
} {
  if (value === "mixed") {
    return {
      label: "Прямі + непрямі дані",
      description: "Є head-to-head дані, доповнені непрямими порівняннями.",
    };
  }
  if (value === "direct") {
    return {
      label: "Пряме порівняння",
      description: "Препарати безпосередньо порівнювали в одному дослідженні.",
    };
  }
  if (value === "indirect") {
    return {
      label: "Непрямі дані",
      description: "Висновок сформовано без надійного head-to-head порівняння.",
    };
  }
  return {
    label: "Недостатньо доказів",
    description: "Verified evidence record для вибраного контексту відсутній.",
  };
}

function classificationLabel(value: ComparisonClassification): string {
  if (value === "same_ingredient") return "Однакова діюча речовина";
  if (value === "same_therapeutic_class") return "Один терапевтичний клас";
  if (value === "clinical_alternatives") return "Клінічні альтернативи";
  return "Клінічно непорівнювані";
}
function reviewedAtLabel(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("uk-UA", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(date);
}

function EvidenceList({ items }: { items: readonly string[] }) {
  return (
    <ul className="grid gap-2 pl-5 text-sm leading-relaxed">
      {items.map((item) => (
        <li key={item} className="list-disc break-words marker:text-primary">
          {item}
        </li>
      ))}
    </ul>
  );
}

function EvidenceSection({
  title,
  icon,
  children,
  testId,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <Card className="min-w-0 max-w-full overflow-hidden" data-testid={testId}>
      <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <span className="text-primary" aria-hidden="true">
            {icon}
          </span>
          <span>{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 p-4 pt-0 sm:p-5 sm:pt-0">
        {children}
      </CardContent>
    </Card>
  );
}

function ExpandableEvidenceSection({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <details
      className="group min-w-0 max-w-full overflow-hidden rounded-2xl border bg-background/65"
      data-testid={testId}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold">
        <span className="break-words">{title}</span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none group-open:rotate-180" />
      </summary>
      <div className="min-w-0 border-t px-4 py-4">{children}</div>
    </details>
  );
}

export function EvidenceComparisonPanel({
  comparison,
}: {
  comparison: ClinicalEvidenceComparison;
}) {
  const directness = directnessPresentation(comparison.directness);

  return (
    <section
      className="grid min-w-0 max-w-full gap-3 overflow-x-hidden sm:gap-4"
      aria-labelledby="clinical-evidence-title"
      data-testid={`evidence-comparison-${comparison.id}`}
    >
      <Card className="max-w-full overflow-hidden border-primary/25 bg-primary/[0.03]">
        <CardHeader className="space-y-3 p-4 sm:p-5">
          <div className="flex min-w-0 flex-wrap gap-2">
            <Badge>Evidence MVP</Badge>
            <Badge
              className={confidenceBadgeClass(comparison.confidence)}
              variant="outline"
              data-testid="confidence-badge"
            >
              {confidenceLabel(comparison.confidence)}
            </Badge>
            <Badge
              className="border-violet-500/40 bg-violet-500/10 text-violet-950 dark:text-violet-100"
              variant="outline"
              data-testid="directness-badge"
            >
              {directness.label}
            </Badge>
          </div>
          <CardTitle
            id="clinical-evidence-title"
            className="flex items-start gap-2 text-xl"
          >
            <BookOpenCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span className="break-words">{comparison.title}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-3 p-4 pt-0 sm:gap-4 sm:p-5 sm:pt-0">
          <div
            className="min-w-0 rounded-2xl border border-primary/20 bg-background/80 p-4"
            data-testid="evidence-what-is-known"
          >
            <div className="flex items-center gap-2 font-semibold">
              <Info className="h-4 w-4 shrink-0 text-primary" />
              <span>Що відомо</span>
            </div>
            <p className="mt-2 break-words text-sm leading-relaxed">
              {withoutRankingLanguage(comparison.neutralConclusion)}
            </p>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0 rounded-xl border bg-background/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Клінічне показання
              </p>
              <p className="mt-2 break-words text-sm font-medium">
                {comparison.indication.label}
              </p>
              <p className="mt-1 break-words text-sm leading-relaxed">
                {comparison.indication.description}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border bg-background/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Чи це справжні альтернативи?
              </p>
              <p className="mt-2 break-words text-sm leading-relaxed">
                {comparison.alternatives}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border bg-background/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Population
              </p>
              <p className="mt-2 break-words text-sm leading-relaxed">
                {comparison.indication.population}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border bg-background/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Outcomes
              </p>
              <p className="mt-2 break-words text-sm leading-relaxed">
                {comparison.indication.outcomes
                  .map((outcome) => outcome.label)
                  .join(" · ")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <EvidenceSection
        title="Ефективність"
        icon={<Activity className="h-5 w-5" />}
        testId="evidence-effectiveness"
      >
        <EvidenceList items={comparison.effectivenessOutcomes} />
      </EvidenceSection>

      <EvidenceSection
        title="Безпека"
        icon={<ShieldCheck className="h-5 w-5" />}
        testId="evidence-safety"
      >
        <EvidenceList items={comparison.keyRisks} />
      </EvidenceSection>

      <EvidenceSection
        title="Якість доказів"
        icon={<Microscope className="h-5 w-5" />}
        testId="evidence-quality"
      >
        <div className="grid min-w-0 gap-4">
          <div className="flex min-w-0 flex-wrap gap-2">
            <Badge variant="outline">
              {confidenceLabel(comparison.confidence)}
            </Badge>
            <Badge variant="outline">{directness.label}</Badge>
          </div>

          <div
            className="grid min-w-0 gap-2 sm:grid-cols-3"
            aria-label="Шкала впевненості доказів"
          >
            {CONFIDENCE_GUIDE.map((level) => {
              const isCurrent = comparison.confidence === level.value;
              return (
                <div
                  key={level.value}
                  className={`min-w-0 rounded-xl border p-3 ${
                    isCurrent ? "border-primary/40 bg-primary/5" : "bg-muted/20"
                  }`}
                  aria-current={isCurrent ? "true" : undefined}
                >
                  <p className="text-sm font-semibold">{level.label}</p>
                  <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                    {level.description}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0 rounded-xl border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Чому така впевненість
              </p>
              <p className="mt-2 break-words text-sm leading-relaxed">
                {comparison.confidenceRationale}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Прямота доказів
              </p>
              <p className="mt-2 break-words text-sm leading-relaxed">
                {directness.description}
              </p>
            </div>
          </div>
        </div>
      </EvidenceSection>

      <Alert
        className="min-w-0 border-amber-500/45 bg-amber-500/10"
        data-testid="evidence-insufficient-data"
      >
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Недостатньо даних</AlertTitle>
        <AlertDescription className="break-words leading-relaxed">
          {withoutRankingLanguage(comparison.insufficientData)}
        </AlertDescription>
      </Alert>

      <ExpandableEvidenceSection
        title="Джерела та методологія"
        testId="evidence-sources-methodology"
      >
        <div className="mb-4 min-w-0 rounded-xl border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Scale className="h-4 w-4 shrink-0 text-primary" />
            Метод порівняння
          </div>
          <p className="mt-2 break-words text-sm leading-relaxed">
            {comparison.comparisonType}
          </p>
        </div>
        <ol className="grid min-w-0 gap-3">
          {comparison.sources.map((source) => (
            <li
              key={source.url}
              className="min-w-0 max-w-full rounded-xl border p-3"
            >
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-start gap-2 break-words font-medium text-primary hover:underline"
              >
                <span>{source.title}</span>
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              </a>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {source.design} · {source.published}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">
          Дата перегляду доказів: {reviewedAtLabel(comparison.reviewedAt)}
        </p>
      </ExpandableEvidenceSection>

      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Межі evidence comparison</AlertTitle>
        <AlertDescription>{EVIDENCE_COMPARISON_DISCLAIMER}</AlertDescription>
      </Alert>
    </section>
  );
}

export function EvidenceComparisonUnavailable({
  resolution,
}: {
  resolution: EvidenceComparisonResolution;
}) {
  return (
    <Alert
      className="min-w-0 border-amber-500/45 bg-amber-500/10"
      data-testid="evidence-unavailable"
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Надійного клінічного порівняння немає</AlertTitle>
      <AlertDescription className="grid gap-2">
        <p className="break-words">{resolution.message}</p>
        <p className="break-words text-xs">
          Клінічний висновок не генерується з інструкцій або LLM. Поки exact
          evidence match відсутній, FarmAssist показує лише реєстрові дані обох
          препаратів.
        </p>
      </AlertDescription>
    </Alert>
  );
}

export function EvidenceComparisonExperience({
  resolution,
  selectedIndicationId,
  onSelectIndication,
}: {
  resolution: EvidenceComparisonResolution;
  selectedIndicationId: string | null;
  onSelectIndication: (indicationId: string) => void;
}) {
  return (
    <section
      className="grid min-w-0 max-w-full gap-3 overflow-x-hidden"
      data-testid="evidence-resolver"
    >
      <Card className="min-w-0 max-w-full overflow-hidden">
        <CardContent className="grid gap-3 p-4">
          <div className="flex min-w-0 flex-wrap gap-2">
            <Badge variant="secondary">Database-driven resolver</Badge>
            <Badge variant="outline" data-testid="comparison-classification">
              {classificationLabel(resolution.classification)}
            </Badge>
          </div>
          {resolution.identities ? (
            <div
              className="grid min-w-0 gap-2 text-sm sm:grid-cols-2"
              data-testid="exact-composition-identities"
            >
              {resolution.identities.map((identity, index) => (
                <div
                  key={`${identity.signature ?? "unknown"}-${index}`}
                  className="min-w-0 rounded-xl border bg-muted/20 p-3"
                >
                  <p className="break-words font-medium">
                    {identity.rawInn || "INN/composition не визначено"}
                  </p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {identity.kind === "combination"
                      ? "Комбінація"
                      : identity.kind === "monotherapy"
                        ? "Монопрепарат"
                        : "Невідомий склад"}
                    {identity.therapeuticClassKey
                      ? ` · ATC ${identity.therapeuticClassKey}`
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
          {resolution.availableIndications.length > 0 ? (
            <fieldset className="grid min-w-0 gap-2">
              <legend className="text-sm font-semibold">
                Оберіть клінічне показання
              </legend>
              <div className="flex min-w-0 flex-wrap gap-2">
                {resolution.availableIndications.map((indication) => (
                  <Button
                    key={indication.id}
                    type="button"
                    size="sm"
                    variant={
                      selectedIndicationId === indication.id
                        ? "default"
                        : "outline"
                    }
                    className="h-auto min-w-0 max-w-full whitespace-normal text-left"
                    onClick={() => onSelectIndication(indication.id)}
                  >
                    {indication.label}
                  </Button>
                ))}
              </div>
            </fieldset>
          ) : null}
        </CardContent>
      </Card>

      {resolution.status === "verified" && resolution.comparison ? (
        <EvidenceComparisonPanel comparison={resolution.comparison} />
      ) : resolution.status === "indication_required" ? (
        <Alert data-testid="evidence-indication-required">
          <Info className="h-4 w-4" />
          <AlertTitle>Спочатку виберіть показання</AlertTitle>
          <AlertDescription>{resolution.message}</AlertDescription>
        </Alert>
      ) : (
        <EvidenceComparisonUnavailable resolution={resolution} />
      )}
    </section>
  );
}
