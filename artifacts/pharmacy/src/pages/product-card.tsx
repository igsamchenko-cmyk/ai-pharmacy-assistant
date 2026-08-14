import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  getGetProductCardQueryKey,
  useGetProductCard,
  type AdministrationFacts,
  type InstructionQuote,
  type ProductCard,
  type ProductCardFreshnessEntry,
} from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeDollarSign,
  BellRing,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Database,
  ExternalLink,
  GitCompare,
  Heart,
  Pill,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCompareButton } from "@/components/product-compare-button";
import { ReportIssueButton } from "@/components/report-issue-button";
import {
  recordRecentlyViewed,
  removeStaleDrugRef,
  useFavorites,
} from "@/hooks/use-favorites";
import {
  correctedQueryFromSearch,
  REGISTRY_PRODUCT_ID_PATTERN,
  registrationFromSearch,
  registryProductDetailHref,
} from "@/lib/registry-product-route";
import { nationalListVerdict } from "@/lib/national-list-status";
import { markCardOpen } from "@/lib/search-metrics";
import {
  conciseManufacturerText,
  manufacturerHeading,
} from "@/lib/manufacturer-display";
import { conciseDosageForm } from "@/pages/search";
import {
  filterInstructionSections,
  INSTRUCTION_SAFETY_COPY,
  INSTRUCTION_SECTION_LABELS,
  InstructionEssentials,
  InstructionSectionContent,
} from "@/pages/drug-instruction";
import {
  resetRegistryProductPageScroll,
  registryProductDrugRef,
} from "@/pages/registry-product-detail";

export const PRODUCT_CARD_PAGE_CLASS =
  "mx-auto w-full max-w-7xl space-y-4 overflow-x-clip pb-16 animate-in fade-in duration-300 motion-reduce:animate-none";

export const PRODUCT_CARD_HERO_CLASS =
  "relative isolate max-w-full rounded-2xl border-primary/25 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm";

export const PRODUCT_CARD_TITLE_CLASS =
  "relative z-10 block max-w-full [overflow-wrap:anywhere] text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl";

const FRESHNESS_LABELS: Record<ProductCardFreshnessEntry["key"], string> = {
  registry: "Державний реєстр ЛЗ",
  national_list: "Національний перелік",
  dispensing_category: "Категорія відпуску",
  instruction: "Офіційна інструкція",
  reimbursement: "Реімбурсація НСЗУ",
  price: "Національний каталог цін",
  interactions: "Перевірені взаємодії",
  series_restrictions: "Розпорядження Держлікслужби",
};

const FRESHNESS_STATUS: Record<
  ProductCardFreshnessEntry["status"],
  { label: string; className: string }
> = {
  current: {
    label: "Актуально",
    className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
  },
  stale: {
    label: "Потребує оновлення",
    className: "border-amber-500/50 text-amber-700 dark:text-amber-300",
  },
  incomplete: {
    label: "Неповні дані",
    className: "border-amber-500/50 text-amber-700 dark:text-amber-300",
  },
  unknown: {
    label: "Дата не визначена",
    className: "text-muted-foreground",
  },
  unavailable: {
    label: "Недоступно",
    className: "border-destructive/40 text-destructive",
  },
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "дату не вказано";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "дату не вказано"
    : new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium" }).format(date);
}

function formatMoney(value: string | null | undefined): string {
  if (!value) return "не вказано";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("uk-UA", {
        style: "currency",
        currency: "UAH",
      }).format(amount)
    : value;
}

function dispensingPresentation(card: ProductCard) {
  if (
    card.dispensing.confidence === "verified" &&
    card.dispensing.status === "prescription"
  ) {
    return {
      label: "За рецептом",
      detail:
        card.dispensing.check?.summary ?? "Підтверджено точним записом ДРЛЗ.",
      className: "border-amber-500/50 bg-amber-500/5",
      icon: ShieldAlert,
    };
  }
  if (
    card.dispensing.confidence === "verified" &&
    card.dispensing.status === "otc"
  ) {
    return {
      label: "Без рецепта",
      detail:
        card.dispensing.check?.summary ?? "Підтверджено точним записом ДРЛЗ.",
      className: "border-emerald-500/40 bg-emerald-500/5",
      icon: ShieldCheck,
    };
  }
  return null;
}

