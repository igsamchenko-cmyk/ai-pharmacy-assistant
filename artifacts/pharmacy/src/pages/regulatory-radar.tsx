import React, { useEffect, useMemo, useState } from "react";
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
  type RegulatoryRadarRefresh,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useRegulatoryRadarRefresh } from "@/lib/regulatory-radar-refresh";

type EventFilter =
  | "all"
  | "new"
  | "temporary_ban"
  | "permanent_ban"
  | "restored"
  | "review";

const SEEN_EVENTS_STORAGE_KEY = "farmassist:regulatory-radar:seen-events:v1";

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
  { key: "new", label: "Нові" },
  { key: "all", label: "Усі" },
  { key: "temporary_ban", label: "Тимчасові" },
  { key: "permanent_ban", label: "Постійні" },
  { key: "restored", label: "Поновлення" },
  { key: "review", label: "Інші зміни" },
];

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("uk-UA").trim();
}

function initialRadarQuery(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
}

function readSeenEventIds(): Set<string> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SEEN_EVENTS_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(
          parsed.filter((value): value is string => typeof value === "string"),
        )
      : null;
  } catch {
    return null;
  }
}

function writeSeenEventIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SEEN_EVENTS_STORAGE_KEY,
      JSON.stringify([...ids].slice(-200)),
    );
  } catch {
    // The journal still works when browser storage is unavailable.
  }
}

function matchesEventFilter(
  event: RegulatoryEvent,
  filter: EventFilter,
  newEventIds: ReadonlySet<string>,
): boolean {
  if (filter === "all") return true;
  if (filter === "new") return newEventIds.has(event.id);
  if (filter === "temporary_ban") return event.type === "temporary_ban";
  if (filter === "permanent_ban") return event.type === "permanent_ban";
  if (filter === "restored") {
    return (
      event.type === "restore_temporary" || event.type === "restore_permanent"
    );
  }
  return event.severity === "review";
}

