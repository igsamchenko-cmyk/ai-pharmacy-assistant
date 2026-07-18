import React, { useEffect, useMemo, useState } from "react";
import {
  getSearchCatalogQueryKey,
  getSearchCatalogQueryOptions,
  useSearchCatalog,
  type CatalogIngredientResult,
  type CatalogSearchResponse,
  type RegistryProductResult,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Filter,
  FlaskConical,
  LoaderCircle,
  Pill,
  RefreshCw,
  Search as SearchIcon,
  ShieldAlert,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useDebounce } from "@/hooks/use-debounce";
import { ReportIssueButton } from "@/components/report-issue-button";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";

type SearchType = "all" | "ingredients" | "registry_products";
type RegistrationStatus = "active" | "terminated" | "unknown";
type PageSize = 25 | 50;
type CompositionFilter = "all" | "monotherapy" | "combination";
type MappingFilter = "all" | "approved" | "unmapped";
type NationalListFilter = "all" | "exact" | "ingredient_only" | "uncertain" | "not_listed";

const SEARCH_TYPES: Array<{ value: SearchType; label: string }> = [
  { value: "all", label: "Усі" },
  { value: "ingredients", label: "Діючі речовини" },
  { value: "registry_products", label: "Зареєстровані препарати" },
];

const numberFormatter = new Intl.NumberFormat("uk-UA");

export const REGISTRY_CATALOG_SAFETY_COPY =
  "Наявність препарату в реєстрі не підтверджує взаємозамінність, відсутність взаємодій або доцільність застосування.";
export const CATALOG_QUERY_DEBOUNCE_MS = 175;
export const EXACT_REGISTRATION_DEBOUNCE_MS = 75;

export function isCompleteRegistrationQuery(value: string): boolean {
  return /^UA\/\d{1,6}\/\d{1,3}\/\d{1,3}$/i.test(value.trim());
}

export function catalogQueryDebounceMs(value: string): number {
  return isCompleteRegistrationQuery(value)
    ? EXACT_REGISTRATION_DEBOUNCE_MS
    : CATALOG_QUERY_DEBOUNCE_MS;
}

export function isCatalogQueryEnabled(value: string): boolean {
  const length = value.trim().length;
  return length === 0 || length >= 3;
}

export function shouldDisplayCatalogResponse(
  draft: string,
  effective: string,
  isPlaceholder: boolean,
): boolean {
  return draft.trim() === effective.trim() &&
    isCatalogQueryEnabled(effective) &&
    !isPlaceholder;
}

export function applyPastedQuery(
  current: string,
  selectionStart: number | null,
  selectionEnd: number | null,
  pasted: string,
): string {
  const start = selectionStart ?? current.length;
  const end = selectionEnd ?? start;
  return current.slice(0, start) + pasted + current.slice(end);
}

export function resolveCatalogViewState(
  isLoading: boolean,
  isError: boolean,
  hasResults: boolean,
): "loading" | "error" | "results" | "empty" {
  if (isLoading) return "loading";
  if (isError) return "error";
  return hasResults ? "results" : "empty";
}

function initialSearchState(): { q: string; type: SearchType } {
  if (typeof window === "undefined") return { q: "", type: "all" };
  const params = new URLSearchParams(window.location.search);
  const requestedType = params.get("type");
  return {
    q: params.get("q") ?? "",
    type: SEARCH_TYPES.some((item) => item.value === requestedType)
      ? requestedType as SearchType
      : "all",
  };
}

function statusLabel(status: RegistryProductResult["registration"]["status"]) {
  if (status === "active") return "Діюча";
  if (status === "terminated") return "Припинена";
  return "Статус не визначено";
}

function registryComposition(product: RegistryProductResult): string {
  return product.inn || product.activeIngredient || "Склад у реєстрі не зазначено";
}

export function InstructionAvailabilityBadge({
  productId,
  available,
}: {
  productId: string;
  available: boolean;
}) {
  if (!available) return null;
  return (
    <Badge
      variant="outline"
      className="gap-1 whitespace-normal text-left"
      data-testid={`instruction-badge-${productId}`}
    >
      <BookOpenText className="h-3 w-3 shrink-0" />
      Є інструкція
    </Badge>
  );
}

export function InstructionAction({ product }: { product: RegistryProductResult }) {
  if (!product.instructionAvailable) return null;
  return (
    <Button
      asChild
      size="sm"
      className="w-full min-w-0 max-w-full justify-center whitespace-normal sm:w-auto"
    >
      <a
        href={`/instructions/${product.id}`}
        data-testid={`instruction-action-${product.id}`}
      >
        <BookOpenText className="h-4 w-4 shrink-0" />
        Інструкція
      </a>
    </Button>
  );
}