function seriesPresentation(card: ProductCard) {
  const series = card.seriesStatus;
  if (!series || series.source.freshness !== "current") return null;
  if (series.requiresSeriesCheck) {
    return {
      label: "Є розпорядження — перевірте серію",
      detail: `Пов'язаних документів: ${series.eventCount}. Це ще не означає, що конкретна серія заборонена.`,
      className: "border-destructive/45 bg-destructive/5",
      icon: BellRing,
    };
  }
  return {
    label: "Заборонних документів за номером не знайдено",
    detail:
      "Це результат поточного знімка, а не окремий дозвіл на застосування чи відпуск.",
    className: "border-emerald-500/40 bg-emerald-500/5",
    icon: CheckCircle2,
  };
}

function StatusCard({
  title,
  label,
  detail,
  className,
  icon: Icon,
  testId,
}: {
  title: string;
  label: string;
  detail: string;
  className: string;
  icon: React.ComponentType<{ className?: string }>;
  testId: string;
}) {
  return (
    <article
      className={`min-w-0 rounded-xl border p-3 ${className}`}
      data-testid={testId}
    >
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" />
        {title}
      </p>
      <p className="mt-2 break-words font-semibold">{label}</p>
      <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
        {detail}
      </p>
    </article>
  );
}

const HOSPITAL_FACTS = [
  {
    key: "reconstitution",
    title: "Відновлення / розведення",
    missing: "Прямої вказівки про відновлення в інструкції не знайдено.",
  },
  {
    key: "diluents",
    title: "Розчинники",
    missing: "Прямої вказівки про сумісний розчинник не знайдено.",
  },
  {
    key: "incompatibilities",
    title: "Несумісності",
    missing: "Прямої вказівки про несумісність не знайдено.",
  },
  {
    key: "infusionRate",
    title: "Швидкість введення",
    missing: "Прямої вказівки про швидкість введення не знайдено.",
  },
  {
    key: "stabilityAfterPrep",
    title: "Стабільність після приготування",
    missing: "Прямої вказівки про стабільність розчину не знайдено.",
  },
  {
    key: "renalAdjustment",
    title: "Корекція при порушенні функції нирок",
    missing:
      "Прямої вказівки про корекцію при порушенні функції нирок не знайдено.",
  },
  {
    key: "hepaticAdjustment",
    title: "Корекція при порушенні функції печінки",
    missing:
      "Прямої вказівки про корекцію при порушенні функції печінки не знайдено.",
  },
  {
    key: "maxDailyDose",
    title: "Максимальна добова доза",
    missing: "Прямої вказівки про максимальну добову дозу не знайдено.",
  },
] as const satisfies ReadonlyArray<{
  key: keyof AdministrationFacts;
  title: string;
  missing: string;
}>;

function quoteAnchorId(quote: InstructionQuote): string {
  return `instruction-quote-${quote.sectionKey}-${quote.charStart}-${quote.charEnd}`;
}

export function instructionQuoteFromHash(
  hash: string,
  sections: ProductCard["instruction"]["sections"],
): InstructionQuote | null {
  if (!sections) return null;
  const match = hash.match(
    /^#instruction-quote-(indications|contraindications|adverseReactions|interactions|specialWarnings|pregnancyAndLactation|administration|overdose|storage)-(\d+)-(\d+)$/u,
  );
  if (!match) return null;
  const sectionKey = match[1] as InstructionQuote["sectionKey"];
  const charStart = Number(match[2]);
  const charEnd = Number(match[3]);
  const content = sections[sectionKey];
  if (
    !content ||
    !Number.isSafeInteger(charStart) ||
    !Number.isSafeInteger(charEnd) ||
    charStart < 0 ||
    charEnd <= charStart ||
    charEnd > content.length
  ) {
    return null;
  }
  return {
    text: content.slice(charStart, charEnd),
    sectionKey,
    charStart,
    charEnd,
  };
}

