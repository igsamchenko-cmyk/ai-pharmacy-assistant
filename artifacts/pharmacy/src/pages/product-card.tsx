import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  getCheckProductSeriesRestrictionsQueryKey,
  getGetProductCardQueryKey,
  useCheckProductSeriesRestrictions,
  useGetProductCard,
  type AdministrationFacts,
  type InstructionQuote,
  type ProductCard,
  type ProductCardFreshnessEntry,
  type ProductSeriesRestrictionSummary,
  type SeriesRestrictionCheck,
  type SeriesRestrictionCheckStatus,
} from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeDollarSign,
  Ban,
  BellRing,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Database,
  EllipsisVertical,
  ExternalLink,
  GitCompare,
  Heart,
  LoaderCircle,
  Pill,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  WifiOff,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
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
import { markCardOpen, markSectionOpen } from "@/lib/search-metrics";
import { useCatalogClientIndex } from "@/lib/catalog-client-index";
import {
  catalogProductToPreliminaryIdentity,
  selectProductCardPresentation,
} from "@/lib/product-card-preliminary";
import {
  cacheOfflineProductIdentity,
  readOfflineProductIdentity,
  type OfflineProductIdentity,
} from "@/lib/offline-product-card";
import {
  getInstructionCacheStore,
  readCachedInstruction,
  writeInstructionCache,
  type InstructionCacheRecord,
} from "@/lib/instruction-cache";
import {
  conciseManufacturerText,
  manufacturerHeading,
} from "@/lib/manufacturer-display";
import { conciseDosageForm } from "@/pages/search";
import { useInteractionCart } from "@/lib/interaction-cart";
import {
  instructionSectionShareUrl,
  productCardTabFromSearch,
  productCardTabTarget,
  type ProductCardTab,
} from "@/lib/navigation-v3";
import {
  buildHighlightFragments,
  findMatchElementId,
  findTextMatches,
  flattenSectionMatches,
  type ContentMark,
  type FlatMatch,
  type SectionMatchGroup,
  type TextMatch,
} from "@/lib/instruction-find";
import {
  normalizeSeriesQuery,
  seriesCheckStatusLabel,
  seriesOverviewPresentation,
  SERIES_EVENT_TYPE_LABELS,
  SERIES_INPUT_MAX_LENGTH,
} from "@/lib/series-restriction-check";
import {
  INSTRUCTION_FONT_SIZE_BUTTON_CLASS,
  INSTRUCTION_FONT_SIZE_CLASS,
  INSTRUCTION_FONT_SIZE_STEPS,
  readInstructionFontSize,
  writeInstructionFontSize,
  type InstructionFontSizeStep,
} from "@/lib/instruction-font-size";
import { toast } from "@/hooks/use-toast";
import { pharmacovigilanceHref } from "@/lib/pharmacovigilance-draft";
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

const ProductAnalogsTab = React.lazy(() =>
  import("@/components/analogs-tab").then((module) => ({
    default: module.ProductAnalogsTab,
  })),
);

const ProductAiSummary = React.lazy(() =>
  import("@/components/ai-reference-panel").then((module) => ({
    default: module.ProductAiSummary,
  })),
);

const PRODUCT_CARD_TABS: ReadonlyArray<{
  id: ProductCardTab;
  label: string;
}> = [
  { id: "profile", label: "Профіль" },
  { id: "analogs", label: "Аналоги" },
  { id: "instruction", label: "Інструкція" },
];

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

function seriesOverviewFromCard(
  card: ProductCard,
): ProductSeriesRestrictionSummary | null {
  const series = card.seriesStatus;
  if (!series || series.source.freshness !== "current") return null;
  return series;
}

const SERIES_OVERVIEW_TONE_PRESENTATION: Record<
  ReturnType<typeof seriesOverviewPresentation>["tone"],
  { className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  blocked: { className: "border-destructive/60 bg-destructive/10", icon: Ban },
  caution: {
    className: "border-destructive/45 bg-destructive/5",
    icon: BellRing,
  },
  clear: {
    className: "border-emerald-500/40 bg-emerald-500/5",
    icon: CheckCircle2,
  },
};

function seriesStatusCardProps(series: ProductSeriesRestrictionSummary) {
  const presentation = seriesOverviewPresentation(series);
  const tone = SERIES_OVERVIEW_TONE_PRESENTATION[presentation.tone];
  return {
    label: presentation.label,
    detail: presentation.detail,
    className: tone.className,
    icon: tone.icon,
  };
}

const SERIES_CHECK_STATUS_STYLE: Record<
  SeriesRestrictionCheckStatus,
  { className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  blocked: {
    className: "border-destructive/60 bg-destructive/10 text-destructive",
    icon: Ban,
  },
  needs_review: {
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
    icon: AlertTriangle,
  },
  restored: {
    className:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    icon: RotateCcw,
  },
  no_match: {
    className: "border-border bg-muted/40 text-muted-foreground",
    icon: CircleHelp,
  },
};