export function filterRegulatoryEvents(
  events: RegulatoryEvent[],
  query: string,
  filter: EventFilter,
  newEventIds: ReadonlySet<string> = new Set(),
): RegulatoryEvent[] {
  const needle = normalized(query);
  return events.filter((event) => {
    if (!matchesEventFilter(event, filter, newEventIds)) return false;
    if (!needle) return true;
    return normalized(
      [
        event.medicineName,
        event.registrationNumber ?? "",
        event.series,
        event.manufacturer,
        event.additionalInfo,
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
function refreshStatusMessage(
  result: RegulatoryRadarRefresh | null,
  isRefreshing: boolean,
): string {
  if (isRefreshing) {
    return "Перевіряємо актуальність даних Держлікслужби…";
  }
  if (!result) {
    return "Після відкриття застосунку дані перевіряються автоматично, але не частіше одного разу на 24 години.";
  }
  switch (result.status) {
    case "updated":
      return `Дані оновлено ${formatDateTime(result.checkedAt)}: додано ${result.addedCount}, змінено ${result.updatedCount}.`;
    case "unchanged":
      return `Перевірено ${formatDateTime(result.checkedAt)}: нових розпоряджень не виявлено.`;
    case "failed":
      return `Автоперевірка ${formatDateTime(result.checkedAt)} не вдалася. Використовується останній перевірений знімок.`;
    case "current":
      return `Дані актуальні. Остання успішна перевірка: ${formatDateTime(result.checkedAt)}.`;
    default:
      return "Після відкриття застосунку дані перевіряються автоматично.";
  }
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

export function EventCard({
  event,
  isNew,
}: {
  event: RegulatoryEvent;
  isNew: boolean;
}) {
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
            {isNew ? <Badge>Нове</Badge> : null}
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
          {event.additionalInfo ? (
            <p className="mt-3 rounded-xl bg-background/70 px-3 py-2 text-sm">
              <span className="font-medium text-foreground">
                {event.type === "restore_temporary" ||
                event.type === "restore_permanent"
                  ? "Пов’язане рішення:"
                  : "Примітка:"}
              </span>{" "}
              <span className="text-muted-foreground">
                {event.additionalInfo}
              </span>
            </p>
          ) : null}
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
  const [query, setQuery] = useState(initialRadarQuery);
  const [filter, setFilter] = useState<EventFilter>("all");
  const [seenEventIds, setSeenEventIds] = useState<Set<string>>(new Set());
  const [seenStateReady, setSeenStateReady] = useState(false);
  const radar = useGetRegulatoryRadar({
    query: {
      queryKey: getGetRegulatoryRadarQueryKey(),
      staleTime: 2 * 60_000,
      refetchOnWindowFocus: false,
    },
  });
  const automaticRefresh = useRegulatoryRadarRefresh();
  const isRefreshing = automaticRefresh.isRefreshing || radar.isFetching;

  useEffect(() => {
    if (!radar.data || seenStateReady) return;
    const stored = readSeenEventIds();
    const baseline =
      stored ?? new Set(radar.data.events.map((event) => event.id));
    if (stored === null) writeSeenEventIds(baseline);
    setSeenEventIds(baseline);
    setSeenStateReady(true);
  }, [radar.data, seenStateReady]);

  const newEventIds = useMemo(
    () =>
      new Set(
        (radar.data?.events ?? [])
          .filter((event) => seenStateReady && !seenEventIds.has(event.id))
          .map((event) => event.id),
      ),
    [radar.data?.events, seenEventIds, seenStateReady],
  );
  const events = useMemo(
    () =>
      filterRegulatoryEvents(
        radar.data?.events ?? [],
        query,
        filter,
        newEventIds,
      ),
    [radar.data?.events, query, filter, newEventIds],
  );
  const seriesSource = radar.data?.sources.find(
    (source) => source.key === "series_restrictions",
  );

  const markAllEventsSeen = () => {
    const next = new Set(seenEventIds);
    for (const event of radar.data?.events ?? []) next.add(event.id);
    writeSeenEventIds(next);
    setSeenEventIds(next);
    if (filter === "new") setFilter("all");
  };

  return (
    <div
      className="mx-auto w-full max-w-7xl space-y-7 overflow-x-hidden pb-10"
      data-testid="regulatory-radar-page"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <BellRing className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Регуляторний радар
            </h1>
            <p className="mt-1 text-muted-foreground">
              Офіційні зміни, свіжість джерел і заборони серій в одному
              професійному екрані.
            </p>
            <p className="mt-2 text-xs text-muted-foreground" role="status">
              {refreshStatusMessage(
                automaticRefresh.lastResult,
                automaticRefresh.isRefreshing,
              )}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => {
            void automaticRefresh.refresh().then(() => {
              void radar.refetch();
            });
          }}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
          Перевірити актуальність
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

            {seriesSource ? (
              <Card
                className={
                  seriesSource.status === "current"
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-amber-500/30 bg-amber-500/5"
                }
                data-testid="radar-series-update-status"
              >
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex gap-3">
                    <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">Оновлення Держлікслужби</p>
                        <Badge
                          variant="outline"
                          className={
                            STATUS_PRESENTATION[seriesSource.status].className
                          }
                        >
                          {STATUS_PRESENTATION[seriesSource.status].label}
                        </Badge>
                        {newEventIds.size > 0 ? (
                          <Badge>{newEventIds.size} нових</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Знімок перевірено {formatDate(seriesSource.checkedAt)} ·
                        останнє розпорядження{" "}
                        {formatDate(seriesSource.latestChangeDate)}.
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Щоденна автоматична перевірка виявляє зміни. У довіднику
                        вони з'являються після валідації та контрольованого
                        оновлення перевіреного знімка.
                      </p>
                    </div>
                  </div>
                  {newEventIds.size > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={markAllEventsSeen}
                    >
                      Позначити переглянутими
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

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
                      className={`min-h-11 rounded-full border px-3 py-2 text-xs font-medium transition-colors lg:min-h-9 ${filter === item.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent"}`}
                    >
                      {item.label}
                      {item.key === "new" ? ` · ${newEventIds.size}` : ""}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => setFilter("temporary_ban")}
                aria-pressed={filter === "temporary_ban"}
                className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-left transition-colors hover:bg-destructive/10"
              >
                <span className="text-xs text-muted-foreground">
                  Тимчасові заборони
                </span>
                <strong className="mt-1 block text-xl">
                  {radar.data.summary.eventCounts.temporaryBan}
                </strong>
              </button>
              <button
                type="button"
                onClick={() => setFilter("permanent_ban")}
                aria-pressed={filter === "permanent_ban"}
                className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-left transition-colors hover:bg-destructive/10"
              >
                <span className="text-xs text-muted-foreground">
                  Постійні заборони
                </span>
                <strong className="mt-1 block text-xl">
                  {radar.data.summary.eventCounts.permanentBan}
                </strong>
              </button>
              <button
                type="button"
                onClick={() => setFilter("restored")}
                aria-pressed={filter === "restored"}
                className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-left transition-colors hover:bg-emerald-500/10"
              >
                <span className="text-xs text-muted-foreground">
                  Поновлення
                </span>
                <strong className="mt-1 block text-xl">
                  {radar.data.summary.eventCounts.restored}
                </strong>
              </button>
              <button
                type="button"
                onClick={() => setFilter("review")}
                aria-pressed={filter === "review"}
                className="rounded-xl border bg-muted/30 p-3 text-left transition-colors hover:bg-muted/60"
              >
                <span className="text-xs text-muted-foreground">
                  Інші зміни
                </span>
                <strong className="mt-1 block text-xl">
                  {radar.data.summary.eventCounts.other}
                </strong>
              </button>
            </div>
            <div className="space-y-3">
              {events.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  isNew={newEventIds.has(event.id)}
                />
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
