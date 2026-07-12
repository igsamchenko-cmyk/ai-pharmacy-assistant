import React, { useEffect, useMemo, useState } from "react";
import {
  getSearchCatalogQueryKey,
  useSearchCatalog,
  type CatalogIngredientResult,
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

type SearchType = "all" | "ingredients" | "registry_products";
type RegistrationStatus = "active" | "terminated" | "unknown";
type PageSize = 25 | 50;

const SEARCH_TYPES: Array<{ value: SearchType; label: string }> = [
  { value: "all", label: "Усі" },
  { value: "ingredients", label: "Діючі речовини" },
  { value: "registry_products", label: "Зареєстровані препарати" },
];

const numberFormatter = new Intl.NumberFormat("uk-UA");

export const REGISTRY_CATALOG_SAFETY_COPY =
  "Наявність препарату в реєстрі не підтверджує взаємозамінність, відсутність взаємодій або доцільність застосування.";

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
            </div>
          </div>
        </div>

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

        {showReportIssue && (
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
        )}
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

export default function SearchPage() {
  const initial = useMemo(initialSearchState, []);
  const [q, setQ] = useState(initial.q);
  const [type, setType] = useState<SearchType>(initial.type);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [manufacturer, setManufacturer] = useState("");
  const [form, setForm] = useState("");
  const [registrationStatus, setRegistrationStatus] =
    useState<RegistrationStatus | "all">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const debouncedQ = useDebounce(q, 300);
  const debouncedManufacturer = useDebounce(manufacturer, 300);
  const debouncedForm = useDebounce(form, 300);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedQ,
    debouncedManufacturer,
    debouncedForm,
    registrationStatus,
    type,
    pageSize,
  ]);

  const params = useMemo(
    () => ({
      q: debouncedQ.trim(),
      type,
      page,
      pageSize,
      ...(debouncedManufacturer.trim()
        ? { manufacturer: debouncedManufacturer.trim() }
        : {}),
      ...(debouncedForm.trim() ? { form: debouncedForm.trim() } : {}),
      ...(registrationStatus !== "all" ? { registrationStatus } : {}),
    }),
    [
      debouncedQ,
      type,
      page,
      pageSize,
      debouncedManufacturer,
      debouncedForm,
      registrationStatus,
    ],
  );

  const {
    data,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useSearchCatalog(params, {
    query: {
      queryKey: getSearchCatalogQueryKey(params),
      retry: 2,
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 4_000),
      staleTime: 15_000,
    },
  });

  const isUpdating =
    q.trim() !== debouncedQ.trim() ||
    manufacturer.trim() !== debouncedManufacturer.trim() ||
    form.trim() !== debouncedForm.trim();
  const registry = data?.registryProducts;
  const hasFilters =
    Boolean(manufacturer || form) || registrationStatus !== "all";
  const hasResults =
    Boolean(data?.ingredients.length) || Boolean(registry?.items.length);
  const viewState = resolveCatalogViewState(isLoading, isError, hasResults);

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
        <label className="relative block">
          <span className="sr-only">
            Пошук за назвою, МНН, виробником або реєстраційним номером
          </span>
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Назва, МНН, виробник, реєстраційний номер..."
            className="min-h-11 bg-card pl-9"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            aria-label="Пошук у каталозі препаратів"
            data-testid="input-search-q"
          />
          {(isUpdating || isFetching) && (
            <LoaderCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </label>

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
            className="grid gap-3 border-y py-4 sm:grid-cols-3"
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
          {data?.ingredients.length ? (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">Діючі речовини</h2>
                <p className="text-xs text-muted-foreground">
                  Лише підтверджені внутрішні ingredient mappings.
                </p>
              </div>
              <div className="space-y-3">
                {data.ingredients.map((ingredient) => (
                  <IngredientCard
                    key={ingredient.ingredientId}
                    ingredient={ingredient}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {type !== "ingredients" && registry ? (
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
                    query={debouncedQ}
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

          {viewState === "empty" && (
            <div className="space-y-3 border-y py-10 text-center">
              <SearchIcon className="mx-auto h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-semibold">Нічого не знайдено</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Спробуйте торгову назву без дозування, МНН, виробника або
                  реєстраційний номер.
                </p>
              </div>
              {debouncedQ && (
                <ReportIssueButton
                  type="search_miss"
                  context={`catalog-search-miss:${debouncedQ}`}
                  sourceSnapshot={{
                    query: debouncedQ,
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