function quotesForFact(
  facts: AdministrationFacts | null,
  key: keyof AdministrationFacts,
): InstructionQuote[] {
  if (!facts) return [];
  const value = facts[key];
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function revealInstructionQuote(
  event: React.MouseEvent<HTMLAnchorElement>,
  quote: InstructionQuote,
): void {
  if (typeof document === "undefined") return;
  const anchor = document.getElementById(quoteAnchorId(quote));
  if (!anchor) return;
  event.preventDefault();
  const details = anchor.closest("details");
  if (details instanceof HTMLDetailsElement) details.open = true;
  if (typeof window !== "undefined") {
    window.history.replaceState(null, "", `#${quoteAnchorId(quote)}`);
    window.requestAnimationFrame(() =>
      anchor.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  }
}

function QuoteLink({ quote }: { quote: InstructionQuote }) {
  return (
    <a
      href={`#${quoteAnchorId(quote)}`}
      onClick={(event) => revealInstructionQuote(event, quote)}
      className="inline-flex min-h-9 items-center text-xs font-semibold text-primary hover:underline"
    >
      У тексті
    </a>
  );
}

function HospitalFactCard({
  title,
  missing,
  quotes,
  attention = false,
}: {
  title: string;
  missing: string;
  quotes: InstructionQuote[];
  attention?: boolean;
}) {
  return (
    <article
      className={`min-w-0 rounded-xl border p-4 sm:p-5 ${
        attention && quotes.length
          ? "border-destructive/40 bg-destructive/5"
          : "bg-card/70"
      }`}
    >
      <h3 className="text-lg font-semibold">{title}</h3>
      {quotes.length ? (
        <div className="mt-2 space-y-3">
          {quotes.map((quote) => (
            <div
              key={`${quote.sectionKey}:${quote.charStart}:${quote.charEnd}`}
              className="border-l-2 border-primary/40 pl-4"
            >
              <p
                data-testid="hospital-fact-quote"
                className="max-w-4xl whitespace-pre-wrap break-words text-base leading-7"
              >
                {quote.text}
              </p>
              <QuoteLink quote={quote} />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {missing} Перегляньте відповідний розділ повністю.
        </p>
      )}
    </article>
  );
}

function HospitalFactsSection({
  facts,
}: {
  facts: AdministrationFacts | null;
}) {
  const visibleFacts = HOSPITAL_FACTS.map((item) => ({
    item,
    quotes: quotesForFact(facts, item.key),
  })).filter(({ quotes }) => quotes.length > 0);
  if (!visibleFacts.length) return null;
  const layout =
    visibleFacts.length === 1
      ? "single"
      : visibleFacts.length === 2
        ? "double"
        : "multiple";
  const gridClassName =
    layout === "single"
      ? "grid min-w-0 gap-3 lg:max-w-5xl"
      : layout === "double"
        ? "grid min-w-0 gap-3 lg:grid-cols-2"
        : "grid min-w-0 gap-3 md:grid-cols-2 2xl:grid-cols-3";

  return (
    <section
      className="space-y-3"
      aria-labelledby="hospital-facts-title"
      data-testid="hospital-administration-facts"
    >
      <div>
        <h2 id="hospital-facts-title" className="text-xl font-bold">
          Госпітальні факти з інструкції
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Лише дослівні цитати. Кнопка «У тексті» веде до точного фрагмента
          офіційної секції.
        </p>
      </div>
      <div className={gridClassName} data-layout={layout}>
        {visibleFacts.map(({ item, quotes }) => (
          <HospitalFactCard
            key={item.key}
            title={item.title}
            missing={item.missing}
            quotes={quotes}
            attention={item.key === "incompatibilities"}
          />
        ))}
      </div>
    </section>
  );
}

function AnchoredInstructionContent({
  content,
  quotes,
}: {
  content: string | null;
  quotes: InstructionQuote[];
}) {
  if (!content) return <InstructionSectionContent content={content} />;
  const validQuotes = [
    ...new Map(
      quotes
        .filter(
          (quote) =>
            quote.charStart >= 0 &&
            quote.charEnd <= content.length &&
            content.slice(quote.charStart, quote.charEnd) === quote.text,
        )
        .map((quote) => [`${quote.charStart}:${quote.charEnd}`, quote]),
    ).values(),
  ].sort((left, right) => left.charStart - right.charStart);
  if (!validQuotes.length) {
    return <InstructionSectionContent content={content} />;
  }

  const fragments: React.ReactNode[] = [];
  let cursor = 0;
  for (const quote of validQuotes) {
    if (quote.charStart < cursor) continue;
    if (quote.charStart > cursor) {
      fragments.push(content.slice(cursor, quote.charStart));
    }
    fragments.push(
      <mark
        key={quoteAnchorId(quote)}
        id={quoteAnchorId(quote)}
        data-char-start={quote.charStart}
        data-char-end={quote.charEnd}
        className="scroll-mt-28 rounded bg-primary/15 text-inherit ring-1 ring-primary/25"
      >
        {quote.text}
      </mark>,
    );
    cursor = quote.charEnd;
  }
  if (cursor < content.length) fragments.push(content.slice(cursor));
  return <p className="whitespace-pre-wrap break-words">{fragments}</p>;
}

function OperationalExcerpt({
  title,
  quote,
}: {
  title: string;
  quote: InstructionQuote | null;
}) {
  return (
    <article className="min-w-0 rounded-xl border bg-background/60 p-3">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Дослівна цитата з офіційної інструкції без переказу.
      </p>
      {quote ? (
        <>
          <p className="mt-3 line-clamp-6 whitespace-pre-wrap break-words text-sm leading-6">
            {quote.text}
          </p>
          <QuoteLink quote={quote} />
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Прямої структурованої вказівки поки немає — відкрийте повний офіційний
          документ.
        </p>
      )}
    </article>
  );
}

function EconomicsSection({ card }: { card: ProductCard }) {
  const nationalList = nationalListVerdict(card.economics.nationalList.status);
  const reimbursement = card.economics.reimbursement;
  const price = card.economics.price;
  const reimbursementCandidate =
    reimbursement?.selected ?? reimbursement?.candidates[0] ?? null;
  const priceCandidate = price?.selected ?? price?.candidates[0] ?? null;

  return (
    <section id="economics" className="scroll-mt-20 space-y-3">
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <BadgeDollarSign className="h-5 w-5 text-primary" />
        Переліки та ціна
      </h2>
      <div className="grid min-w-0 gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Національний перелік</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0 text-sm">
            <Badge variant={nationalList.isConfirmed ? "default" : "outline"}>
              {nationalList.shortLabel}
            </Badge>
            <p className="break-words text-muted-foreground">
              {nationalList.description}
            </p>
            <p className="text-xs text-muted-foreground">
              Перевірено: {formatDate(card.economics.nationalList.checkedAt)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">«Доступні ліки»</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0 text-sm">
            <Badge variant="outline">
              {reimbursement?.status === "listed"
                ? "У переліку"
                : reimbursement?.status === "requires_package"
                  ? "Потрібна точна упаковка"
                  : reimbursement
                    ? "Не знайдено"
                    : "Дані недоступні"}
            </Badge>
            <p className="break-words text-muted-foreground">
              {reimbursement?.summary ??
                "Перевірений знімок реімбурсації недоступний."}
            </p>
            {reimbursementCandidate ? (
              <p className="font-medium">
                Доплата: {formatMoney(reimbursementCandidate.copayUah)}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Гранична роздрібна ціна</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0 text-sm">
            <Badge variant="outline">
              {price?.status === "priced"
                ? "Ціну знайдено"
                : price?.status === "requires_package"
                  ? "Потрібна точна упаковка"
                  : price
                    ? "Не в каталозі"
                    : "Дані недоступні"}
            </Badge>
            <p className="break-words text-muted-foreground">
              {price?.summary ?? "Перевірений знімок каталогу цін недоступний."}
            </p>
            {priceCandidate ? (
              <p className="font-medium">
                Максимальна роздрібна:{" "}
                {formatMoney(priceCandidate.maximumRetailPriceUah)}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function InstructionSection({ card }: { card: ProductCard }) {
  const [query, setQuery] = useState("");
  const sections = card.instruction.sections;
  const visibleSections = useMemo(
    () => (sections ? filterInstructionSections(sections, query) : []),
    [query, sections],
  );
  const targetQuote = useMemo(
    () =>
      instructionQuoteFromHash(
        typeof window === "undefined" ? "" : window.location.hash,
        sections,
      ),
    [sections],
  );
  const instructionQuotes = useMemo(() => {
    const quotes = HOSPITAL_FACTS.flatMap((item) =>
      quotesForFact(card.instruction.administrationFacts, item.key),
    );
    if (targetQuote) quotes.push(targetQuote);
    return quotes;
  }, [card.instruction.administrationFacts, targetQuote]);
  const officialUrl =
    card.instruction.source?.url ??
    card.identity.officialInstructionDocumentUrl ??
    null;

  return (
    <section id="instruction" className="scroll-mt-20 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <BookOpenText className="h-5 w-5 text-primary" />
            Офіційна інструкція
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Дослівні структуровані розділи для цієї реєстрової позиції.
          </p>
        </div>
        {card.instruction.provenance ? (
          <Badge variant="outline">
            {card.instruction.provenance.availableSectionCount}/9 розділів ·{" "}
            {card.instruction.provenance.coveragePct}%
          </Badge>
        ) : null}
      </div>

      <Alert className="border-amber-500/50 bg-amber-500/5">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Важливо</AlertTitle>
        <AlertDescription>{INSTRUCTION_SAFETY_COPY}</AlertDescription>
      </Alert>

      {sections ? (
        <>
          <InstructionEssentials sections={sections} />
          <label className="block max-w-md">
            <span className="mb-1 block text-sm font-medium">
              Пошук у завантажених розділах
            </span>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Наприклад: кліренс, натрію хлорид"
            />
          </label>
          <div className="rounded-2xl border bg-card/70 px-4">
            {visibleSections.map(({ key, label }) => (
              <details
                key={key}
                id={`instruction-${key}`}
                className="group scroll-mt-20 border-b py-1 last:border-b-0"
                open={
                  key === "administration" || targetQuote?.sectionKey === key
                    ? true
                    : undefined
                }
              >
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 font-semibold">
                  <span className="break-words">{label}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <div className="pb-5 text-sm leading-7">
                  <AnchoredInstructionContent
                    content={sections[key]}
                    quotes={instructionQuotes.filter(
                      (quote) => quote.sectionKey === key,
                    )}
                  />
                </div>
              </details>
            ))}
            {!visibleSections.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                У структурованих розділах збігів не знайдено.
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <Alert>
          <CircleHelp className="h-4 w-4" />
          <AlertTitle>Структурованих розділів немає</AlertTitle>
          <AlertDescription>
            Це не означає відсутність показань, протипоказань або взаємодій.
          </AlertDescription>
        </Alert>
      )}

      {officialUrl ? (
        <Button asChild variant="outline">
          <a href={officialUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
            Відкрити оригінальний документ ДРЛЗ
          </a>
        </Button>
      ) : null}
    </section>
  );
}

function FreshnessSection({ entries }: { entries: ProductCard["freshness"] }) {
  return (
    <details className="group rounded-2xl border bg-card/70">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold sm:px-5">
        <span className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          Свіжість кожного джерела
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-2 border-t p-4 sm:grid-cols-2">
        {entries.map((entry) => {
          const status = FRESHNESS_STATUS[entry.status];
          return (
            <div
              key={entry.key}
              className="min-w-0 rounded-xl border bg-background/60 p-3 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{FRESHNESS_LABELS[entry.key]}</p>
                <Badge variant="outline" className={status.className}>
                  {status.label}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Перевірено: {formatDate(entry.checkedAt)}
              </p>
              {entry.sourceUrl ? (
                <a
                  href={entry.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-xs text-primary hover:underline"
                >
                  Офіційне джерело
                </a>
              ) : null}
            </div>
          );
        })}
      </div>
    </details>
  );
}

export interface ProductCardContentProps {
  card: ProductCard;
  favorite: boolean;
  onToggleFavorite: () => void;
}

export function ProductCardContent({
  card,
  favorite,
  onToggleFavorite,
}: ProductCardContentProps) {
  const product = card.identity;
  const displayForm = conciseDosageForm(product.dosageForm);
  const dispensingStatus = dispensingPresentation(card);
  const seriesStatus = seriesPresentation(card);
  const registrationActive = product.registration.status === "active";
  const hospitalFacts = card.instruction.administrationFacts;
  const reconstitutionQuote =
    hospitalFacts?.reconstitution ?? hospitalFacts?.diluents[0] ?? null;
  const incompatibilityQuote = hospitalFacts?.incompatibilities[0] ?? null;
  const hasOperationalExcerpt =
    Boolean(reconstitutionQuote) || Boolean(incompatibilityQuote);

  return (
    <main
      className={PRODUCT_CARD_PAGE_CLASS}
      data-testid={`product-card-${product.id}`}
    >
      <nav className="flex min-h-11 min-w-0 items-center gap-3 border-b pb-2">
        <Link
          href="/search?type=registry_products"
          className="flex min-w-0 items-center gap-2 text-sm font-semibold text-primary"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span>До пошуку</span>
        </Link>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
          {product.registration.number}
        </span>
      </nav>

      <Card className={PRODUCT_CARD_HERO_CLASS}>
        <CardContent className="min-w-0 space-y-5 p-4 sm:p-6">
          <header className="flex min-w-0 items-start gap-3">
            <div className="relative z-10 shrink-0 rounded-xl bg-primary/10 p-2.5">
              <Pill className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h1
                  className={PRODUCT_CARD_TITLE_CLASS}
                  data-testid="product-card-title"
                >
                  {product.tradeName}
                </h1>
                <Badge
                  variant={registrationActive ? "default" : "destructive"}
                  className="shrink-0 whitespace-normal"
                  data-testid="product-registration-status"
                >
                  {registrationActive
                    ? "Реєстрація чинна"
                    : product.registration.status === "terminated"
                      ? "Реєстрацію завершено"
                      : "Статус реєстрації не визначено"}
                </Badge>
              </div>
              <p className="mt-2 break-words text-base text-muted-foreground">
                <span className="font-medium text-foreground">
                  МНН / склад:
                </span>{" "}
                {product.inn || product.activeIngredient || "Не зазначено"}
              </p>
              <Button
                asChild
                size="lg"
                className="mt-3 min-h-12 w-full whitespace-normal shadow-md ring-2 ring-primary/20 sm:w-auto"
              >
                <a
                  href="#instruction"
                  data-testid="product-card-instruction-quick-action"
                >
                  <BookOpenText className="h-5 w-5 shrink-0" />
                  Відкрити інструкцію
                </a>
              </Button>
            </div>
          </header>

          <div className="flex min-w-0 flex-wrap gap-2">
            {product.strength ? (
              <Badge className="max-w-full whitespace-normal px-3 py-1 text-sm">
                {product.strength}
              </Badge>
            ) : null}
            <Badge
              variant="secondary"
              className="max-w-full whitespace-normal px-3 py-1 text-sm"
            >
              {displayForm}
            </Badge>
          </div>

          <dl className="grid min-w-0 gap-3 rounded-xl border bg-background/60 p-3 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {manufacturerHeading(product.manufacturers)}
              </dt>
              <dd className="mt-1 break-words font-medium">
                {conciseManufacturerText(product.manufacturers)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Реєстраційний номер
              </dt>
              <dd className="mt-1 break-words font-medium">
                {product.registration.number}
              </dd>
            </div>
          </dl>

          {dispensingStatus || seriesStatus ? (
            <section
              className={`grid min-w-0 gap-3 ${
                dispensingStatus && seriesStatus
                  ? "sm:grid-cols-2"
                  : "max-w-4xl"
              }`}
              data-testid="product-card-key-statuses"
            >
              {dispensingStatus ? (
                <StatusCard
                  title="Категорія відпуску"
                  {...dispensingStatus}
                  testId="product-card-dispensing-status"
                />
              ) : null}
              {seriesStatus ? (
                <StatusCard
                  title="Заборони серій"
                  {...seriesStatus}
                  testId="product-card-series-status"
                />
              ) : null}
            </section>
          ) : null}

          {hasOperationalExcerpt ? (
            <section className="grid min-w-0 gap-3 lg:grid-cols-2">
              {reconstitutionQuote ? (
                <OperationalExcerpt
                  title="Відновлення / розчинник"
                  quote={reconstitutionQuote}
                />
              ) : null}
              {incompatibilityQuote ? (
                <OperationalExcerpt
                  title="Взаємодії та несумісність"
                  quote={incompatibilityQuote}
                />
              ) : null}
            </section>
          ) : null}

          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
            <Button
              asChild
              variant="outline"
              className="min-h-11 min-w-0 whitespace-normal"
            >
              <Link href="/interactions">
                <GitCompare className="h-4 w-4 shrink-0" />
                Взаємодії
              </Link>
            </Button>
            <ProductCompareButton
              product={product}
              conciseForm={displayForm}
              className="min-h-11 min-w-0 whitespace-normal"
            />
            <Button
              type="button"
              variant="outline"
              className="col-span-2 min-h-11 min-w-0 whitespace-normal sm:col-span-1"
              onClick={onToggleFavorite}
              aria-pressed={favorite}
            >
              <Heart
                className={
                  favorite ? "h-4 w-4 fill-primary text-primary" : "h-4 w-4"
                }
              />
              {favorite ? "В обраному" : "В обране"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <HospitalFactsSection facts={hospitalFacts} />

      {!registrationActive ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Реєстрація не підтверджена як чинна</AlertTitle>
          <AlertDescription>
            Не використовуйте картку як позитивний висновок про можливість
            обігу.
          </AlertDescription>
        </Alert>
      ) : null}

      <EconomicsSection card={card} />
      <InstructionSection card={card} />
      <FreshnessSection entries={card.freshness} />

      <ReportIssueButton
        type="safety_issue"
        context={`product-card:${product.id}:${product.registration.number}`}
        sourceSnapshot={{
          productId: product.id,
          registrationNumber: product.registration.number,
          warnings: card.warnings,
          freshness: card.freshness,
        }}
      />
    </main>
  );
}

function ProductCardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 overflow-x-hidden pb-16">
      <Skeleton className="h-10 w-32" />
      <Card className="rounded-2xl">
        <CardContent className="space-y-5 p-4 sm:p-6">
          <Skeleton className="h-12 w-4/5" />
          <Skeleton className="h-6 w-2/3" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProductCardError({ invalid = false }: { invalid?: boolean }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-12 text-center" role="alert">
      <Pill className="mx-auto h-10 w-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">
        {invalid ? "Некоректне посилання на препарат" : "Картку не завантажено"}
      </h1>
      <p className="text-sm text-muted-foreground">
        Поверніться до пошуку та відкрийте точну реєстрову позицію ще раз.
      </p>
      <Button asChild variant="outline">
        <Link href="/search?type=registry_products">
          <ArrowLeft className="h-4 w-4" />
          До пошуку
        </Link>
      </Button>
    </div>
  );
}

export default function ProductCardPage() {
  const { productId = "" } = useParams<{ productId: string }>();
  const validProductId = REGISTRY_PRODUCT_ID_PATTERN.test(productId);
  const { isFavorite, toggleFavorite } = useFavorites();

  useLayoutEffect(() => {
    resetRegistryProductPageScroll(window);
  }, [productId]);

  const cardQuery = useGetProductCard(productId, {
    query: {
      enabled: validProductId,
      queryKey: getGetProductCardQueryKey(productId),
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });
  const product = cardQuery.data?.identity;
  const correctedQuery = correctedQueryFromSearch(
    typeof window === "undefined" ? "" : window.location.search,
  );

  useEffect(() => {
    if (!product) return;
    recordRecentlyViewed(registryProductDrugRef(product));
    markCardOpen(product.id);
  }, [product]);

  useEffect(() => {
    if (!cardQuery.data) return;
    const legacyInstructionRoute =
      typeof window !== "undefined" &&
      window.location.pathname.includes("/instructions/");
    const targetId = legacyInstructionRoute
      ? "instruction"
      : typeof window !== "undefined"
        ? window.location.hash.replace(/^#/u, "")
        : "";
    if (!targetId) return;
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: "start" });
    });
  }, [cardQuery.data]);

  useEffect(() => {
    if (
      !validProductId ||
      cardQuery.isLoading ||
      cardQuery.isError ||
      product
    ) {
      return;
    }
    const registration = registrationFromSearch(
      typeof window === "undefined" ? "" : window.location.search,
    );
    removeStaleDrugRef(
      productId,
      registration
        ? registryProductDetailHref({
            id: productId,
            registration: { number: registration },
          })
        : `/products/${encodeURIComponent(productId)}`,
    );
  }, [
    cardQuery.isError,
    cardQuery.isLoading,
    product,
    productId,
    validProductId,
  ]);

  if (!validProductId) return <ProductCardError invalid />;
  if (cardQuery.isLoading) return <ProductCardSkeleton />;
  if (cardQuery.isError || !cardQuery.data || !product) {
    return (
      <div className="space-y-4">
        <ProductCardError />
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => void cardQuery.refetch()}
          >
            <RefreshCw className="h-4 w-4" />
            Спробувати ще раз
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {correctedQuery ? (
        <Alert className="border-primary/30 bg-primary/5">
          <Search className="h-4 w-4" />
          <AlertTitle>Пошуковий запит було виправлено</AlertTitle>
          <AlertDescription>
            Знайдено за виправленим запитом: “{correctedQuery}”. Перевірте
            торгову назву, форму, дозування і реєстраційний номер.
          </AlertDescription>
        </Alert>
      ) : null}
      <ProductCardContent
        card={cardQuery.data}
        favorite={isFavorite(product.id)}
        onToggleFavorite={() => toggleFavorite(registryProductDrugRef(product))}
      />
    </div>
  );
}
