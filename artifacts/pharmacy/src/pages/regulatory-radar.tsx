import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Database,
  ExternalLink,
  FileSearch,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
} from "lucide-react";
import {
  useGetRegulatoryRadar,
  getGetRegulatoryRadarQueryKey,
  type RegulatoryEvent,
  type RegulatorySource,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type EventFilter = "all" | RegulatoryEvent["severity"];

const STATUS_PRESENTATION: Record<
  RegulatorySource["status"],
  { label: string; className: string }
> = {
  current: {
    label: "Актуальне",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  stale: {
    label: "Прострочене",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  },
  incomplete: {
    label: "Неповне",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  unavailable: {
    label: "Недоступне",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

const FILTERS: Array<{ key: EventFilter; label: string }> = [
  { key: "all", label: "Усі" },
  { key: "critical", label: "Заборони" },
  { key: "review", label: "Потребують перегляду" },
  { key: "info", label: "Поновлення" },
];

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("uk-UA").trim();
}

export function filterRegulatoryEvents(
  events: RegulatoryEvent[],
  query: string,
  filter: EventFilter,
): RegulatoryEvent[] {
  const needle = normalized(query);
  return events.filter((event) => {
    if (filter !== "all" && event.severity !== filter) return false;
    if (!needle) return true;
    return normalized(
      [
        event.medicineName,
        event.registrationNumber ?? "",
        event.series,
        event.manufacturer,
        event.documentNumber,
      ].join(" "),
    ).includes(needle);
  });
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function sourceDate(source: RegulatorySource): string {
  if (source.latestChangeDate) {
    return `Остання зміна: ${formatDate(source.latestChangeDate)}`;
  }
  if (source.releaseDate) {
    return `Редакція: ${formatDate(source.releaseDate)}`;
  }
  return `Перевірено: ${formatDate(source.checkedAt)}`;
}

function SourceCard({ source }: { source: RegulatorySource }) {
  const status = STATUS_PRESENTATION[source.status];
  const StatusIcon = source.status === "current" ? CheckCircle2 : AlertTriangle;
  return (
    <Card
      className="h-full border-border/80 bg-card/70"
      data-testid={`radar-source-${source.key}`}
    >
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug">{source.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {source.publisher}
            </p>
          </div>
          <Badge variant="outline" className={status.className}>
            <StatusIcon className="mr-1 h-3 w-3" />
            {status.label}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-muted/60 p-2">
            <span className="block text-muted-foreground">Записів</span>
            <strong className="text-sm">
              {source.recordCount.toLocaleString("uk-UA")}
            </strong>
          </div>
          <div className="rounded-lg bg-muted/60 p-2">
            <span className="block text-muted-foreground">Перевірено</span>
            <strong className="text-sm">{formatDate(source.checkedAt)}</strong>
          </div>
        </div>
        <p className="text-xs font-medium text-primary">{sourceDate(source)}</p>
        <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
          {source.note}
        </p>
        {source.warnings.map((warning) => (
          <p
            key={warning}
            className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200"
          >
            {warning}
          </p>
        ))}
        <a
          href={source.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Відкрити офіційне джерело
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </CardContent>
    </Card>
  );
}

function EventCard({ event }: { event: RegulatoryEvent }) {
  const presentation =
    event.severity === "critical"
      ? {
          icon: Ban,
          className: "border-destructive/30 bg-destructive/5",
          badge: "border-destructive/30 bg-destructive/10 text-destructive",
        }
      : event.severity === "review"
        ? {
            icon: ShieldAlert,
            className: "border-amber-500/30 bg-amber-500/5",
            badge:
              "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
          }
        : {
            icon: RotateCcw,
            className: "border-emerald-500/30 bg-emerald-500/5",
            badge:
              "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
          };
  const EventIcon = presentation.icon;
  return (
    <article
      className={`rounded-2xl border p-4 ${presentation.className}`}
      data-testid={`radar-event-${event.id}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/70">
          <EventIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={presentation.badge}>
              {event.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDate(event.date)}
            </span>
            <span className="text-xs text-muted-foreground">
              № {event.documentNumber}
            </span>
          </div>
          <h3 className="mt-2 break-words font-semibold leading-snug">
            {event.medicineName}
          </h3>
          <div className="mt-2 grid gap-1 break-words text-sm text-muted-foreground sm:grid-cols-2">
            <p>
              <span className="font-medium text-foreground">Серія:</span>{" "}
              {event.series || "не зазначена"}
            </p>
            <p>
              <span className="font-medium text-foreground">Реєстрація:</span>{" "}
              {event.registrationNumber ?? "не зазначена"}
            </p>
            {event.dosageForm ? (
              <p>
                <span className="font-medium text-foreground">Форма:</span>{" "}
                {event.dosageForm}
              </p>
            ) : null}
            {event.manufacturer ? (
              <p>
                <span className="font-medium text-foreground">Виробник:</span>{" "}
                {event.manufacturer}
              </p>
            ) : null}
          </div>
        </div>
        <a
          href={event.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
          aria-label={`Відкрити документ ${event.documentNumber} в офіційному реєстрі`}
        >
          Реєстр <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </article>
  );
}

function LoadingState() {
  return (
    <div
      className="space-y-4"
      role="status"
      aria-label="Завантаження Регуляторного радара"
    >
      <Skeleton className="h-32 w-full rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-56 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export default function RegulatoryRadarPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<EventFilter>("all");
  const radar = useGetRegulatoryRadar({
    query: {
      queryKey: getGetRegulatoryRadarQueryKey(),
      staleTime: 2 * 60_000,
      refetchOnWindowFocus: false,
    },
  });
  const events = useMemo(
    () => filterRegulatoryEvents(radar.data?.events ?? [], query, filter),
    [radar.data?.events, query, filter],
  );

  return (
    <div className="space-y-7" data-testid="regulatory-radar-page">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <BellRing className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Регуляторний радар
            </h1>
            <p className="mt-1 text-muted-foreground">
              Офіційні зміни, свіжість джерел і заборони серій в одному
              професійному екрані.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => radar.refetch()}
          disabled={radar.isFetching}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${radar.isFetching ? "animate-spin" : ""}`}
          />
          Оновити
        </Button>
      </header>

      {radar.isLoading ? <LoadingState /> : null}

      {radar.isError ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex gap-3 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold">
                Перевірені регуляторні дані тимчасово недоступні
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Не робіть висновок про відсутність заборони. Відкрийте офіційний
                реєстр Держлікслужби.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {radar.data ? (
        <>
          <Card
            className={
              radar.data.status === "current"
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-amber-500/30 bg-amber-500/5"
            }
          >
            <CardContent className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="flex gap-3">
                {radar.data.status === "current" ? (
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
                )}
                <div>
                  <p className="font-semibold">
                    {radar.data.status === "current"
                      ? "Усі регуляторні джерела актуальні"
                      : `${radar.data.summary.attentionSourceCount} із ${radar.data.summary.sourceCount} джерел потребують уваги`}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Сформовано {formatDateTime(radar.data.generatedAt)}.
                    Прострочений статус означає ручну звірку перед висновком.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-background/70 px-4 py-3">
                  <strong className="block text-2xl text-primary">
                    {radar.data.summary.currentSourceCount}
                  </strong>
                  <span className="text-xs text-muted-foreground">
                    актуальних
                  </span>
                </div>
                <div className="rounded-xl bg-background/70 px-4 py-3">
                  <strong className="block text-2xl">
                    {radar.data.summary.recentEventCount}
                  </strong>
                  <span className="text-xs text-muted-foreground">
                    подій за 30 днів
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <section aria-labelledby="radar-sources-title">
            <div className="mb-3 flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <h2 id="radar-sources-title" className="text-xl font-bold">
                Свіжість офіційних джерел
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {radar.data.sources.map((source, index) => (
                <div
                  key={source.key}
                  className={`h-full ${
                    index === radar.data.sources.length - 1 &&
                    radar.data.sources.length % 2 === 1
                      ? "md:col-span-2"
                      : ""
                  }`}
                >
                  <SourceCard source={source} />
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="radar-events-title" className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <FileSearch className="h-5 w-5 text-primary" />
                  <h2 id="radar-events-title" className="text-xl font-bold">
                    Журнал розпоряджень
                  </h2>
                </div>
                <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                  <CalendarDays className="h-4 w-4" />
                  {formatDate(radar.data.window.from)} —{" "}
                  {formatDate(radar.data.window.to)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Показано до 50 найновіших записів
              </p>
            </div>

            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Назва, серія, реєстраційний номер або виробник"
                    className="pl-9"
                    aria-label="Пошук у журналі розпоряджень"
                  />
                </div>
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label="Фільтр типу події"
                >
                  {FILTERS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setFilter(item.key)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${filter === item.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3">
                <span className="text-xs text-muted-foreground">
                  Тимчасові заборони
                </span>
                <strong className="mt-1 block text-xl">
                  {radar.data.summary.eventCounts.temporaryBan}
                </strong>
              </div>
              <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3">
                <span className="text-xs text-muted-foreground">
                  Постійні заборони
                </span>
                <strong className="mt-1 block text-xl">
                  {radar.data.summary.eventCounts.permanentBan}
                </strong>
              </div>
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
                <span className="text-xs text-muted-foreground">
                  Поновлення
                </span>
                <strong className="mt-1 block text-xl">
                  {radar.data.summary.eventCounts.restored}
                </strong>
              </div>
              <div className="rounded-xl border bg-muted/30 p-3">
                <span className="text-xs text-muted-foreground">
                  Інші зміни
                </span>
                <strong className="mt-1 block text-xl">
                  {radar.data.summary.eventCounts.other}
                </strong>
              </div>
            </div>

            <div className="space-y-3">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
              {events.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  За цим пошуком у завантаженому журналі збігів немає.
                </div>
              ) : null}
            </div>
          </section>

          <aside className="rounded-2xl border border-border/80 bg-muted/30 p-4 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Межі автоматизації</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {radar.data.notices.map((notice) => (
                <li key={notice}>{notice}</li>
              ))}
            </ul>
          </aside>
        </>
      ) : null}
    </div>
  );
}
