import React from "react";
import {
  AlertTriangle,
  BookOpenCheck,
  ChevronDown,
  ExternalLink,
  Scale,
  ShieldAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClinicalEvidenceComparison } from "@/lib/evidence-comparisons";

export const EVIDENCE_COMPARISON_DISCLAIMER =
  "Цей огляд узагальнює клінічні докази для діючих речовин у зазначеному сценарії. Він не підтверджує, що обрана форма або доза підходить конкретній людині, і не замінює рішення лікаря.";

function confidenceLabel(value: ClinicalEvidenceComparison["confidence"]): string {
  return value === "moderate" ? "Помірна впевненість" : "Низька впевненість";
}

function reviewedAtLabel(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("uk-UA", { dateStyle: "long", timeZone: "UTC" }).format(date);
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
      className="group max-w-full overflow-hidden rounded-2xl border bg-background/65"
      data-testid={testId}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold">
        <span className="break-words">{title}</span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none group-open:rotate-180" />
      </summary>
      <div className="border-t px-4 py-4">{children}</div>
    </details>
  );
}

export function EvidenceComparisonPanel({
  comparison,
}: {
  comparison: ClinicalEvidenceComparison;
}) {
  return (
    <section
      className="grid max-w-full gap-4 overflow-x-hidden"
      aria-labelledby="clinical-evidence-title"
      data-testid={`evidence-comparison-${comparison.id}`}
    >
      <Card className="max-w-full overflow-hidden border-primary/25 bg-primary/[0.03]">
        <CardHeader className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">
            <Badge>Evidence MVP</Badge>
            <Badge variant="outline">{confidenceLabel(comparison.confidence)}</Badge>
          </div>
          <CardTitle id="clinical-evidence-title" className="flex items-start gap-2 text-xl">
            <BookOpenCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span className="break-words">{comparison.title}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 p-4 pt-0 sm:p-5 sm:pt-0">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0 rounded-xl border bg-background/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Клінічне показання
              </p>
              <p className="mt-2 break-words text-sm leading-relaxed">{comparison.indication}</p>
            </div>
            <div className="min-w-0 rounded-xl border bg-background/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Чи це справжні альтернативи?
              </p>
              <p className="mt-2 break-words text-sm leading-relaxed">{comparison.alternatives}</p>
            </div>
            <div className="min-w-0 rounded-xl border bg-background/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Тип порівняння
              </p>
              <p className="mt-2 break-words text-sm leading-relaxed">{comparison.comparisonType}</p>
            </div>
            <div className="min-w-0 rounded-xl border bg-background/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Рівень упевненості
              </p>
              <p className="mt-2 break-words text-sm leading-relaxed">
                {comparison.confidenceRationale}
              </p>
            </div>
          </div>

          <ExpandableEvidenceSection title="Ключові outcomes ефективності" testId="evidence-effectiveness">
            <EvidenceList items={comparison.effectivenessOutcomes} />
          </ExpandableEvidenceSection>

          <ExpandableEvidenceSection title="Ключові ризики" testId="evidence-risks">
            <EvidenceList items={comparison.keyRisks} />
          </ExpandableEvidenceSection>

          <Alert className="border-amber-500/35 bg-amber-500/5">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Недостатньо даних</AlertTitle>
            <AlertDescription>{comparison.insufficientData}</AlertDescription>
          </Alert>

          <div className="rounded-2xl border bg-background/70 p-4">
            <div className="flex items-center gap-2 font-semibold">
              <Scale className="h-4 w-4 text-primary" />
              Нейтральний висновок
            </div>
            <p className="mt-2 break-words text-sm leading-relaxed">
              {comparison.neutralConclusion}
            </p>
          </div>

          <ExpandableEvidenceSection title="Джерела" testId="evidence-sources">
            <ol className="grid gap-3">
              {comparison.sources.map((source) => (
                <li key={source.url} className="min-w-0 rounded-xl border p-3">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-start gap-2 break-words font-medium text-primary hover:underline"
                  >
                    <span>{source.title}</span>
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  </a>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {source.design} · {source.published}
                  </p>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-muted-foreground">
              Дата перегляду доказів: {reviewedAtLabel(comparison.reviewedAt)}
            </p>
          </ExpandableEvidenceSection>
        </CardContent>
      </Card>

      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Межі evidence comparison</AlertTitle>
        <AlertDescription>{EVIDENCE_COMPARISON_DISCLAIMER}</AlertDescription>
      </Alert>
    </section>
  );
}

export function EvidenceComparisonUnavailable() {
  return (
    <Card className="max-w-full overflow-hidden border-dashed">
      <CardContent className="p-4 text-sm text-muted-foreground">
        Evidence-based огляд поки доступний лише для трьох клінічних пар MVP:
        апіксабан/ривароксабан, еналаприл/лізиноприл та ібупрофен/напроксен.
        Для цієї пари клінічний висновок не формується.
      </CardContent>
    </Card>
  );
}