function SeriesCheckResult({ result }: { result: SeriesRestrictionCheck }) {
  const style = SERIES_CHECK_STATUS_STYLE[result.status];
  const StatusIcon = style.icon;
  return (
    <div
      className={`rounded-xl border p-3 ${style.className}`}
      data-testid="series-check-status"
    >
      <p className="flex items-center gap-2 font-semibold">
        <StatusIcon className="h-4 w-4 shrink-0" />
        {seriesCheckStatusLabel(result.status)}
      </p>
      <p className="mt-1 text-sm">{result.summary}</p>
      {result.events.length ? (
        <ul className="mt-3 space-y-2 border-t border-current/10 pt-3">
          {result.events.map((event) => (
            <li
              key={`${event.documentNumber}-${event.documentDate}`}
              className="text-xs"
            >
              <span className="font-medium">
                {SERIES_EVENT_TYPE_LABELS[event.eventType]}
              </span>{" "}
              · № {event.documentNumber} від {formatDate(event.documentDate)}
              {event.additionalInfo ? (
                <span className="block text-muted-foreground">
                  {event.additionalInfo}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <a
        href={result.source.url}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium hover:underline"
      >
        Відкрити офіційний реєстр
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function SeriesCheckPanel({
  productId,
  registrationNumber,
  overview,
}: {
  productId: string;
  registrationNumber: string;
  overview: ProductSeriesRestrictionSummary;
}) {
  const [seriesInput, setSeriesInput] = useState("");
  const [submittedSeries, setSubmittedSeries] = useState<string | null>(null);
  const trimmedInput = normalizeSeriesQuery(seriesInput);
  const seriesCheckParams = {
    productId,
    registrationNumber,
    series: submittedSeries ?? "",
  };
  const check = useCheckProductSeriesRestrictions(seriesCheckParams, {
    query: {
      queryKey: getCheckProductSeriesRestrictionsQueryKey(seriesCheckParams),
      enabled: Boolean(submittedSeries),
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedInput) return;
    setSubmittedSeries(trimmedInput);
  };

  return (
    <Card data-testid="series-check-panel">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="h-4 w-4 text-primary" />
          Перевірка серії
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {overview.allSeriesAffected ? (
          <p className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
            Чинна заборона поширюється на всі серії цього реєстраційного
            посвідчення.
          </p>
        ) : overview.restrictedSeries.length ? (
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <p className="font-medium text-foreground">
              Названі в документах серії
            </p>
            <p className="mt-1 break-words text-muted-foreground">
              {overview.restrictedSeries.join(", ")}
            </p>
          </div>
        ) : null}
        {overview.unspecifiedSeriesAffected ? (
          <p className="text-xs text-muted-foreground">
            Є документ без зазначеної серії — перевірку варто зробити навіть за
            відсутності точного збігу нижче.
          </p>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Серія з упаковки
            </span>
            <Input
              value={seriesInput}
              onChange={(event) => setSeriesInput(event.target.value)}
              maxLength={SERIES_INPUT_MAX_LENGTH}
              placeholder="Напр. AB-1234"
              data-testid="series-input"
            />
          </label>
          <Button
            type="submit"
            disabled={!trimmedInput || check.isFetching}
            data-testid="series-check-submit"
          >
            {check.isFetching ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Перевірити
          </Button>
        </form>

        {submittedSeries ? (
          <div data-testid="series-check-result">
            {check.isLoading ? (
              <p className="text-sm text-muted-foreground">
                Перевіряємо офіційний знімок Держлікслужби…
              </p>
            ) : check.isError ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                Перевірку не вдалося виконати. Не робіть висновок про
                відсутність заборони.
              </p>
            ) : check.data ? (
              <SeriesCheckResult result={check.data} />
            ) : null}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Відсутність збігу за серією не є дозволом на відпуск чи застосування.{" "}
          <Link
            href={`/regulatory-radar?q=${encodeURIComponent(registrationNumber)}`}
            className="font-medium text-primary hover:underline"
          >
            Повний журнал розпоряджень
          </Link>
        </p>
      </CardContent>
    </Card>
  );
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

const INSTRUCTION_SECTION_HASH_PATTERN =
  /^#instruction-(indications|contraindications|adverseReactions|interactions|specialWarnings|pregnancyAndLactation|administration|overdose|storage)$/u;

/**
 * Parses a plain section anchor (PR-H, H.1: `#instruction-{key}`, as opposed
 * to the more specific `#instruction-quote-{key}-{start}-{end}` format
 * handled by `instructionQuoteFromHash`). Used both for landing from a
 * search result carrying a `sectionIntent` (H.2.3) and for the section
 * chips' own scroll-to links (H.1.2).
 */
export function instructionSectionKeyFromHash(
  hash: string,
): InstructionQuote["sectionKey"] | null {
  const match = hash.match(INSTRUCTION_SECTION_HASH_PATTERN);
  return match ? (match[1] as InstructionQuote["sectionKey"]) : null;
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

const FIND_MATCH_MARK_CLASS =
  "scroll-mt-28 rounded bg-amber-300/60 text-inherit ring-1 ring-amber-500/40";
const FIND_ACTIVE_MATCH_MARK_CLASS =
  "scroll-mt-28 rounded bg-amber-400/80 text-inherit ring-2 ring-amber-600";

/**
 * Renders one instruction section's content with two independent kinds of
 * highlight merged into a single pass (PR-H exact-quote anchors plus PR-I,
 * I.1 "Знайти в тексті" matches): `buildHighlightFragments`
 * (`lib/instruction-find.ts`) dedupes and sorts both mark kinds by
 * character range and slices the text around them.
 */
function AnchoredInstructionContent({
  content,
  quotes,
  sectionKey,
  findMatches = [],
  activeFindMatchIndex = null,
}: {
  content: string | null;
  quotes: InstructionQuote[];
  sectionKey?: InstructionQuote["sectionKey"];
  findMatches?: TextMatch[];
  activeFindMatchIndex?: number | null;
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
  ];

  const marks: ContentMark[] = [
    ...validQuotes.map((quote) => ({
      id: quoteAnchorId(quote),
      start: quote.charStart,
      end: quote.charEnd,
      className:
        "scroll-mt-28 rounded bg-primary/15 text-inherit ring-1 ring-primary/25",
      dataset: {
        charStart: String(quote.charStart),
        charEnd: String(quote.charEnd),
      },
    })),
    ...findMatches.map((match, index) => ({
      id: sectionKey
        ? findMatchElementId(sectionKey, index)
        : `instruction-find-match-${index}`,
      start: match.start,
      end: match.end,
      className:
        index === activeFindMatchIndex
          ? FIND_ACTIVE_MATCH_MARK_CLASS
          : FIND_MATCH_MARK_CLASS,
    })),
  ];

  if (!marks.length) return <InstructionSectionContent content={content} />;

  const fragments = buildHighlightFragments(content, marks);
  return (
    <p className="whitespace-pre-wrap break-words">
      {fragments.map((fragment, index) =>
        fragment.mark ? (
          <mark
            key={fragment.mark.id}
            id={fragment.mark.id}
            data-char-start={fragment.mark.dataset?.charStart}
            data-char-end={fragment.mark.dataset?.charEnd}
            className={fragment.mark.className}
          >
            {fragment.text}
          </mark>
        ) : (
          <React.Fragment key={index}>{fragment.text}</React.Fragment>
        ),
      )}
    </p>
  );
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

function InstructionTrustBadge({
  documentDate,
  registrationNumber,
  coveragePct,
}: {
  documentDate: string | null | undefined;
  registrationNumber: string;
  coveragePct: number | null | undefined;
}) {
  const isPartial = typeof coveragePct === "number" && coveragePct < 100;
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
      data-testid="instruction-trust-badge"
    >
      <span>
        Офіційна редакція від {formatDate(documentDate)} · РП{" "}
        {registrationNumber} · джерело ДРЛЗ
      </span>
      {isPartial ? (
        <Badge
          variant="outline"
          className="border-amber-500/50 text-amber-700 dark:text-amber-300"
          data-testid="instruction-partial-badge"
        >
          Розпізнано частково — повний текст за посиланням
        </Badge>
      ) : null}
    </div>
  );
}

/**
 * Fixed-order quick-jump chips for the Instruction tab (PR-H, H.1.2).
 *
 * The spec's original 7-chip order was "Показання · Дози · Протипоказання
 * · Вагітність · Діти · Взаємодії · Побічні" against a 19-key section
 * model. This repository's reconciled 9-key model (PR-G) has no "children"
 * section at all, so "Діти" is intentionally dropped here -- there is
 * nothing for that chip to scroll to. The remaining 6 map onto existing
 * keys in the spec's original relative order.
 */
const INSTRUCTION_SECTION_CHIPS: ReadonlyArray<{
  key: (typeof INSTRUCTION_SECTION_LABELS)[number]["key"];
  label: string;
}> = [
  { key: "indications", label: "Показання" },
  { key: "administration", label: "Дози" },
  { key: "contraindications", label: "Протипоказання" },
  { key: "pregnancyAndLactation", label: "Вагітність" },
  { key: "interactions", label: "Взаємодії" },
  { key: "adverseReactions", label: "Побічні" },
];

function InstructionSectionChips({
  sections,
  onSelect,
}: {
  sections: ProductCard["instruction"]["sections"];
  onSelect: (key: InstructionQuote["sectionKey"]) => void;
}) {
  if (!sections) return null;
  const chips = INSTRUCTION_SECTION_CHIPS.filter(({ key }) => sections[key]);
  if (!chips.length) return null;
  return (
    <div
      className="flex flex-wrap gap-2"
      role="list"
      data-testid="instruction-section-chips"
    >
      {chips.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="listitem"
          onClick={() => onSelect(key)}
          className="min-h-9 rounded-full border bg-background px-3 py-1 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          data-testid={`instruction-section-chip-${key}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const FONT_SIZE_STEP_LABEL: Record<InstructionFontSizeStep, string> = {
  sm: "Дрібний текст",
  md: "Звичайний текст",
  lg: "Великий текст",
};

/** PR-I, I.2: 3-step reading font size for the structured sections,
 * persisted per-browser (`lib/instruction-font-size.ts`). */
function InstructionFontSizeControl({
  step,
  onSelect,
}: {
  step: InstructionFontSizeStep;
  onSelect: (step: InstructionFontSizeStep) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border bg-background p-1"
      role="group"
      aria-label="Розмір тексту інструкції"
      data-testid="instruction-font-size-control"
    >
      {INSTRUCTION_FONT_SIZE_STEPS.map((candidate) => (
        <button
          key={candidate}
          type="button"
          onClick={() => onSelect(candidate)}
          aria-pressed={step === candidate}
          aria-label={FONT_SIZE_STEP_LABEL[candidate]}
          data-testid={`instruction-font-size-${candidate}`}
          className={`min-h-9 min-w-9 rounded-full px-2 font-semibold transition-colors ${INSTRUCTION_FONT_SIZE_BUTTON_CLASS[candidate]} ${
            step === candidate
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent"
          }`}
        >
          А
        </button>
      ))}
    </div>
  );
}

/** PR-I, I.2: "Поділитися розділом" -- copies the absolute
 * `?tab=instruction#instruction-{key}` link for one section to the
 * clipboard. Never sends the instruction text itself anywhere, only the
 * link the recipient would open in their own browser. */
function ShareSectionButton({
  productId,
  sectionKey,
}: {
  productId: string;
  sectionKey: InstructionQuote["sectionKey"];
}) {
  const handleShare = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof window === "undefined") return;
    const url = instructionSectionShareUrl(
      window.location.origin,
      productId,
      window.location.search,
      sectionKey,
    );
    try {
      await window.navigator.clipboard.writeText(url);
      toast({ title: "Посилання на розділ скопійовано" });
    } catch {
      toast({
        title: "Не вдалося скопіювати посилання",
        description: url,
      });
    }
  };
  return (
    <button
      type="button"
      onClick={(event) => void handleShare(event)}
      className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label="Поділитися розділом"
      data-testid={`instruction-section-share-${sectionKey}`}
    >
      <Share2 className="h-4 w-4" />
    </button>
  );
}

function InstructionSection({ card }: { card: ProductCard }) {
  const [findQuery, setFindQuery] = useState("");
  const [activeMatchGlobalIndex, setActiveMatchGlobalIndex] = useState(0);
  const [fontSize, setFontSize] = useState<InstructionFontSizeStep>(() =>
    readInstructionFontSize(),
  );
  const sections = card.instruction.sections;
  const visibleSections = useMemo(
    () => (sections ? filterInstructionSections(sections, findQuery) : []),
    [findQuery, sections],
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
  const [highlightedSection, setHighlightedSection] = useState<
    InstructionQuote["sectionKey"] | null
  >(null);
  const sectionLandingHandledRef = useRef(false);

  // PR-I, I.1: cross-section "Знайти в тексті" matches for the current
  // find query, computed against the already-loaded structured sections --
  // never a network call. Sections with zero matches are naturally absent
  // from `sectionMatchGroups`, so they neither auto-open nor render marks.
  const sectionMatchGroups: SectionMatchGroup[] = useMemo(() => {
    if (!sections || !findQuery.trim()) return [];
    return INSTRUCTION_SECTION_LABELS.map(({ key }) => ({
      sectionKey: key,
      matches: findTextMatches(sections[key] ?? "", findQuery),
    })).filter((group) => group.matches.length > 0);
  }, [findQuery, sections]);
  const flatMatches: FlatMatch[] = useMemo(
    () => flattenSectionMatches(sectionMatchGroups),
    [sectionMatchGroups],
  );
  const totalMatches = flatMatches.length;
  const activeMatch = totalMatches
    ? flatMatches[
        ((activeMatchGlobalIndex % totalMatches) + totalMatches) % totalMatches
      ]
    : null;

  useEffect(() => {
    setActiveMatchGlobalIndex(0);
  }, [findQuery]);

  useEffect(() => {
    if (!activeMatch || typeof document === "undefined") return;
    const details = document.getElementById(
      `instruction-${activeMatch.sectionKey}`,
    );
    if (details instanceof HTMLDetailsElement) details.open = true;
    const elementId = findMatchElementId(
      activeMatch.sectionKey,
      activeMatch.matchIndexInSection,
    );
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      document
        .getElementById(elementId)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [activeMatch]);

  const goToMatch = (direction: 1 | -1) => {
    if (!totalMatches) return;
    setActiveMatchGlobalIndex(
      (current) =>
        (((current + direction) % totalMatches) + totalMatches) % totalMatches,
    );
  };

  const handleFontSizeSelect = (step: InstructionFontSizeStep) => {
    setFontSize(step);
    writeInstructionFontSize(step);
  };

  useEffect(() => {
    if (!card.instruction.available) return;
    void writeInstructionCache(
      getInstructionCacheStore(),
      card.identity.id,
      card.instruction,
      {
        productTradeName: card.identity.tradeName,
        registrationNumber: card.identity.registration.number,
      },
    );
  }, [card.instruction, card.identity]);

  // PR-I, I.3: "time to section" -- the administration section is always
  // open by default (see the `<details open>` condition below), so the
  // moment sections are available on the Instruction tab is the moment a
  // section actually becomes visible to the pharmacist. `markSectionOpen`
  // is idempotent (search-metrics.ts only records the first call), so this
  // safely coexists with the explicit chip/anchor calls below without
  // double-counting.
  useEffect(() => {
    if (sections) markSectionOpen("administration");
  }, [sections]);

  // PR-H, H.1.1/H.2.3: a plain `#instruction-{key}` hash (from a chip click
  // via history.replaceState, or from a search result carrying a
  // sectionIntent) opens and highlights that section for 2 seconds. If the
  // requested section isn't present in this instruction -- or the
  // instruction has no structured sections at all -- a non-intrusive toast
  // says so instead of landing on a silent no-op (H.2.3).
  useEffect(() => {
    if (sectionLandingHandledRef.current) return;
    if (typeof window === "undefined") return;
    const sectionKey = instructionSectionKeyFromHash(window.location.hash);
    if (!sectionKey) return;
    sectionLandingHandledRef.current = true;
    if (sections?.[sectionKey]) {
      setHighlightedSection(sectionKey);
      markSectionOpen(sectionKey);
      const timer = window.setTimeout(() => setHighlightedSection(null), 2000);
      return () => window.clearTimeout(timer);
    }
    toast({
      title: "Розділ у розпарсеній інструкції відсутній",
      description:
        "Перегляньте офіційний документ повністю за посиланням нижче.",
    });
    return undefined;
  }, [sections]);

  const handleSectionChipSelect = (
    sectionKey: InstructionQuote["sectionKey"],
  ) => {
    if (typeof document !== "undefined") {
      const details = document.getElementById(`instruction-${sectionKey}`);
      if (details instanceof HTMLDetailsElement) details.open = true;
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `#instruction-${sectionKey}`);
        window.requestAnimationFrame(() =>
          details?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      }
    }
    setHighlightedSection(sectionKey);
    markSectionOpen(sectionKey);
    if (typeof window !== "undefined") {
      window.setTimeout(() => setHighlightedSection(null), 2000);
    }
  };

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
        <div className="flex flex-wrap items-center gap-2">
          {sections ? (
            <InstructionFontSizeControl
              step={fontSize}
              onSelect={handleFontSizeSelect}
            />
          ) : null}
          {card.instruction.provenance ? (
            <Badge variant="outline">
              {card.instruction.provenance.availableSectionCount}/9 розділів ·{" "}
              {card.instruction.provenance.coveragePct}%
            </Badge>
          ) : null}
        </div>
      </div>

      {card.instruction.source ? (
        <InstructionTrustBadge
          documentDate={card.instruction.source.documentDate}
          registrationNumber={card.identity.registration.number}
          coveragePct={card.instruction.provenance?.coveragePct}
        />
      ) : null}

      <Alert className="border-amber-500/50 bg-amber-500/5">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Важливо</AlertTitle>
        <AlertDescription>{INSTRUCTION_SAFETY_COPY}</AlertDescription>
      </Alert>

      {sections ? (
        <>
          <InstructionEssentials sections={sections} />
          <div className="max-w-md space-y-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">
                Знайти в тексті
              </span>
              <div className="flex items-center gap-2">
                <Input
                  value={findQuery}
                  onChange={(event) => setFindQuery(event.target.value)}
                  placeholder="Наприклад: кліренс, натрію хлорид"
                  data-testid="instruction-find-input"
                />
                {findQuery.trim() ? (
                  <div
                    className="flex shrink-0 items-center gap-1"
                    data-testid="instruction-find-nav"
                  >
                    <span
                      className="whitespace-nowrap text-xs text-muted-foreground"
                      data-testid="instruction-find-counter"
                    >
                      {totalMatches
                        ? `${(((activeMatchGlobalIndex % totalMatches) + totalMatches) % totalMatches) + 1}/${totalMatches}`
                        : "0/0"}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => goToMatch(-1)}
                      disabled={!totalMatches}
                      aria-label="Попередній збіг"
                      data-testid="instruction-find-prev"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => goToMatch(1)}
                      disabled={!totalMatches}
                      aria-label="Наступний збіг"
                      data-testid="instruction-find-next"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </label>
          </div>
          <InstructionSectionChips
            sections={sections}
            onSelect={handleSectionChipSelect}
          />
          <div className="rounded-2xl border bg-card/70 px-4">
            {visibleSections.map(({ key, label }) => {
              const matchGroup = sectionMatchGroups.find(
                (group) => group.sectionKey === key,
              );
              const activeMatchIndexInSection =
                activeMatch?.sectionKey === key
                  ? activeMatch.matchIndexInSection
                  : null;
              return (
                <details
                  key={key}
                  id={`instruction-${key}`}
                  className="group scroll-mt-20 border-b py-1 last:border-b-0"
                  open={
                    key === "administration" ||
                    targetQuote?.sectionKey === key ||
                    highlightedSection === key ||
                    Boolean(matchGroup)
                      ? true
                      : undefined
                  }
                >
                  <summary
                    className={`flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 font-semibold transition-colors ${
                      highlightedSection === key
                        ? "rounded-lg bg-primary/10 ring-2 ring-primary/40"
                        : ""
                    }`}
                  >
                    <span className="break-words">{label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <ShareSectionButton
                        productId={card.identity.id}
                        sectionKey={key}
                      />
                      <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                    </span>
                  </summary>
                  <div
                    className={`pb-5 ${INSTRUCTION_FONT_SIZE_CLASS[fontSize]}`}
                  >
                    <AnchoredInstructionContent
                      content={sections[key]}
                      quotes={instructionQuotes.filter(
                        (quote) => quote.sectionKey === key,
                      )}
                      sectionKey={key}
                      findMatches={matchGroup?.matches ?? []}
                      activeFindMatchIndex={activeMatchIndexInSection}
                    />
                  </div>
                </details>
              );
            })}
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

      <div className="flex flex-wrap gap-2">
        {officialUrl ? (
          <Button asChild variant="outline">
            <a href={officialUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Відкрити оригінальний документ ДРЛЗ
            </a>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href="/instruction-search">
            <Search className="h-4 w-4" />
            Шукати в інструкціях
          </Link>
        </Button>
      </div>
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
  activeTab?: ProductCardTab;
  onTabChange?: (tab: ProductCardTab) => void;
}

export function ProductCardContent({
  card,
  favorite,
  onToggleFavorite,
  activeTab = "profile",
  onTabChange = () => undefined,
}: ProductCardContentProps) {
  const [aiOpen, setAiOpen] = useState(false);
  const interactionCart = useInteractionCart();
  const product = card.identity;
  const displayForm = conciseDosageForm(product.dosageForm);
  const dispensingStatus = dispensingPresentation(card);
  const seriesOverview = seriesOverviewFromCard(card);
  const seriesStatus = seriesOverview
    ? seriesStatusCardProps(seriesOverview)
    : null;
  const registrationActive = product.registration.status === "active";
  const hospitalFacts = card.instruction.administrationFacts;
  const reconstitutionQuote =
    hospitalFacts?.reconstitution ?? hospitalFacts?.diluents[0] ?? null;
  const incompatibilityQuote = hospitalFacts?.incompatibilities[0] ?? null;
  const hasOperationalExcerpt =
    Boolean(reconstitutionQuote) || Boolean(incompatibilityQuote);
  const productInInteractionCart = interactionCart.isInCart(product.id);
  const interactionCartItem = {
    drugId: product.id,
    name: product.tradeName,
    inn: product.inn || product.activeIngredient || "",
    registration: product.registration.number,
    form: displayForm,
    ...(product.strength ? { strength: product.strength } : {}),
  };

  return (
    <main
      className={PRODUCT_CARD_PAGE_CLASS}
      data-testid={`product-card-${product.id}`}
    >
      <nav className="flex min-h-11 min-w-0 items-center gap-3 border-b pb-2">
        <Link
          href="/?type=registry_products"
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
                type="button"
                size="lg"
                className="mt-3 min-h-12 w-full whitespace-normal shadow-md ring-2 ring-primary/20 sm:w-auto"
                onClick={() => onTabChange("instruction")}
                data-testid="product-card-instruction-quick-action"
              >
                <BookOpenText className="h-5 w-5 shrink-0" />
                Відкрити інструкцію
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

          {seriesOverview ? (
            <SeriesCheckPanel
              productId={product.id}
              registrationNumber={product.registration.number}
              overview={seriesOverview}
            />
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
              type="button"
              variant={productInInteractionCart ? "secondary" : "outline"}
              className="min-h-11 min-w-0 whitespace-normal"
              onClick={() => interactionCart.toggle(interactionCartItem)}
              disabled={interactionCart.isFull && !productInInteractionCart}
              aria-pressed={productInInteractionCart}
              data-testid="product-card-interaction-toggle"
            >
              <GitCompare className="h-4 w-4 shrink-0" />
              {productInInteractionCart ? "У кошику взаємодій" : "До взаємодій"}
            </Button>
            <ProductCompareButton
              product={product}
              conciseForm={displayForm}
              className="min-h-11 min-w-0 whitespace-normal"
            />
            <Button
              type="button"
              variant="outline"
              className="min-h-11 min-w-0 whitespace-normal"
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
            <Button
              asChild
              variant="outline"
              className="min-h-11 min-w-0 whitespace-normal"
              data-testid="product-card-pharmacovigilance-action"
            >
              <Link href={pharmacovigilanceHref(product)}>
                <Stethoscope className="h-4 w-4 shrink-0" />
                Фармаконагляд
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 min-w-0 whitespace-normal"
              onClick={() => setAiOpen((value) => !value)}
              aria-expanded={aiOpen}
              data-testid="product-card-ai-action"
            >
              <Sparkles className="h-4 w-4 shrink-0" />
              {aiOpen ? "Сховати AI-довідку" : "AI-довідка"}
            </Button>
            <details className="group relative min-w-0">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                <EllipsisVertical className="h-4 w-4 shrink-0" />
                Ще
              </summary>
              <div className="absolute right-0 z-20 mt-2 min-w-40 rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-lg">
                <Link
                  href="/about"
                  className="block rounded-md px-3 py-2 hover:bg-accent"
                >
                  Про довідник
                </Link>
              </div>
            </details>
          </div>

          {interactionCart.isFull && !productInInteractionCart ? (
            <p className="text-xs text-muted-foreground" role="status">
              У кошику вже 5 препаратів. Відкрийте взаємодії, щоб змінити вибір.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {aiOpen ? (
        <React.Suspense
          fallback={<Skeleton className="h-48 w-full rounded-2xl" />}
        >
          <ProductAiSummary
            productId={product.id}
            productName={product.tradeName}
          />
        </React.Suspense>
      ) : null}

      <nav
        id="product-card-tabs"
        className="grid scroll-mt-20 grid-cols-3 gap-1 rounded-2xl border bg-card/70 p-1"
        role="tablist"
        aria-label="Розділи картки препарату"
      >
        {PRODUCT_CARD_TABS.map((tab) => (
          <Button
            key={tab.id}
            type="button"
            variant={activeTab === tab.id ? "default" : "ghost"}
            className="min-h-11 min-w-0 whitespace-normal px-2"
            role="tab"
            aria-selected={activeTab === tab.id}
            data-testid={`product-card-tab-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </nav>

      <section
        role="tabpanel"
        aria-label={
          PRODUCT_CARD_TABS.find((tab) => tab.id === activeTab)?.label
        }
        data-testid={`product-card-panel-${activeTab}`}
        className="space-y-4"
      >
        {activeTab === "profile" ? (
          <>
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
            <FreshnessSection entries={card.freshness} />
          </>
        ) : null}

        {activeTab === "analogs" ? (
          <React.Suspense
            fallback={<Skeleton className="h-72 w-full rounded-2xl" />}
          >
            <ProductAnalogsTab card={card} />
          </React.Suspense>
        ) : null}

        {activeTab === "instruction" ? (
          <InstructionSection card={card} />
        ) : null}
      </section>

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

export function PreliminaryProductCard({
  identity,
}: {
  identity: OfflineProductIdentity;
}) {
  return (
    <main
      className={PRODUCT_CARD_PAGE_CLASS}
      data-testid="product-card-preliminary"
      data-preliminary="true"
    >
      <nav className="flex min-h-11 min-w-0 items-center gap-3 border-b pb-2">
        <Link
          href="/?type=registry_products"
          className="flex min-w-0 items-center gap-2 text-sm font-semibold text-primary"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span>До пошуку</span>
        </Link>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
          {identity.registration}
        </span>
      </nav>

      <Card className={PRODUCT_CARD_HERO_CLASS}>
        <CardContent className="min-w-0 space-y-5 p-4 sm:p-6">
          <header className="flex min-w-0 items-start gap-3">
            <div className="shrink-0 rounded-xl bg-primary/10 p-2.5">
              <Pill className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h1 className={PRODUCT_CARD_TITLE_CLASS}>
                  {identity.tradeName}
                </h1>
                <Badge variant="outline">Локальний індекс</Badge>
              </div>
              <p className="mt-2 break-words text-base text-muted-foreground">
                <span className="font-medium text-foreground">
                  МНН / склад:
                </span>{" "}
                {identity.inn || "Не зазначено"}
              </p>
            </div>
          </header>

          <div className="flex min-w-0 flex-wrap gap-2">
            {identity.strength ? (
              <Badge className="max-w-full whitespace-normal px-3 py-1 text-sm">
                {identity.strength}
              </Badge>
            ) : null}
            {identity.form ? (
              <Badge
                variant="secondary"
                className="max-w-full whitespace-normal px-3 py-1 text-sm"
              >
                {identity.form}
              </Badge>
            ) : null}
          </div>

          <dl className="rounded-xl border bg-background/60 p-3 text-sm">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Реєстраційний номер
            </dt>
            <dd className="mt-1 break-words font-medium">
              {identity.registration}
            </dd>
          </dl>

          <div
            className="grid gap-3 sm:grid-cols-2"
            aria-label="Завантажуємо реєстрові статуси"
          >
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
          <p className="text-xs text-muted-foreground">
            Назву, МНН, форму, дозування й реєстраційний номер показано з
            локального індексу. Реєстрові статуси з’являться після повної
            відповіді сервера.
          </p>
        </CardContent>
      </Card>
      <Skeleton className="h-14 w-full rounded-2xl" />
      <Skeleton className="h-72 w-full rounded-2xl" />
    </main>
  );
}

export function CachedInstructionPreview({
  cached,
}: {
  cached: InstructionCacheRecord;
}) {
  const sections = cached.instruction.sections;
  const visibleSections = sections
    ? INSTRUCTION_SECTION_LABELS.filter(({ key }) => sections[key])
    : [];

  return (
    <main
      className={PRODUCT_CARD_PAGE_CLASS}
      data-testid="product-card-cached-instruction"
      data-cached="true"
    >
      <nav className="flex min-h-11 min-w-0 items-center gap-3 border-b pb-2">
        <Link
          href="/?type=registry_products"
          className="flex min-w-0 items-center gap-2 text-sm font-semibold text-primary"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span>До пошуку</span>
        </Link>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
          {cached.registrationNumber}
        </span>
      </nav>

      <Card className={PRODUCT_CARD_HERO_CLASS}>
        <CardContent className="min-w-0 space-y-4 p-4 sm:p-6">
          <header className="flex min-w-0 items-start gap-3">
            <div className="shrink-0 rounded-xl bg-primary/10 p-2.5">
              <BookOpenText className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h1 className={PRODUCT_CARD_TITLE_CLASS}>
                  {cached.productTradeName}
                </h1>
                <Badge variant="outline">Збережена версія</Badge>
              </div>
            </div>
          </header>

          <InstructionTrustBadge
            documentDate={cached.instruction.source?.documentDate}
            registrationNumber={cached.registrationNumber}
            coveragePct={cached.instruction.provenance?.coveragePct}
          />

          {sections && visibleSections.length ? (
            <div className="rounded-2xl border bg-card/70 px-4">
              {visibleSections.map(({ key, label }) => (
                <details
                  key={key}
                  id={`instruction-${key}`}
                  className="group scroll-mt-20 border-b py-1 last:border-b-0"
                >
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 font-semibold">
                    <span className="break-words">{label}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="pb-5 text-sm leading-7">
                    <InstructionSectionContent content={sections[key]} />
                  </div>
                </details>
              ))}
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground" role="status">
            Показано збережену версію інструкції з попереднього перегляду.
            Оновлюємо дані з сервера…
          </p>
        </CardContent>
      </Card>
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

function OfflineProductCardFallback({
  identity,
  onRetry,
}: {
  identity: OfflineProductIdentity;
  onRetry: () => void;
}) {
  return (
    <main
      className={PRODUCT_CARD_PAGE_CLASS}
      data-testid="offline-product-card"
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
          {identity.registration}
        </span>
      </nav>

      <Alert className="border-primary/30 bg-primary/5">
        <WifiOff className="h-4 w-4" />
        <AlertTitle>Основні дані доступні офлайн</AlertTitle>
        <AlertDescription>
          Показано збережену реєстрову позицію. Інструкція, статуси та інші
          актуальні дані потребують підключення до мережі.
        </AlertDescription>
      </Alert>

      <Card className={PRODUCT_CARD_HERO_CLASS}>
        <CardContent className="min-w-0 space-y-5 p-4 sm:p-6">
          <header className="flex min-w-0 items-start gap-3">
            <div className="shrink-0 rounded-xl bg-primary/10 p-2.5">
              <Pill className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className={PRODUCT_CARD_TITLE_CLASS}>{identity.tradeName}</h1>
              <p className="mt-2 break-words text-base text-muted-foreground">
                <span className="font-medium text-foreground">
                  МНН / склад:
                </span>{" "}
                {identity.inn || "Не зазначено"}
              </p>
            </div>
          </header>

          <div className="flex min-w-0 flex-wrap gap-2">
            {identity.strength ? (
              <Badge className="max-w-full whitespace-normal px-3 py-1 text-sm">
                {identity.strength}
              </Badge>
            ) : null}
            {identity.form ? (
              <Badge
                variant="secondary"
                className="max-w-full whitespace-normal px-3 py-1 text-sm"
              >
                {identity.form}
              </Badge>
            ) : null}
          </div>

          <dl className="rounded-xl border bg-background/60 p-3 text-sm">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Реєстраційний номер
            </dt>
            <dd className="mt-1 break-words font-medium">
              {identity.registration}
            </dd>
          </dl>

          <Button type="button" variant="outline" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" />
            Оновити після підключення
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export default function ProductCardPage() {
  const { productId = "" } = useParams<{ productId: string }>();
  const validProductId = REGISTRY_PRODUCT_ID_PATTERN.test(productId);
  const offlineIdentity = useMemo(
    () => (validProductId ? readOfflineProductIdentity(productId) : null),
    [productId, validProductId],
  );
  const { isFavorite, toggleFavorite } = useFavorites();
  const clientCatalog = useCatalogClientIndex();
  const indexIdentity = useMemo(() => {
    if (!validProductId || clientCatalog.status !== "ready") return null;
    const candidate = clientCatalog
      .search(productId, { limit: 8 })
      .items.find((item) => item.product.productId === productId)?.product;
    return candidate ? catalogProductToPreliminaryIdentity(candidate) : null;
  }, [clientCatalog, productId, validProductId]);
  const preliminaryIdentity = indexIdentity ?? offlineIdentity;
  const [activeTab, setActiveTab] = useState<ProductCardTab>(() =>
    productCardTabFromSearch(
      typeof window === "undefined" ? "" : window.location.search,
    ),
  );
  const [cachedInstruction, setCachedInstruction] =
    useState<InstructionCacheRecord | null>(null);

  const selectProductCardTab = (tab: ProductCardTab) => {
    setActiveTab(tab);
    if (typeof window === "undefined") return;
    const target = productCardTabTarget(window.location.href, productId, tab);
    window.history.pushState(null, "", target);
    window.requestAnimationFrame(() => {
      document
        .getElementById(
          tab === "instruction" ? "instruction" : "product-card-tabs",
        )
        ?.scrollIntoView({ block: "start" });
    });
  };

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
  const cardPresentation = selectProductCardPresentation({
    serverCard: cardQuery.data,
    preliminary: preliminaryIdentity,
    loading: cardQuery.isLoading,
  });
  const correctedQuery = correctedQueryFromSearch(
    typeof window === "undefined" ? "" : window.location.search,
  );

  useEffect(() => {
    setCachedInstruction(null);
    if (!validProductId || activeTab !== "instruction") return;
    let cancelled = false;
    void readCachedInstruction(getInstructionCacheStore(), productId).then(
      (record) => {
        if (!cancelled) setCachedInstruction(record);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeTab, productId, validProductId]);

  useEffect(() => {
    if (!product) return;
    recordRecentlyViewed(registryProductDrugRef(product));
    cacheOfflineProductIdentity({
      productId: product.id,
      registration: product.registration.number,
      tradeName: product.tradeName,
      inn: product.inn || product.activeIngredient || "",
      form: conciseDosageForm(product.dosageForm),
      strength: product.strength ?? "",
    });
    markCardOpen(product.id);
  }, [product]);

  useEffect(() => {
    if (
      offlineIdentity &&
      !cardQuery.isLoading &&
      (cardQuery.isError || !cardQuery.data)
    ) {
      markCardOpen(offlineIdentity.productId);
    }
  }, [cardQuery.data, cardQuery.isError, cardQuery.isLoading, offlineIdentity]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncTabFromUrl = () =>
      setActiveTab(productCardTabFromSearch(window.location.search));
    syncTabFromUrl();
    window.addEventListener("popstate", syncTabFromUrl);
    return () => window.removeEventListener("popstate", syncTabFromUrl);
  }, [productId]);

  useEffect(() => {
    if (!cardQuery.data || activeTab !== "instruction") return;
    const targetId =
      typeof window === "undefined"
        ? "instruction"
        : window.location.hash.replace(/^#/u, "") || "instruction";
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: "start" });
    });
  }, [activeTab, cardQuery.data]);

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
  if (
    cardPresentation.source !== "server" &&
    activeTab === "instruction" &&
    cachedInstruction?.productId === productId
  ) {
    return <CachedInstructionPreview cached={cachedInstruction} />;
  }
  if (cardPresentation.source === "preliminary") {
    return <PreliminaryProductCard identity={cardPresentation.identity} />;
  }
  if (cardPresentation.source === "loading") return <ProductCardSkeleton />;
  if (cardQuery.isError || !cardQuery.data || !product) {
    if (offlineIdentity) {
      return (
        <OfflineProductCardFallback
          identity={offlineIdentity}
          onRetry={() => void cardQuery.refetch()}
        />
      );
    }
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
        activeTab={activeTab}
        onTabChange={selectProductCardTab}
      />
    </div>
  );
}
