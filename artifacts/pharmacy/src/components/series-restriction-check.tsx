import React from "react";
import type {
  RegistryProductResult,
  SeriesRestrictionCheck,
  SeriesRestrictionEvent,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  OctagonX,
  ScanSearch,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const EVENT_LABELS: Record<SeriesRestrictionEvent["eventType"], string> = {
  temporary_ban: "Тимчасова заборона",
  permanent_ban: "Постійна заборона",
  restore_temporary: "Скасування тимчасової заборони",
  restore_permanent: "Скасування постійної заборони",
  partial_cancellation: "Часткове скасування",
  supplement: "Доповнення до документа",
};

function formatDate(value: string): string {
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium" }).format(date);
}

export function seriesRestrictionStatusLabel(
  result: SeriesRestrictionCheck,
): string {
  if (result.status === "blocked") return "СТОП: знайдено чинну заборону";
  if (result.status === "restored") return "Знайдено поновлення обігу";
  if (result.status === "needs_review") {
    return "Знайдено документ — потрібна ручна перевірка";
  }
  return "Точного збігу не знайдено — це не дозвіл";
}

export interface SeriesRestrictionCheckPanelProps {
  product: RegistryProductResult;
  draftSeries: string;
  submittedSeries: string;
  result?: SeriesRestrictionCheck;
  isLoading: boolean;
  isError: boolean;
  onDraftSeriesChange: (value: string) => void;
  onSubmit: () => void;
}

export function SeriesRestrictionCheckPanel({
  product,
  draftSeries,
  submittedSeries,
  result,
  isLoading,
  isError,
  onDraftSeriesChange,
  onSubmit,
}: SeriesRestrictionCheckPanelProps) {
  const blocked = result?.status === "blocked";
  const ResultIcon = blocked
    ? OctagonX
    : result?.status === "restored"
      ? CheckCircle2
      : AlertTriangle;

  return (
    <section className="space-y-4" data-testid="series-restriction-check">
      <div>
        <h2 className="text-xl font-bold">Перевірка серії упаковки</h2>
        <p className="text-sm text-muted-foreground">
          Точний збіг: {product.registration.number} + серія з упаковки. Дефіси
          та інші знаки серії мають значення.
        </p>
      </div>

      <Card className="border-primary/25">
        <CardContent className="space-y-3 p-4">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <Input
              value={draftSeries}
              onChange={(event) => onDraftSeriesChange(event.target.value)}
              placeholder="Серія точно як на упаковці"
              aria-label="Серія лікарського засобу"
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={80}
              className="min-h-12 font-mono uppercase"
              data-testid="series-input"
            />
            <Button
              type="submit"
              className="min-h-12 sm:min-w-44"
              disabled={!draftSeries.trim() || isLoading}
              data-testid="series-check-button"
            >
              {isLoading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ScanSearch className="h-4 w-4" />
              )}
              Перевірити серію
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            Пошук не є нечітким: <span className="font-mono">AB-123</span> і{" "}
            <span className="font-mono">AB123</span> вважаються різними серіями.
          </p>
        </CardContent>
      </Card>

      {!submittedSeries && !isError ? (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Серію ще не перевірено</AlertTitle>
          <AlertDescription>
            Введіть маркування безпосередньо з упаковки. Не продовжуйте лише на
            підставі назви препарату.
          </AlertDescription>
        </Alert>
      ) : null}

      {isError ? (
        <Alert variant="destructive">
          <OctagonX className="h-4 w-4" />
          <AlertTitle>Перевірка серії недоступна</AlertTitle>
          <AlertDescription>
            Звірте серію безпосередньо в офіційному реєстрі Держлікслужби.
          </AlertDescription>
        </Alert>
      ) : null}

      {result ? (
        <div className="space-y-3" data-testid="series-check-result">
          <Alert
            variant={blocked ? "destructive" : "default"}
            className={
              blocked ? undefined : "border-amber-500/40 bg-amber-500/5"
            }
          >
            <ResultIcon className="h-4 w-4" />
            <AlertTitle>{seriesRestrictionStatusLabel(result)}</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{result.summary}</p>
              {result.source.freshness !== "current" ? (
                <p className="font-semibold">
                  Знімок прострочений або неповний. Перевірка в живому реєстрі
                  обов'язкова.
                </p>
              ) : null}
              {result.matchedUnspecifiedSeries ? (
                <p className="font-semibold">
                  У документі серію не зазначено; автоматично звузити його до
                  окремої упаковки неможливо.
                </p>
              ) : null}
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">Перевірена серія: {result.series}</Badge>
            <Badge variant="outline">
              Знімок: {formatDate(result.source.generatedAt)}
            </Badge>
            <Badge variant="outline">
              Останній документ:{" "}
              {result.source.latestDocumentDate
                ? formatDate(result.source.latestDocumentDate)
                : "не зазначено"}
            </Badge>
          </div>

          {result.events.length ? (
            <div className="space-y-2" data-testid="series-matched-events">
              {result.events.map((event, index) => (
                <Card
                  key={`${event.documentNumber}:${event.seriesRaw}:${index}`}
                >
                  <CardHeader className="p-4 pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <CardTitle className="text-base">
                        {EVENT_LABELS[event.eventType]}
                      </CardTitle>
                      <Badge variant="outline">
                        {formatDate(event.documentDate)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1 p-4 pt-0 text-sm">
                    <p>
                      Документ: <strong>{event.documentNumber}</strong>
                    </p>
                    <p>
                      Серія в документі: <strong>{event.seriesRaw}</strong>
                    </p>
                    <p className="text-muted-foreground">
                      {event.medicineName}
                      {event.dosageForm ? ` · ${event.dosageForm}` : ""}
                    </p>
                    {event.additionalInfo ? (
                      <p className="text-muted-foreground">
                        {event.additionalInfo}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Точного документа для цієї комбінації не знайдено. У реєстрі є{" "}
              {result.otherSeriesEventCount} інших записів для цього
              реєстраційного номера.
            </p>
          )}

          <Button asChild variant="outline" className="min-h-11">
            <a href={result.source.url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> Відкрити офіційний реєстр
            </a>
          </Button>
        </div>
      ) : null}
    </section>
  );
}
