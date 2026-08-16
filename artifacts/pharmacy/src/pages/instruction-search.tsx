import { useEffect, useMemo, useState } from "react";
import {
  getSearchDrugInstructionsQueryKey,
  useSearchDrugInstructions,
  type InstructionSearchHighlight,
  type InstructionSearchResult,
  type SearchDrugInstructionsSection,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenText,
  CalendarDays,
  FileSearch,
  LoaderCircle,
  Search,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { INSTRUCTION_SECTION_LABELS } from "@/pages/drug-instruction";

const SECTION_OPTIONS: Array<{
  value: SearchDrugInstructionsSection;
  label: string;
}> = [
  { value: "all", label: "Усі розділи" },
  ...INSTRUCTION_SECTION_LABELS.map(({ key, label }) => ({
    value: key,
    label,
  })),
];

const SECTION_LABELS = Object.fromEntries(
  INSTRUCTION_SECTION_LABELS.map(({ key, label }) => [key, label]),
) as Record<InstructionSearchResult["sectionKey"], string>;

const MATCH_MODE_LABELS: Record<InstructionSearchResult["matchMode"], string> =
  {
    exact_phrase: "Точна фраза",
    all_terms: "Усі слова",
    transliteration: "Розпізнано транслітерацію",
    keyboard_layout: "Виправлено розкладку",
    approximate: "Нечіткий збіг",
  };

export const INSTRUCTION_SEARCH_DEBOUNCE_MS = 175;

function initialState(): {
  query: string;
  section: SearchDrugInstructionsSection;
} {
  if (typeof window === "undefined") return { query: "", section: "all" };
  const params = new URLSearchParams(window.location.search);
  const requestedSection = params.get("section");
  return {
    query: params.get("q") ?? "",
    section: SECTION_OPTIONS.some((option) => option.value === requestedSection)
      ? (requestedSection as SearchDrugInstructionsSection)
      : "all",
  };
}

export function instructionSearchResultHref(
  item: Pick<
    InstructionSearchResult,
    "registryProductId" | "registrationNumber" | "sectionKey" | "quote"
  >,
): string {
  const anchor = `instruction-quote-${item.sectionKey}-${item.quote.charStart}-${item.quote.charEnd}`;
  // PR-H, H.3.2: land directly on the Instruction tab, not just on a hash
  // the Profile tab ignores until the pharmacist switches tabs manually.
  return `/products/${encodeURIComponent(item.registryProductId)}?registration=${encodeURIComponent(item.registrationNumber)}&tab=instruction#${anchor}`;
}

export interface HighlightedSegment {
  text: string;
  highlighted: boolean;
}

export function highlightedQuoteSegments(
  quote: InstructionSearchResult["quote"],
  highlights: readonly InstructionSearchHighlight[],
): HighlightedSegment[] {
  const valid = highlights
    .map((highlight) => ({
      start: Math.max(quote.charStart, highlight.charStart) - quote.charStart,
      end: Math.min(quote.charEnd, highlight.charEnd) - quote.charStart,
    }))
    .filter(
      (highlight) =>
        highlight.start >= 0 &&
        highlight.end > highlight.start &&
        highlight.end <= quote.text.length,
    )
    .sort((left, right) => left.start - right.start);
  const segments: HighlightedSegment[] = [];
  let cursor = 0;
  for (const highlight of valid) {
    if (highlight.start > cursor) {
      segments.push({
        text: quote.text.slice(cursor, highlight.start),
        highlighted: false,
      });
    }
    const start = Math.max(cursor, highlight.start);
    if (highlight.end > start) {
      segments.push({
        text: quote.text.slice(start, highlight.end),
        highlighted: true,
      });
    }
    cursor = Math.max(cursor, highlight.end);
  }
  if (cursor < quote.text.length) {
    segments.push({ text: quote.text.slice(cursor), highlighted: false });
  }
  return segments.length
    ? segments
    : [{ text: quote.text, highlighted: false }];
}

function formatDate(value: string | Date | null): string {
  if (!value) return "дату документа не вказано";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? "дату документа не вказано"
    : new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium" }).format(date);
}

function SearchResultCard({ item }: { item: InstructionSearchResult }) {
  const segments = useMemo(
    () => highlightedQuoteSegments(item.quote, item.highlights),
    [item.highlights, item.quote],
  );
  return (
    <Card
      className="min-w-0 overflow-hidden"
      data-testid="instruction-search-result"
    >
      <CardContent className="min-w-0 space-y-4 p-4 sm:p-5">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="[overflow-wrap:anywhere] text-lg font-bold leading-tight">
              {item.tradeName}
            </h2>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              <span className="font-medium text-foreground">МНН:</span>{" "}
              {item.inn}
            </p>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              {[item.strength, item.dosageForm].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Badge variant="outline" className="w-fit shrink-0 whitespace-normal">
            {SECTION_LABELS[item.sectionKey]}
          </Badge>
        </div>

        <blockquote className="rounded-xl border-l-4 border-primary bg-muted/35 px-4 py-3 text-sm leading-6">
          {segments.map((segment, index) =>
            segment.highlighted ? (
              <mark
                key={`${segment.text}-${index}`}
                className="rounded bg-primary/20 px-0.5 text-foreground"
              >
                {segment.text}
              </mark>
            ) : (
              <span key={`${segment.text}-${index}`}>{segment.text}</span>
            ),
          )}
        </blockquote>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{MATCH_MODE_LABELS[item.matchMode]}</Badge>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            Документ: {formatDate(item.source.documentDate)}
          </span>
          <span>Покриття: {item.source.coveragePct}%</span>
        </div>

        <Button asChild className="min-h-11 w-full sm:w-auto">
          <Link href={instructionSearchResultHref(item)}>
            Відкрити точне місце в інструкції
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function LoadingResults() {
  return (
    <div className="space-y-3" role="status" aria-label="Пошук в інструкціях">
      {[0, 1, 2].map((item) => (
        <Skeleton key={item} className="h-52 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export default function InstructionSearchPage() {
  const initial = useMemo(initialState, []);
  const [query, setQuery] = useState(initial.query);
  const [section, setSection] = useState<SearchDrugInstructionsSection>(
    initial.section,
  );
  const debouncedQuery = useDebounce(
    query.trim(),
    INSTRUCTION_SEARCH_DEBOUNCE_MS,
  );
  const enabled = debouncedQuery.length >= 2;
  const searchParams = useMemo(
    () => ({
      q: enabled ? debouncedQuery : "__",
      section,
      limit: 20,
    }),
    [debouncedQuery, enabled, section],
  );
  const search = useSearchDrugInstructions(searchParams, {
    query: {
      enabled,
      staleTime: 5 * 60_000,
      retry: 1,
      queryKey: getSearchDrugInstructionsQueryKey(searchParams),
      refetchOnWindowFocus: false,
    },
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (section !== "all") params.set("section", section);
    const suffix = params.size ? `?${params.toString()}` : "";
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${suffix}`,
    );
  }, [query, section]);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 overflow-x-clip pb-12">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-primary sm:text-3xl">
          <FileSearch className="h-7 w-7" />
          Пошук у текстах інструкцій
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Сформулюйте професійне питання або введіть термін. Пошук охоплює
          дослівний текст перевірених офіційних інструкцій.
        </p>
      </header>

      <div
        className="grid grid-cols-2 gap-1 rounded-xl border bg-muted/30 p-1"
        aria-label="Режим пошуку"
      >
        <Button asChild variant="ghost" className="min-h-11 whitespace-normal">
          <Link href="/search">За назвою або МНН</Link>
        </Button>
        <Button type="button" className="min-h-11 whitespace-normal">
          У текстах інструкцій
        </Button>
      </div>

      <Alert className="border-amber-500/50 bg-amber-500/5">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Тільки дослівні дані з джерела</AlertTitle>
        <AlertDescription>
          Система не генерує і не переказує медичний текст. Завжди перевіряйте
          контекст повного розділу та точну реєстрову позицію.
        </AlertDescription>
      </Alert>

      <section className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 space-y-2 rounded-2xl border bg-background/95 p-3 shadow-sm backdrop-blur lg:top-0">
        <label className="relative block">
          <span className="sr-only">Професійне питання або термін</span>
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-12 bg-card pl-10 pr-10"
            placeholder="Наприклад: не змішувати з кальцієм"
            autoComplete="off"
            data-testid="instruction-search-input"
          />
          {search.isFetching ? (
            <LoaderCircle className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </label>
        <Select
          value={section}
          onValueChange={(value) =>
            setSection(value as SearchDrugInstructionsSection)
          }
        >
          <SelectTrigger className="min-h-11 w-full sm:w-72">
            <SelectValue placeholder="Усі розділи" />
          </SelectTrigger>
          <SelectContent>
            {SECTION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      {!query.trim() ? (
        <Card className="border-dashed">
          <CardContent className="space-y-3 p-6 text-center">
            <BookOpenText className="mx-auto h-9 w-9 text-primary" />
            <p className="font-semibold">
              Шукайте так, як формулюють питання у відділенні
            </p>
            <p className="text-sm text-muted-foreground">
              «чим розводити», «доза при кліренсі 30», «вводити протягом 30
              хвилин» або конкретний препарат разом із питанням.
            </p>
          </CardContent>
        </Card>
      ) : query.trim().length < 2 ? (
        <p className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
          Введіть щонайменше два символи.
        </p>
      ) : search.isLoading ? (
        <LoadingResults />
      ) : search.isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Пошук тимчасово недоступний</AlertTitle>
          <AlertDescription>
            Не робіть висновок про відсутність інформації. Спробуйте повторити
            запит або відкрийте інструкцію через пошук препарату.
          </AlertDescription>
        </Alert>
      ) : search.data?.items.length ? (
        <section className="space-y-3" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="font-semibold">
              Знайдено: {search.data.total} · показано{" "}
              {search.data.items.length}
            </p>
            <p className="text-xs text-muted-foreground">
              Проіндексовано інструкцій: {search.data.indexedInstructionCount} ·{" "}
              {search.data.durationMs.toLocaleString("uk-UA")} мс
            </p>
          </div>
          {search.data.items.map((item) => (
            <SearchResultCard
              key={`${item.registryProductId}-${item.sectionKey}-${item.quote.charStart}`}
              item={item}
            />
          ))}
        </section>
      ) : (
        <Card className="border-dashed">
          <CardContent className="space-y-2 p-6 text-center">
            <BookOpenText className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="font-semibold">Прямого збігу не знайдено</p>
            <p className="text-sm text-muted-foreground">
              Це не означає, що інформації в офіційній інструкції немає.
              Спробуйте коротший термін, МНН або інший розділ.
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