function NationalListBadge({ product }: { product: RegistryProductResult }) {
  if (product.nationalListStatus === "not_applicable") return null;
  if (product.nationalListStatus === "exact") {
    return (
      <Badge className="gap-1 whitespace-normal" data-testid="national-list-exact">
        <CheckCircle2 className="h-3 w-3" />
        Нацперелік
      </Badge>
    );
  }
  if (product.nationalListStatus === "ingredient_only") {
    return (
      <Badge variant="outline" className="whitespace-normal text-left">
        МНН у Нацпереліку — форму/дозування не підтверджено
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="whitespace-normal text-left">
      {product.nationalListStatus === "uncertain"
        ? "Потребує уточнення"
        : "Не в Нацпереліку"}
    </Badge>
  );
}

export function RegistryProductCard({
  product,
  query,
  showReportIssue = true,
}: {
  product: RegistryProductResult;
  query: string;
  showReportIssue?: boolean;
}) {
  const approved = product.mappingStatus === "approved" && product.approvedMapping;
  const manufacturerText = product.manufacturers.length
    ? product.manufacturers
        .map((item) => [item.name, item.country].filter(Boolean).join(", "))
        .join("; ")
    : "не зазначено у реєстровому записі";

  return (
    <Card
      className="overflow-hidden border-border"
      data-testid={`registry-product-${product.id}`}
    >
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 rounded-md bg-primary/10 p-2.5">
            <Pill className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <h3 className="font-bold text-base leading-snug break-words">
              {product.tradeName}
            </h3>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-1 whitespace-normal">
                <Database className="h-3 w-3" />
                Державний реєстр
              </Badge>
              <Badge
                variant={approved ? "default" : "outline"}
                className="gap-1 whitespace-normal text-left"
              >
                {approved ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <ShieldAlert className="h-3 w-3" />
                )}
                {approved
                  ? "Підтверджено"
                  : "Реєстровий запис - mapping не підтверджений"}
              </Badge>
              <NationalListBadge product={product} />
              <InstructionAvailabilityBadge
                productId={product.id}
                available={product.instructionAvailable}
              />
              {product.sourceRecordCount > 1 ? (
                <Badge variant="outline">
                  Джерельних записів: {product.sourceRecordCount}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        {product.instructionAvailable ? (
          <div
            className="flex min-w-0 flex-wrap items-center gap-2"
            data-testid={`instruction-discovery-${product.id}`}
          >
            <InstructionAction product={product} />
            <span className="text-xs text-muted-foreground">
              Офіційна інструкція для цієї реєстрової позиції
            </span>
          </div>
        ) : null}

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">
              Реєстрове МНН / склад
            </dt>
            <dd className="mt-1 break-words">{registryComposition(product)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">
              Форма та дозування
            </dt>
            <dd className="mt-1 break-words">
              {[product.dosageForm, product.strength].filter(Boolean).join(", ") ||
                "не зазначено"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">
              Виробник
            </dt>
            <dd className="mt-1 break-words">{manufacturerText}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">
              Реєстрація
            </dt>
            <dd className="mt-1 break-words">
              {product.registration.number || "номер не зазначено"}
              <span className="block text-xs text-muted-foreground">
                {statusLabel(product.registration.status)}
                {product.registration.endDate
                  ? ` до ${product.registration.endDate}`
                  : ""}
              </span>
            </dd>
          </div>
        </dl>

        {product.nationalListStatus !== "not_applicable" ? (
          <div className="border-y py-3 text-sm" data-testid="national-list-details">
            <p className="font-medium">Національний перелік</p>
            <p className="mt-1 text-muted-foreground">{product.nationalListMatchReason}</p>
            {product.nationalListMatchDetails ? (
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                <div><dt className="text-xs text-muted-foreground">МНН / комбінація</dt><dd>{product.nationalListMatchDetails.officialName}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Форма / route / strength</dt><dd>{product.nationalListMatchDetails.formMatch} / {product.nationalListMatchDetails.routeMatch} / {product.nationalListMatchDetails.strengthMatch}</dd></div>
                {product.nationalListSection ? <div><dt className="text-xs text-muted-foreground">Розділ</dt><dd>{product.nationalListSection}</dd></div> : null}
                {product.nationalListSource ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Нормативний акт</dt>
                    <dd>
                      <a className="underline underline-offset-2" href={product.nationalListSource.url} target="_blank" rel="noreferrer">
                        Постанова №{product.nationalListSource.actNumber}, редакція {product.nationalListSource.revisionDate}
                      </a>
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              Статус у Нацпереліку не є клінічною рекомендацією та не підтверджує взаємозамінність.
            </p>
          </div>
        ) : null}

        {product.atcCode && (
          <p className="text-xs text-muted-foreground break-words">
            ATC: <span className="font-mono text-foreground">{product.atcCode}</span>
          </p>
        )}

        <div
          className={
            approved
              ? "border-l-2 border-primary pl-3 text-sm"
              : "border-l-2 border-amber-500 pl-3 text-sm"
          }
        >
          {approved ? (
            <>
              <p className="font-medium">Внутрішній ingredient mapping</p>
              <p className="mt-1 break-words text-muted-foreground">
                {approved.inn}
                {approved.latin ? ` / ${approved.latin}` : ""}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Підтвердженого mapping немає</p>
              <p className="mt-1 text-muted-foreground">
                Офіційне реєстрове МНН показано як дані реєстру. Воно не
                підміняє перевірений внутрішній ingredient mapping.
              </p>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showReportIssue ? (
            <ReportIssueButton
              type="wrong_mapping"
              context={`registry-product:${product.id}:query:${query || "browse"}`}
              sourceSnapshot={{
                id: product.id,
                tradeName: product.tradeName,
                registrationNumber: product.registration.number,
                mappingStatus: product.mappingStatus,
                sourceKey: product.source.key,
              }}
              compact
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function IngredientCard({ ingredient }: { ingredient: CatalogIngredientResult }) {
  return (
    <Card data-testid={`ingredient-result-${ingredient.ingredientId}`}>
      <CardContent className="p-4 flex items-start gap-3">
        <div className="shrink-0 rounded-md bg-emerald-500/10 p-2.5">
          <FlaskConical className="h-5 w-5 text-emerald-700" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold break-words">{ingredient.inn}</h3>
            <Badge variant="secondary">Діюча речовина</Badge>
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Approved mapping
            </Badge>
          </div>
          {[ingredient.latin, ingredient.english]
            .filter(Boolean)
            .map((name) => (
              <p key={name} className="mt-1 text-sm text-muted-foreground break-words">
                {name}
              </p>
            ))}
          <div className="mt-2 flex flex-wrap gap-2">
            {ingredient.atcCode && (
              <Badge variant="outline" className="font-mono">
                {ingredient.atcCode}
              </Badge>
            )}
            {ingredient.group && (
              <Badge variant="outline" className="whitespace-normal">
                {ingredient.group}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type GroupedRegistryCatalog = NonNullable<CatalogSearchResponse["registryGroups"]>;
type RegistryCompositionGroup = GroupedRegistryCatalog["groups"]["items"][number];
type RegistryTradeNameGroup = RegistryCompositionGroup["tradeNames"]["items"][number];

export function normalizeExactTradeName(value: string): string {
  return value
    .replace(/[®™]/gu, "")
    .normalize("NFKC")
    .toLocaleLowerCase("uk-UA")
    .replace(/[‐‑‒–—−]/gu, "-")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function isExactTradeNameQuery(query: string, tradeName: string): boolean {
  const normalizedQuery = normalizeExactTradeName(query);
  return Boolean(normalizedQuery) && normalizedQuery === normalizeExactTradeName(tradeName);
}

export function findExactTradeNameMatches(
  catalog: GroupedRegistryCatalog,
  query: string,
): Array<{ group: RegistryCompositionGroup; trade: RegistryTradeNameGroup }> {
  return catalog.groups.items.flatMap((group) =>
    group.tradeNames.items
      .filter((trade) => isExactTradeNameQuery(query, trade.tradeName))
      .map((trade) => ({ group, trade })),
  );
}

export function shouldAutoLoadExactTradeVariants(
  variantsLoaded: boolean,
  selectedTradeNameKey: string | null,
): boolean {
  return !variantsLoaded && selectedTradeNameKey === null;
}

export function shouldShowPrimarySearchSpinner(
  isUpdating: boolean,
  isBaseFetching: boolean,
  _isVariantFetching: boolean,
): boolean {
  return isUpdating || isBaseFetching;
}
export const CATALOG_QUERY_STALE_MS = 120_000;

export function shouldRetryCatalogRequest(
  failureCount: number,
  error: unknown,
): boolean {
  if (failureCount >= 1) return false;
  const status =
    typeof error === "object" && error !== null && "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : null;
  return status === null || status >= 500;
}

export function mergeCatalogVariantPage(
  catalog: GroupedRegistryCatalog | null | undefined,
  variantCatalog: GroupedRegistryCatalog | null | undefined,
  groupKey: string | null,
  tradeNameKey: string | null,
): GroupedRegistryCatalog | null | undefined {
  if (!catalog || !variantCatalog || !groupKey || !tradeNameKey) return catalog;
  const variantGroup = variantCatalog.groups.items.find(
    (group) => group.key === groupKey,
  );
  const variants = variantGroup?.tradeNames.items.find(
    (trade) => trade.key === tradeNameKey,
  )?.variants;
  if (!variants) return catalog;

  return {
    ...catalog,
    groups: {
      ...catalog.groups,
      items: catalog.groups.items.map((group) =>
        group.key !== groupKey
          ? group
          : {
              ...group,
              tradeNames: {
                ...group.tradeNames,
                items: group.tradeNames.items.map((trade) =>
                  trade.key === tradeNameKey ? { ...trade, variants } : trade,
                ),
              },
            },
      ),
    },
  };
}

function ExactBrandCard({
  group, trade, query, isSelected, isFetching, isVariantFetching, isVariantError,
  onRetryVariants, onSelect, onVariantPage,
}: {
  group: RegistryCompositionGroup;
  trade: RegistryTradeNameGroup;
  query: string;
  isSelected: boolean;
  isFetching: boolean;
  isVariantFetching: boolean;
  isVariantError: boolean;
  onRetryVariants: () => void;
  onSelect: () => void;
  onVariantPage: (page: number) => void;
}) {
  const instructionAvailable = trade.variants?.items.some(
    (product) => product.instructionAvailable,
  ) ?? false;
  return (
    <Card className="max-w-full overflow-hidden border-primary/40 bg-primary/[0.03]" data-testid={"exact-brand-card-" + trade.key}>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-semibold break-words">{trade.tradeName}</h3>
              <Badge>Точний збіг за торговою назвою</Badge>
              <InstructionAvailabilityBadge productId={"trade-" + trade.key} available={instructionAvailable} />
            </div>
            <p className="text-sm text-muted-foreground break-words">
              Діюча речовина: <span className="font-medium text-foreground">{group.displayName}</span>
            </p>
          </div>
          <Badge variant="secondary">{numberFormatter.format(trade.summary.totalRegistryPositions)} реєстрових позицій</Badge>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="min-w-0"><dt className="text-xs text-muted-foreground">Дозування</dt><dd className="break-words">{trade.strengths.length ? trade.strengths.join(", ") : "Не зазначено"}</dd></div>
          <div className="min-w-0"><dt className="text-xs text-muted-foreground">Форми</dt><dd className="break-words">{trade.forms.length ? trade.forms.join(", ") : "Не зазначено"}</dd></div>
          <div className="min-w-0"><dt className="text-xs text-muted-foreground">Виробники</dt><dd className="break-words">{trade.manufacturers.length ? trade.manufacturers.join(", ") : "Не зазначено"}</dd></div>
        </dl>
        {trade.variants ? (
          <div className="space-y-3" data-testid={"exact-brand-variants-" + trade.key}>
            <h4 className="font-medium">Конкретні реєстрові позиції</h4>
            {trade.variants.items.map((product) => <RegistryProductCard key={product.id} product={product} query={query} />)}
            {trade.variants.totalPages > 1 ? (
              <nav className="flex items-center justify-between gap-2" aria-label="Сторінки реєстрових позицій бренду">
                <Button type="button" variant="outline" disabled={trade.variants.page <= 1 || isFetching} onClick={() => onVariantPage(Math.max(1, trade.variants!.page - 1))}><ArrowLeft className="h-4 w-4" /><span className="sr-only sm:not-sr-only">Попередня</span></Button>
                <span className="text-xs text-muted-foreground">{trade.variants.page} / {trade.variants.totalPages}</span>
                <Button type="button" variant="outline" disabled={!trade.variants.hasNext || isFetching} onClick={() => onVariantPage(trade.variants!.page + 1)}><span className="sr-only sm:not-sr-only">Наступна</span><ArrowRight className="h-4 w-4" /></Button>
              </nav>
            ) : null}
          </div>
        ) : isSelected && isVariantFetching ? (
          <div className="space-y-2" aria-label="Завантаження реєстрових позицій бренду" data-testid="exact-brand-loading">
            <div className="h-36 w-full animate-pulse rounded-md bg-primary/10" /><div className="h-36 w-full animate-pulse rounded-md bg-primary/10" />
          </div>
        ) : isSelected && isVariantError ? (
          <div className="space-y-3 border-y py-4" role="alert" data-testid="exact-brand-error">
            <p className="text-sm text-muted-foreground">Не вдалося завантажити реєстрові позиції. Сервіс може прокидатися після паузи.</p>
            <Button type="button" variant="outline" className="min-h-11" onClick={onRetryVariants}><RefreshCw className="h-4 w-4" />Спробувати ще раз</Button>
          </div>
        ) : (
          <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={onSelect}>
            Показати конкретні реєстрові позиції <ChevronDown className="h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function BrandAlternatives({ enabled, ingredient, children }: { enabled: boolean; ingredient: string; children: React.ReactNode }) {
  if (!enabled) return <>{children}</>;
  return (
    <details className="group max-w-full overflow-hidden rounded-lg border" data-testid="brand-alternatives">
      <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 font-medium">
        <span className="break-words">Інші препарати з {ingredient}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">Розгорнути<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></span>
      </summary>
      <div className="space-y-5 border-t p-4">{children}</div>
    </details>
  );
}
export function GroupedRegistryResults({
  catalog,
  query,
  isFetching,
  isVariantFetching,
  isVariantError,
  selectedTradeNameKey,
  onRetryVariants,
  onSelectTrade,
  onGroupPage,
  onTradePage,
  onVariantPage,
}: {
  catalog: GroupedRegistryCatalog;
  query: string;
  isFetching: boolean;
  isVariantFetching: boolean;
  isVariantError: boolean;
  selectedTradeNameKey: string | null;
  onRetryVariants: () => void;
  onSelectTrade: (groupKey: string | null, tradeNameKey: string | null) => void;
  onGroupPage: (page: number) => void;
  onTradePage: (groupKey: string, page: number) => void;
  onVariantPage: (page: number) => void;
}) {
  const summary = catalog.summary;
  const [openGroupKeys, setOpenGroupKeys] = useState<Set<string>>(
    () => new Set(catalog.groups.items.slice(0, 1).map((group) => group.key)),
  );

  const exactTradeMatches = findExactTradeNameMatches(catalog, query);
  const primaryExactMatch = exactTradeMatches[0] ?? null;
  const primaryExactVariantsLoaded = Boolean(primaryExactMatch?.trade.variants);
  const exactTradeKeys = new Set(exactTradeMatches.map(
    ({ group, trade }) => group.key + "::" + trade.key,
  ));
  const remainingGroups = exactTradeMatches.length
    ? catalog.groups.items.map((group) => ({
        ...group,
        tradeNames: {
          ...group.tradeNames,
          items: group.tradeNames.items.filter(
            (trade) => !exactTradeKeys.has(group.key + "::" + trade.key),
          ),
        },
      })).filter((group) => group.tradeNames.items.length > 0)
    : catalog.groups.items;

  useEffect(() => {
    if (
      !primaryExactMatch ||
      !shouldAutoLoadExactTradeVariants(
        primaryExactVariantsLoaded,
        selectedTradeNameKey,
      )
    ) return;
    onSelectTrade(primaryExactMatch.group.key, primaryExactMatch.trade.key);
  }, [
    onSelectTrade,
    primaryExactMatch?.group.key,
    primaryExactMatch?.trade.key,
    primaryExactVariantsLoaded,
    selectedTradeNameKey,
  ]);
  useEffect(() => {
    setOpenGroupKeys(new Set(catalog.groups.items.slice(0, 1).map((group) => group.key)));
  }, [catalog.groups.page, catalog.groups.items[0]?.key]);

  return (
    <section className="space-y-5" data-testid="grouped-registry-results">
      <div className="space-y-2 border-y py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Згруповані результати реєстру</h2>
          <Badge variant="secondary">
            {numberFormatter.format(summary.totalRegistryPositions)} реєстрових позицій
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <span>Торгові назви: {numberFormatter.format(summary.uniqueTradeNames)}</span>
          <span>Форми: {numberFormatter.format(summary.uniqueDosageForms)}</span>
          <span>Дозування: {numberFormatter.format(summary.uniqueStrengths)}</span>
          <span>Виробники: {numberFormatter.format(summary.uniqueManufacturers)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Монопрепарати: {numberFormatter.format(summary.monotherapyCount)}; комбінації: {numberFormatter.format(summary.combinationCount)}; підтверджені: {numberFormatter.format(summary.approvedMappedCount)}; registry-only: {numberFormatter.format(summary.unmappedCount)}; склад потребує уточнення: {numberFormatter.format(summary.unknownCompositionCount)}.
        </p>
      </div>

      {exactTradeMatches.length ? (
        <section className="space-y-3" data-testid="exact-brand-results">
          <div>
            <h2 className="text-lg font-semibold">Точний збіг за торговою назвою</h2>
            <p className="text-xs text-muted-foreground">
              Бренд показано перед результатами за МНН, alias та нечіткими збігами.
            </p>
          </div>
          {exactTradeMatches.map(({ group, trade }) => (
            <ExactBrandCard
              key={group.key + "::" + trade.key}
              group={group}
              trade={trade}
              query={query}
              isSelected={trade.key === selectedTradeNameKey}
              isFetching={isFetching}
              isVariantFetching={isVariantFetching}
              isVariantError={isVariantError}
              onRetryVariants={onRetryVariants}
              onSelect={() => onSelectTrade(group.key, trade.key)}
              onVariantPage={onVariantPage}
            />
          ))}
        </section>
      ) : null}

      <BrandAlternatives
        enabled={exactTradeMatches.length > 0 && remainingGroups.length > 0}
        ingredient={primaryExactMatch?.group.displayName ?? "тією самою діючою речовиною"}
      >
      {remainingGroups.map((group) => {
        const hasOpenTrade = group.tradeNames.items.some(
          (trade) => Boolean(trade.variants) || trade.key === selectedTradeNameKey,
        );
        const groupExpanded = openGroupKeys.has(group.key) || hasOpenTrade;
        return (
          <section key={group.key} className="space-y-3 border-b pb-5" data-testid={`composition-group-${group.key}`}>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold break-words">{group.displayName}</h3>
                <Badge variant="outline">
                  {group.compositionType === "monotherapy"
                    ? "Монопрепарат"
                    : group.compositionType === "combination"
                      ? "Комбінація"
                      : "Склад потребує уточнення"}
                </Badge>
                <Badge variant={group.mappingStatus === "approved" ? "default" : "secondary"}>
                  {group.mappingStatus === "approved" ? "Mapping підтверджено" : "Registry-only / mixed"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {numberFormatter.format(group.summary.totalRegistryPositions)} позицій; {numberFormatter.format(group.summary.uniqueTradeNames)} торгових назв
              </p>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full justify-between sm:w-auto"
                aria-expanded={groupExpanded}
                onClick={() => setOpenGroupKeys((current) => {
                  const next = new Set(current);
                  if (next.has(group.key)) next.delete(group.key);
                  else next.add(group.key);
                  return next;
                })}
              >
                {groupExpanded ? "Сховати торгові назви" : "Показати торгові назви"}
                {groupExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>

            {groupExpanded ? (
              <div className="space-y-2">
                {group.tradeNames.items.map((trade) => {
                  const expanded = Boolean(trade.variants) || trade.key === selectedTradeNameKey;
                  const instructionAvailable = trade.variants?.items.some(
                    (product) => product.instructionAvailable,
                  ) ?? false;
                  return (
                    <div key={trade.key} className="border-l-2 border-primary/30 pl-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto min-h-11 min-w-0 flex-1 justify-between whitespace-normal px-2 text-left"
                          onClick={() => onSelectTrade(expanded ? null : group.key, expanded ? null : trade.key)}
                          aria-expanded={expanded}
                        >
                          <span className="min-w-0">
                            <span className="block font-medium break-words">{trade.tradeName}</span>
                            <span className="block text-xs font-normal text-muted-foreground">
                              {numberFormatter.format(trade.summary.totalRegistryPositions)} позицій; форм: {trade.summary.uniqueDosageForms}; дозувань: {trade.summary.uniqueStrengths}; виробників: {trade.summary.uniqueManufacturers}
                            </span>
                          </span>
                          {expanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                        </Button>
                        <InstructionAvailabilityBadge
                          productId={`trade-${trade.key}`}
                          available={instructionAvailable}
                        />
                      </div>

                      {trade.variants ? (
                        <div className="mt-3 space-y-3" data-testid={`trade-variants-${trade.key}`}>
                          {trade.variants.items.map((product) => (
                            <RegistryProductCard key={product.id} product={product} query={query} />
                          ))}
                          {trade.variants.totalPages > 1 ? (
                            <nav className="flex items-center justify-between gap-2" aria-label="Сторінки варіантів препарату">
                              <Button type="button" variant="outline" disabled={trade.variants.page <= 1 || isFetching} onClick={() => onVariantPage(Math.max(1, trade.variants!.page - 1))}>
                                <ArrowLeft className="h-4 w-4" /><span className="sr-only sm:not-sr-only">Попередня</span>
                              </Button>
                              <span className="text-xs text-muted-foreground">{trade.variants.page} / {trade.variants.totalPages}</span>
                              <Button type="button" variant="outline" disabled={!trade.variants.hasNext || isFetching} onClick={() => onVariantPage(trade.variants!.page + 1)}>
                                <span className="sr-only sm:not-sr-only">Наступна</span><ArrowRight className="h-4 w-4" />
                              </Button>
                            </nav>
                          ) : null}
                        </div>
                      ) : trade.key === selectedTradeNameKey && isVariantFetching ? (
                        <div
                          className="mt-3 space-y-2"
                          aria-label="Завантаження варіантів препарату"
                          data-testid="variant-loading"
                        >
                          <div className="h-36 w-full animate-pulse rounded-md bg-primary/10" />
                          <div className="h-36 w-full animate-pulse rounded-md bg-primary/10" />
                        </div>
                      ) : trade.key === selectedTradeNameKey && isVariantError ? (
                        <div
                          className="mt-3 space-y-3 border-y py-4"
                          role="alert"
                          data-testid="variant-error"
                        >
                          <p className="text-sm text-muted-foreground">
                            Не вдалося завантажити варіанти. Сервіс може прокидатися після паузи.
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            onClick={onRetryVariants}
                          >
                            <RefreshCw className="h-4 w-4" />
                            Спробувати ще раз
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {group.tradeNames.totalPages > 1 ? (
                  <nav className="flex items-center justify-between gap-2 pt-2" aria-label="Сторінки торгових назв">
                    <Button type="button" variant="outline" disabled={group.tradeNames.page <= 1 || isFetching} onClick={() => onTradePage(group.key, Math.max(1, group.tradeNames.page - 1))}>
                      <ArrowLeft className="h-4 w-4" /><span className="sr-only sm:not-sr-only">Попередня</span>
                    </Button>
                    <span className="text-xs text-muted-foreground">{group.tradeNames.page} / {group.tradeNames.totalPages}</span>
                    <Button type="button" variant="outline" disabled={!group.tradeNames.hasNext || isFetching} onClick={() => onTradePage(group.key, group.tradeNames.page + 1)}>
                      <span className="sr-only sm:not-sr-only">Наступна</span><ArrowRight className="h-4 w-4" />
                    </Button>
                  </nav>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
      </BrandAlternatives>
      {catalog.groups.totalPages > 1 ? (
        <nav className="grid grid-cols-[1fr_auto_1fr] items-center gap-2" aria-label="Сторінки груп складу">
          <Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={catalog.groups.page <= 1 || isFetching} onClick={() => onGroupPage(Math.max(1, catalog.groups.page - 1))}>
            <ArrowLeft className="h-4 w-4" /><span className="sr-only sm:not-sr-only">Попередня</span>
          </Button>
          <span className="text-xs text-muted-foreground">Група {catalog.groups.page} з {catalog.groups.totalPages}</span>
          <Button type="button" variant="outline" className="min-h-11 justify-self-end" disabled={!catalog.groups.hasNext || isFetching} onClick={() => onGroupPage(catalog.groups.page + 1)}>
            <span className="sr-only sm:not-sr-only">Наступна</span><ArrowRight className="h-4 w-4" />
          </Button>
        </nav>
      ) : null}
    </section>
  );
}
export default function SearchPage() {
  const initial = useMemo(initialSearchState, []);
  const [q, setQ] = useState(initial.q);
  const [type, setType] = useState<SearchType>(initial.type);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [manufacturer, setManufacturer] = useState("");
  const [form, setForm] = useState("");
  const [strength, setStrength] = useState("");
  const [compositionType, setCompositionType] = useState<CompositionFilter>("all");
  const [mappingStatus, setMappingStatus] = useState<MappingFilter>("all");
  const [nationalListStatus, setNationalListStatus] = useState<NationalListFilter>("all");
  const [registrationStatus, setRegistrationStatus] =
    useState<RegistrationStatus | "all">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [groupPage, setGroupPage] = useState(1);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [selectedTradeNameKey, setSelectedTradeNameKey] = useState<string | null>(null);
  const [tradePage, setTradePage] = useState(1);
  const [variantPage, setVariantPage] = useState(1);
  const [effectiveQ, setEffectiveQ] = useState(initial.q.trim());

  const queryClient = useQueryClient();
  const debouncedManufacturer = useDebounce(manufacturer, 200);
  const debouncedForm = useDebounce(form, 200);
  const debouncedStrength = useDebounce(strength, 200);
  const criteriaKey = useMemo(
    () => JSON.stringify([
      effectiveQ,
      debouncedManufacturer.trim(),
      debouncedForm.trim(),
      debouncedStrength.trim(),
      compositionType,
      mappingStatus,
      nationalListStatus,
      registrationStatus,
      type,
      pageSize,
    ]),
    [
      effectiveQ,
      debouncedManufacturer,
      debouncedForm,
      debouncedStrength,
      compositionType,
      mappingStatus,
      nationalListStatus,
      registrationStatus,
      type,
      pageSize,
    ],
  );
  const [paginationCriteriaKey, setPaginationCriteriaKey] = useState(criteriaKey);
  const paginationIsCurrent = paginationCriteriaKey === criteriaKey;

  useEffect(() => {
    setPage(1);
    setGroupPage(1);
    setSelectedGroupKey(null);
    setSelectedTradeNameKey(null);
    setTradePage(1);
    setVariantPage(1);
    setPaginationCriteriaKey(criteriaKey);
  }, [criteriaKey]);

  const requestedPage = paginationIsCurrent ? page : 1;
  const requestedGroupPage = paginationIsCurrent ? groupPage : 1;
  const requestedTradePage = paginationIsCurrent ? tradePage : 1;
  const requestedVariantPage = paginationIsCurrent ? variantPage : 1;
  const requestedGroupKey = paginationIsCurrent ? selectedGroupKey : null;
  const requestedTradeNameKey = paginationIsCurrent
    ? selectedTradeNameKey
    : null;

  const params = useMemo(
    () => ({
      q: effectiveQ,
      type,
      page: requestedPage,
      pageSize,
      view: effectiveQ && type !== "ingredients"
        ? "grouped" as const
        : "flat" as const,
      groupPage: requestedGroupPage,
      groupPageSize: 10 as const,
      tradePage: requestedTradePage,
      tradePageSize: 10 as const,
      variantPageSize: 25 as const,
      ...(requestedGroupKey && !requestedTradeNameKey
        ? { groupKey: requestedGroupKey }
        : {}),
      ...(debouncedManufacturer.trim()
        ? { manufacturer: debouncedManufacturer.trim() }
        : {}),
      ...(debouncedForm.trim() ? { form: debouncedForm.trim() } : {}),
      ...(debouncedStrength.trim() ? { strength: debouncedStrength.trim() } : {}),
      compositionType,
      mappingStatus,
      nationalListStatus,
      ...(registrationStatus !== "all" ? { registrationStatus } : {}),
    }),
    [
      effectiveQ,
      type,
      requestedPage,
      pageSize,
      requestedGroupPage,
      requestedTradePage,
      requestedGroupKey,
      requestedTradeNameKey,
      debouncedManufacturer,
      debouncedForm,
      debouncedStrength,
      compositionType,
      mappingStatus,
      nationalListStatus,
      registrationStatus,
    ],
  );

  useEffect(() => {
    const nextQ = q.trim();
    if (nextQ === effectiveQ) return;
    if (!isCatalogQueryEnabled(nextQ)) {
      setEffectiveQ(nextQ);
      return;
    }
    const { groupKey: _groupKey, ...baseParams } = params;
    const cachedParams = {
      ...baseParams,
      q: nextQ,
      page: 1,
      groupPage: 1,
      tradePage: 1,
      view: nextQ && type !== "ingredients" ? "grouped" as const : "flat" as const,
    };
    if (
      queryClient.getQueryData(getSearchCatalogQueryKey(cachedParams)) !==
        undefined
    ) {
      setEffectiveQ(nextQ);
      return;
    }
    const timer = window.setTimeout(
      () => setEffectiveQ(nextQ),
      catalogQueryDebounceMs(nextQ),
    );
    return () => window.clearTimeout(timer);
  }, [effectiveQ, params, q, queryClient, type]);

  const variantParams = useMemo(
    () =>
      requestedGroupKey && requestedTradeNameKey
        ? {
            ...params,
            groupKey: requestedGroupKey,
            tradeNameKey: requestedTradeNameKey,
            variantPage: requestedVariantPage,
          }
        : null,
    [
      params,
      requestedGroupKey,
      requestedTradeNameKey,
      requestedVariantPage,
    ],
  );

  const {
    data,
    isLoading,
    isFetching: isBaseFetching,
    isError,
    isPlaceholderData,
    refetch,
  } = useSearchCatalog(params, {
    query: {
      queryKey: getSearchCatalogQueryKey(params),
      enabled: isCatalogQueryEnabled(effectiveQ),
      placeholderData: keepPreviousData,
      retry: shouldRetryCatalogRequest,
      retryDelay: 1_000,
      staleTime: CATALOG_QUERY_STALE_MS,
      gcTime: 600_000,
      refetchOnWindowFocus: false,
    },
  });

  const {
    data: variantData,
    isFetching: isVariantFetching,
    isError: isVariantError,
    refetch: refetchVariants,
  } = useSearchCatalog(variantParams ?? params, {
    query: {
      queryKey: getSearchCatalogQueryKey(variantParams ?? params),
      enabled: Boolean(variantParams) && isCatalogQueryEnabled(effectiveQ),
      placeholderData: keepPreviousData,
      retry: shouldRetryCatalogRequest,
      retryDelay: 1_000,
      staleTime: CATALOG_QUERY_STALE_MS,
      gcTime: 600_000,
      refetchOnWindowFocus: false,
    },
  });

  useEffect(() => {
    if (!data || isPlaceholderData) return;
    const activeGroup = requestedGroupKey
      ? data.registryGroups?.groups.items.find(
          (group) => group.key === requestedGroupKey,
        )
      : null;
    const nextParams = activeGroup?.tradeNames.hasNext
      ? {
          ...params,
          groupKey: activeGroup.key,
          tradePage: activeGroup.tradeNames.page + 1,
        }
      : data.registryGroups?.groups.hasNext
        ? { ...params, groupPage: data.registryGroups.groups.page + 1 }
        : data.registryProducts.hasNext
          ? { ...params, page: data.registryProducts.page + 1 }
          : null;
    if (!nextParams) return;
    void queryClient.prefetchQuery({
      ...getSearchCatalogQueryOptions(nextParams),
      staleTime: CATALOG_QUERY_STALE_MS,
    });
  }, [
    data,
    isPlaceholderData,
    params,
    queryClient,
    requestedGroupKey,
  ]);

  useEffect(() => {
    if (!variantParams || !variantData || !requestedTradeNameKey) return;
    const variants = variantData.registryGroups?.groups.items
      .find((group) => group.key === requestedGroupKey)
      ?.tradeNames.items
      .find((trade) => trade.key === requestedTradeNameKey)
      ?.variants;
    if (!variants?.hasNext) return;
    const nextParams = {
      ...variantParams,
      variantPage: variants.page + 1,
    };
    void queryClient.prefetchQuery({
      ...getSearchCatalogQueryOptions(nextParams),
      staleTime: CATALOG_QUERY_STALE_MS,
    });
  }, [
    queryClient,
    requestedGroupKey,
    requestedTradeNameKey,
    variantData,
    variantParams,
  ]);

  const isFetching = isBaseFetching || isVariantFetching;
  const isUpdating =
    q.trim() !== effectiveQ ||
    manufacturer.trim() !== debouncedManufacturer.trim() ||
    form.trim() !== debouncedForm.trim() ||
    strength.trim() !== debouncedStrength.trim();
  const queryIsCurrent = q.trim() === effectiveQ;
  const shortQuery = q.trim().length > 0 && !isCatalogQueryEnabled(q);
  const visibleData = shouldDisplayCatalogResponse(
    q,
    effectiveQ,
    isPlaceholderData,
  ) ? data : undefined;
  const registry = visibleData?.registryProducts;
  const registryGroups = mergeCatalogVariantPage(
    visibleData?.registryGroups,
    queryIsCurrent ? variantData?.registryGroups : undefined,
    requestedGroupKey,
    requestedTradeNameKey,
  );
  const hasFilters =
    Boolean(manufacturer || form || strength) ||
    compositionType !== "all" || mappingStatus !== "all" || nationalListStatus !== "all" ||
    registrationStatus !== "all";
  const hasResults =
    Boolean(visibleData?.ingredients.length) || Boolean(registry?.items.length) || Boolean(registryGroups?.groups.items.length);
  const viewState = resolveCatalogViewState(
    isCatalogQueryEnabled(effectiveQ) && (isLoading || isUpdating),
    queryIsCurrent && isError,
    hasResults,
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-primary">Пошук препаратів</h1>
        <p className="text-sm text-muted-foreground">
          Переглядайте державний реєстр або шукайте за торговою назвою, МНН,
          виробником, реєстраційним номером, формою чи дозуванням.
        </p>
      </header>

      <Alert className="bg-muted/30">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Реєстровий запис не є медичною рекомендацією</AlertTitle>
        <AlertDescription>
          {REGISTRY_CATALOG_SAFETY_COPY}
        </AlertDescription>
      </Alert>

      <section
        className="flex items-center gap-3 border-y py-3"
        aria-live="polite"
        data-testid="catalog-total"
      >
        <Database className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="font-semibold break-words">
            {data
              ? `Каталог: ${numberFormatter.format(data.catalogTotal)} зареєстровані препарати`
              : "Каталог завантажується..."}
          </p>
          <p className="text-xs text-muted-foreground">
            {data?.runtimeMode === "db"
              ? "Джерело: production PostgreSQL"
              : "Production-каталог очікує підключення; доступний static fallback"}
          </p>
        </div>
      </section>

      <div className="space-y-3">
        <form
          className="relative block"
          onSubmit={(event) => {
            event.preventDefault();
            const nextQ = q.trim();
            if (nextQ === effectiveQ && isCatalogQueryEnabled(nextQ)) {
              void refetch();
            } else {
              setEffectiveQ(nextQ);
            }
          }}
        >
          <label>
          <span className="sr-only">
            Пошук за назвою, МНН, виробником або реєстраційним номером
          </span>
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Назва, МНН, виробник, реєстраційний номер..."
            className="min-h-11 bg-card pl-9 pr-20"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onPaste={(event) => {
              const next = applyPastedQuery(
                q,
                event.currentTarget.selectionStart,
                event.currentTarget.selectionEnd,
                event.clipboardData.getData("text"),
              );
              event.preventDefault();
              setQ(next);
              setEffectiveQ(next.trim());
            }}
            aria-label="Пошук у каталозі препаратів"
            data-testid="input-search-q"
          />
          {shouldShowPrimarySearchSpinner(
            isUpdating,
            isBaseFetching,
            isVariantFetching,
          ) && (
            <LoaderCircle className="absolute right-12 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
          </label>
          <Button
            type="submit"
            size="icon"
            className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2"
            title="Шукати"
            aria-label="Шукати"
          >
            <SearchIcon className="h-4 w-4" />
          </Button>
        </form>

        <div
          className="grid grid-cols-3 gap-1 rounded-md border bg-muted/30 p-1"
          role="tablist"
          aria-label="Тип результатів"
        >
          {SEARCH_TYPES.map((item) => (
            <Button
              key={item.value}
              type="button"
              variant={type === item.value ? "default" : "ghost"}
              className="min-h-11 h-auto whitespace-normal px-2 py-2 text-xs leading-tight sm:text-sm"
              role="tab"
              aria-selected={type === item.value}
              onClick={() => setType(item.value)}
              data-testid={`search-tab-${item.value}`}
            >
              {item.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-md border bg-muted/30 p-1" aria-label="Фільтр за типом складу">
          {([
            ["all", "Усі"],
            ["monotherapy", "Монопрепарати"],
            ["combination", "Комбінації"],
          ] as const).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={compositionType === value ? "secondary" : "ghost"}
              className="min-h-11 h-auto whitespace-normal px-2 py-2 text-xs sm:text-sm"
              onClick={() => setCompositionType(value)}
              aria-pressed={compositionType === value}
            >
              {label}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full justify-between sm:w-auto"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-controls="catalog-filters"
        >
          <span className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Фільтри{hasFilters ? " (активні)" : ""}
          </span>
          {filtersOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>

        {filtersOpen && (
          <div
            id="catalog-filters"
            className="grid gap-3 border-y py-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <label className="space-y-1 text-sm">
              <span className="font-medium">Виробник</span>
              <Input
                value={manufacturer}
                onChange={(event) => setManufacturer(event.target.value)}
                placeholder="Назва виробника"
                className="min-h-11"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Лікарська форма</span>
              <Input
                value={form}
                onChange={(event) => setForm(event.target.value)}
                placeholder="Таблетки, розчин..."
                className="min-h-11"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Дозування / strength</span>
              <Input
                value={strength}
                onChange={(event) => setStrength(event.target.value)}
                placeholder="5 mg, 500 мг..."
                className="min-h-11"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Ingredient mapping</span>
              <Select
                value={mappingStatus}
                onValueChange={(value) => setMappingStatus(value as MappingFilter)}
              >
                <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Усі записи</SelectItem>
                  <SelectItem value="approved">Підтверджені</SelectItem>
                  <SelectItem value="unmapped">Registry-only / непідтверджені</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Національний перелік</span>
              <Select
                value={nationalListStatus}
                onValueChange={(value) => setNationalListStatus(value as NationalListFilter)}
              >
                <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Усі</SelectItem>
                  <SelectItem value="exact">Нацперелік</SelectItem>
                  <SelectItem value="ingredient_only">МНН у Нацпереліку</SelectItem>
                  <SelectItem value="uncertain">Потребує уточнення</SelectItem>
                  <SelectItem value="not_listed">Не в Нацпереліку</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Статус реєстрації</span>
              <Select
                value={registrationStatus}
                onValueChange={(value) =>
                  setRegistrationStatus(value as RegistrationStatus | "all")
                }
              >
                <SelectTrigger className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Усі статуси</SelectItem>
                  <SelectItem value="active">Діюча</SelectItem>
                  <SelectItem value="terminated">Припинена</SelectItem>
                  <SelectItem value="unknown">Не визначено</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {hasFilters ? (
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 w-full"
                  onClick={() => {
                    setManufacturer("");
                    setForm("");
                    setStrength("");
                    setCompositionType("all");
                    setMappingStatus("all");
                    setNationalListStatus("all");
                    setRegistrationStatus("all");
                  }}
                >
                  Очистити фільтри
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {data?.runtimeMode === "static" && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Реєстровий каталог тимчасово недоступний</AlertTitle>
          <AlertDescription>
            Показано локальний довідник. Спробуйте ще раз після запуску
            production DB або завершення Render cold start.
          </AlertDescription>
        </Alert>
      )}

      {viewState === "loading" ? (
        <div className="space-y-3" aria-label="Завантаження каталогу">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-52 w-full rounded-md" />
          ))}
        </div>
      ) : viewState === "error" ? (
        <div className="space-y-4 border-y py-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
          <div>
            <p className="font-semibold">Не вдалося завантажити каталог</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Render може запускатися після паузи. Повторіть запит за кілька секунд.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => void refetch()}
            className="min-h-11"
            data-testid="search-retry"
          >
            <RefreshCw className="h-4 w-4" />
            Спробувати ще раз
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {visibleData?.ingredients.length ? (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">Діючі речовини</h2>
                <p className="text-xs text-muted-foreground">
                  Лише підтверджені внутрішні ingredient mappings.
                </p>
              </div>
              <div className="space-y-3">
                {visibleData.ingredients.map((ingredient) => (
                  <IngredientCard
                    key={ingredient.ingredientId}
                    ingredient={ingredient}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {type !== "ingredients" && registryGroups ? (
            <GroupedRegistryResults
              catalog={registryGroups}
              query={effectiveQ}
              isFetching={isFetching}
              isVariantFetching={isVariantFetching}
              isVariantError={isVariantError}
              selectedTradeNameKey={requestedTradeNameKey}
              onRetryVariants={() => void refetchVariants()}
              onSelectTrade={(groupKey, tradeNameKey) => {
                setSelectedGroupKey(groupKey);
                setSelectedTradeNameKey(tradeNameKey);
                setVariantPage(1);
              }}
              onGroupPage={(nextPage) => {
                setGroupPage(nextPage);
                setSelectedGroupKey(null);
                setSelectedTradeNameKey(null);
                setVariantPage(1);
              }}
              onTradePage={(groupKey, nextPage) => {
                setSelectedGroupKey(groupKey);
                setSelectedTradeNameKey(null);
                setTradePage(nextPage);
                setVariantPage(1);
              }}
              onVariantPage={setVariantPage}
            />
          ) : null}
          {type !== "ingredients" && registry && !registryGroups ? (
            <section className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    Зареєстровані препарати
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Знайдено {numberFormatter.format(registry.total)} записів
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <span>На сторінці</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(value) =>
                      setPageSize(Number(value) === 50 ? 50 : 25)
                    }
                  >
                    <SelectTrigger className="min-h-10 w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>

              <div className="space-y-3">
                {registry.items.map((product) => (
                  <RegistryProductCard
                    key={product.id}
                    product={product}
                    query={effectiveQ}
                  />
                ))}
              </div>

              {registry.totalPages > 0 && (
                <nav
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t pt-4"
                  aria-label="Сторінки каталогу"
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 justify-self-start px-3"
                    disabled={page <= 1 || isFetching}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Попередня</span>
                  </Button>
                  <span className="text-center text-xs text-muted-foreground sm:text-sm">
                    Сторінка {registry.page} з {registry.totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 justify-self-end px-3"
                    disabled={!registry.hasNext || isFetching}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    <span className="hidden sm:inline">Наступна</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </nav>
              )}
            </section>
          ) : null}

          {viewState === "empty" && !shortQuery && (
            <div className="space-y-3 border-y py-10 text-center">
              <SearchIcon className="mx-auto h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-semibold">Нічого не знайдено</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Спробуйте торгову назву без дозування, МНН, виробника або
                  реєстраційний номер.
                </p>
              </div>
              {effectiveQ && (
                <ReportIssueButton
                  type="search_miss"
                  context={`catalog-search-miss:${effectiveQ}`}
                  sourceSnapshot={{
                    query: effectiveQ,
                    type,
                    manufacturer: debouncedManufacturer,
                    form: debouncedForm,
                    registrationStatus,
                  }}
                  compact
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
