import React, { useEffect, useLayoutEffect, useMemo } from "react";
import {
  getSearchCatalogQueryKey,
  useSearchCatalog,
  type RegistryProductResult,
} from "@workspace/api-client-react";
import { useParams } from "wouter";
import {
  ArrowLeft,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  Database,
  ExternalLink,
  GitCompare,
  Pill,
  RefreshCw,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { conciseDosageForm } from "@/pages/search";
import { ProductCompareButton } from "@/components/product-compare-button";
import {
  recordRecentlyViewed,
  removeStaleDrugRef,
  type DrugRef,
  useFavorites,
} from "@/hooks/use-favorites";
import {
  REGISTRY_PRODUCT_ID_PATTERN,
  registrationFromSearch,
  registryProductDetailHref,
} from "@/lib/registry-product-route";
import { nationalListVerdict } from "@/lib/national-list-status";
import {
  conciseManufacturerText,
  manufacturerHeading,
} from "@/lib/manufacturer-display";

export const REGISTRY_PRODUCT_TOP_BAR_CLASS =
  "relative z-0 -mx-4 flex min-h-12 items-center gap-3 border-y bg-background px-4 py-2 sm:mx-0 sm:rounded-xl sm:border lg:sticky lg:top-0 lg:z-30 lg:bg-background/95 lg:shadow-sm lg:backdrop-blur lg:supports-[backdrop-filter]:bg-background/85";

export const REGISTRY_PRODUCT_PAGE_CLASS =
  "mx-auto w-full max-w-6xl space-y-4 overflow-x-clip pb-10 animate-in fade-in duration-300 motion-reduce:animate-none";

export const REGISTRY_PRODUCT_CARD_CLASS =
  "relative isolate max-w-full rounded-2xl border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm";

export const REGISTRY_PRODUCT_TITLE_CLASS =
  "relative z-10 block max-w-full [overflow-wrap:anywhere] text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl";

export type RegistryProductScrollTarget = {
  scrollTo(options: ScrollToOptions): void;
};

export function resetRegistryProductPageScroll(
  target: RegistryProductScrollTarget,
): void {
  target.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function registrationStatusLabel(
  status: RegistryProductResult["registration"]["status"],
): string {
  if (status === "active") return "Чинна реєстрація";
  if (status === "terminated") return "Реєстрацію завершено";
  return "Статус уточнюється";
}

function mappingStatusLabel(
  status: RegistryProductResult["mappingStatus"],
): string {
  if (status === "approved") return "Підтверджено";
  if (status === "ambiguous") return "Потребує уточнення";
  return "Реєстрова позиція без підтвердженого mapping";
}

function manufacturerText(product: RegistryProductResult): string {
  return conciseManufacturerText(product.manufacturers);
}

export function registryProductDrugRef(
  product: RegistryProductResult,
): DrugRef {
  return {
    id: product.id,
    brandName: product.tradeName,
    inn: product.inn || product.activeIngredient,
    dosage: product.strength ?? undefined,
    form: conciseDosageForm(product.dosageForm),
    manufacturer: manufacturerText(product),
    registration: product.registration.number,
    href: registryProductDetailHref(product),
  };
}

function ExpandableSection({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <details
      className="group max-w-full overflow-hidden rounded-2xl border bg-card/80 shadow-sm"
      data-testid={testId}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold sm:px-5">
        <span className="break-words">{title}</span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none group-open:rotate-180" />
      </summary>
      <div className="min-w-0 space-y-3 border-t p-4 text-sm animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none sm:p-5">
        {children}
      </div>
    </details>
  );
}

export function RegistryProductDetailSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-6xl space-y-4 overflow-x-hidden pb-8"
      aria-label="Завантаження препарату"
      data-testid="registry-product-detail-skeleton"
    >
      <div
        className={`${REGISTRY_PRODUCT_TOP_BAR_CLASS} motion-reduce:animate-none`}
      >
        <div className="h-8 w-36 animate-pulse rounded-md bg-primary/10 motion-reduce:animate-none" />
      </div>
      <Card className="max-w-full overflow-hidden rounded-2xl">
        <CardContent className="space-y-5 p-4 sm:p-6">
          <div className="h-10 w-3/4 animate-pulse rounded-lg bg-primary/10 motion-reduce:animate-none" />
          <div className="h-5 w-2/3 animate-pulse rounded-md bg-primary/10 motion-reduce:animate-none" />
          <div className="flex flex-wrap gap-2">
            <div className="h-7 w-20 animate-pulse rounded-full bg-primary/10 motion-reduce:animate-none" />
            <div className="h-7 w-32 animate-pulse rounded-full bg-primary/10 motion-reduce:animate-none" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-12 w-full animate-pulse rounded-lg bg-primary/10 motion-reduce:animate-none"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function RegistryProductDetailContent({
  product,
  favorite,
  onToggleFavorite,
}: {
  product: RegistryProductResult;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const displayForm = conciseDosageForm(product.dosageForm);
  const listVerdict = nationalListVerdict(product.nationalListStatus);
  const detailHref = registryProductDetailHref(product);
  const instructionSourceStatus =
    product.instructionSourceStatus ??
    (product.instructionAvailable ? "structured" : "not_published");
  const officialDocumentUrl = product.officialInstructionDocumentUrl ?? null;

  return (
    <div
      className={REGISTRY_PRODUCT_PAGE_CLASS}
      data-testid={`registry-product-detail-${product.id}`}
    >
      <nav
        className={REGISTRY_PRODUCT_TOP_BAR_CLASS}
        aria-label="Навігація препарату"
      >
        <a
          href="/search?type=registry_products"
          className="flex min-h-10 min-w-0 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-primary/10"
          data-testid="back-to-search"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className="truncate">До пошуку</span>
        </a>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground sm:text-sm">
          {product.registration.number}
        </span>
      </nav>

      <Card className={REGISTRY_PRODUCT_CARD_CLASS}>
        <CardContent className="min-w-0 space-y-5 p-4 sm:p-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="relative z-10 shrink-0 rounded-xl bg-primary/10 p-2.5">
              <Pill className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h1
                className={REGISTRY_PRODUCT_TITLE_CLASS}
                data-testid="registry-product-name"
              >
                {product.tradeName}
              </h1>
              <p className="mt-2 break-words text-base text-muted-foreground">
                <span className="font-medium text-foreground">
                  МНН / склад:
                </span>{" "}
                {product.inn || product.activeIngredient || "Не зазначено"}
              </p>
            </div>
          </div>

          <div
            className="flex min-w-0 flex-wrap gap-2"
            aria-label="Дозування та лікарська форма"
          >
            {product.strength ? (
              <Badge
                className="max-w-full whitespace-normal px-3 py-1 text-sm"
                data-testid="product-strength-chip"
              >
                {product.strength}
              </Badge>
            ) : null}
            {displayForm ? (
              <Badge
                variant="secondary"
                className="max-w-full whitespace-normal px-3 py-1 text-sm"
                data-testid="product-form-badge"
              >
                {displayForm}
              </Badge>
            ) : null}
          </div>

          <dl className="grid min-w-0 gap-3 rounded-xl border bg-background/60 p-3 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {manufacturerHeading(product.manufacturers)}
              </dt>
              <dd className="mt-1 break-words font-medium">
                {manufacturerText(product)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Реєстраційний номер
              </dt>
              <dd
                className="mt-1 break-words font-medium"
                data-testid="product-registration-number"
              >
                {product.registration.number}
              </dd>
            </div>
          </dl>

          <div
            className="flex min-w-0 flex-wrap gap-2"
            aria-label="Статуси препарату"
          >
            <Badge variant="secondary" className="gap-1.5 whitespace-normal">
              <Database className="h-3.5 w-3.5" />
              Реєстр
            </Badge>
            <Badge
              variant={listVerdict.isConfirmed ? "default" : "outline"}
              className="gap-1.5 whitespace-normal text-left"
              data-testid="national-list-badge"
            >
              {listVerdict.isConfirmed ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : null}
              {listVerdict.shortLabel}
            </Badge>
            {product.instructionAvailable || officialDocumentUrl ? (
              <Badge
                variant="outline"
                className="gap-1.5 whitespace-normal border-primary/40 text-primary"
                data-testid="instruction-available-badge"
              >
                <BookOpenText className="h-3.5 w-3.5" />
                {product.instructionAvailable
                  ? "Є інструкція"
                  : "Є офіційний документ ДРЛЗ"}
              </Badge>
            ) : null}
          </div>

          <div
            className="grid min-w-0 grid-cols-2 gap-2"
            data-testid="registry-product-primary-actions"
          >
            {product.instructionAvailable ? (
              <Button
                asChild
                size="lg"
                className="col-span-2 min-h-12 min-w-0 whitespace-normal sm:col-span-1"
              >
                <a
                  href={`/instructions/${product.id}`}
                  data-testid="detail-instruction-action"
                >
                  <BookOpenText className="h-5 w-5 shrink-0" />
                  Інструкція
                </a>
              </Button>
            ) : officialDocumentUrl &&
              instructionSourceStatus === "official_document" ? (
              <Button
                asChild
                size="lg"
                variant="outline"
                className="col-span-2 min-h-12 min-w-0 whitespace-normal sm:col-span-1"
              >
                <a
                  href={officialDocumentUrl}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="detail-official-instruction-document"
                >
                  <ExternalLink className="h-5 w-5 shrink-0" />
                  Офіційна інструкція ДРЛЗ
                </a>
              </Button>
            ) : (
              <Button
                size="lg"
                disabled
                className="col-span-2 min-h-12 min-w-0 whitespace-normal sm:col-span-1"
                data-testid="detail-instruction-unavailable"
              >
                <BookOpenText className="h-5 w-5 shrink-0" />
                {instructionSourceStatus === "invalid_source"
                  ? "Документ ДРЛЗ потребує перевірки"
                  : "ДРЛЗ не оприлюднив інструкцію"}
              </Button>
            )}
            <Button
              asChild
              size="lg"
              variant="outline"
              className="min-h-12 min-w-0 whitespace-normal"
            >
              <a href="/interactions" data-testid="detail-interactions-action">
                <GitCompare className="h-5 w-5 shrink-0" />
                Взаємодії
              </a>
            </Button>
            <ProductCompareButton
              product={product}
              conciseForm={displayForm}
              size="lg"
              className="min-h-12 min-w-0 whitespace-normal"
              testId="detail-compare-action"
            />
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="min-h-12 min-w-0 whitespace-normal"
              onClick={onToggleFavorite}
              aria-pressed={favorite}
              data-testid="detail-favorite-action"
            >
              <Star
                className={`h-5 w-5 shrink-0 ${favorite ? "fill-amber-400 text-amber-400" : ""}`}
              />
              {favorite ? "В обраному" : "В обране"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <section
        className="grid max-w-full gap-3"
        aria-label="Додаткова інформація"
      >
        <ExpandableSection
          title="Реєстрація та виробник"
          testId="registration-details"
        >
          <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Статус</dt>
              <dd className="break-words">
                {registrationStatusLabel(product.registration.status)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Початок реєстрації
              </dt>
              <dd>{product.registration.startDate || "Не зазначено"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Закінчення реєстрації
              </dt>
              <dd>{product.registration.endDate || "Не зазначено"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {manufacturerHeading(product.manufacturers)}
              </dt>
              <dd className="break-words">{manufacturerText(product)}</dd>
            </div>
          </dl>
        </ExpandableSection>

        <ExpandableSection
          title="Національний перелік"
          testId="national-list-details"
        >
          <div
            className="space-y-2 rounded-xl border bg-background/60 p-3"
            data-testid="national-list-verdict"
          >
            <p className="break-words font-semibold">{listVerdict.label}</p>
            <p className="break-words text-sm text-muted-foreground">
              {listVerdict.description}
            </p>
            <p className="break-words text-xs text-muted-foreground">
              Перевірено для реєстрової позиції {product.registration.number}.
            </p>
          </div>
          {product.nationalListSection ? (
            <p>
              <span className="text-muted-foreground">Розділ:</span>{" "}
              {product.nationalListSection}
            </p>
          ) : null}
          {product.nationalListSource ? (
            <a
              className="inline-flex break-all text-primary underline underline-offset-4"
              href={product.nationalListSource.url}
              target="_blank"
              rel="noreferrer"
            >
              Офіційне джерело Нацпереліку
            </a>
          ) : null}
        </ExpandableSection>

        <ExpandableSection
          title="Детальніше"
          testId="registry-technical-details"
        >
          <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">ATC</dt>
              <dd className="break-words">
                {product.atcCode || "Не зазначено"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Статус зіставлення
              </dt>
              <dd className="break-words">
                {mappingStatusLabel(product.mappingStatus)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Джерело</dt>
              <dd className="break-words">{product.source.label}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Джерельних записів
              </dt>
              <dd>{product.sourceRecordCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Product ID</dt>
              <dd className="break-all font-mono text-xs">{product.id}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Маршрут</dt>
              <dd className="break-all text-xs">{detailHref}</dd>
            </div>
          </dl>
        </ExpandableSection>
      </section>
    </div>
  );
}

function RegistryProductError({ invalid = false }: { invalid?: boolean }) {
  return (
    <div
      className="max-w-full space-y-4 overflow-x-hidden py-10 text-center"
      role="alert"
    >
      <p className="font-semibold">
        {invalid ? "Некоректне посилання на препарат" : "Препарат не знайдено"}
      </p>
      <p className="text-sm text-muted-foreground">
        Поверніться до пошуку та відкрийте конкретну реєстрову позицію ще раз.
      </p>
      <Button asChild variant="outline">
        <a href="/search?type=registry_products">
          <ArrowLeft className="h-4 w-4" />
          До пошуку
        </a>
      </Button>
    </div>
  );
}

export function registryProductDetailSearchParams(
  productId: string,
  registration: string,
) {
  return {
    q: registration,
    productId,
    type: "registry_products" as const,
    view: "grouped" as const,
    page: 1,
    pageSize: 25,
  };
}

export default function RegistryProductDetail() {
  const { productId = "" } = useParams<{ productId: string }>();
  const registration = registrationFromSearch(
    typeof window === "undefined" ? "" : window.location.search,
  );
  const validRoute =
    REGISTRY_PRODUCT_ID_PATTERN.test(productId) && Boolean(registration);

  useLayoutEffect(() => {
    resetRegistryProductPageScroll(window);
  }, [productId, registration]);

  const params = useMemo(
    () => registryProductDetailSearchParams(productId, registration),
    [productId, registration],
  );
  const { data, isLoading, isError, refetch } = useSearchCatalog(params, {
    query: {
      enabled: validRoute,
      queryKey: getSearchCatalogQueryKey(params),
      staleTime: 60_000,
      retry: 1,
    },
  });
  const product = data?.registryProducts.items.find(
    (item) =>
      item.id === productId && item.registration.number === registration,
  );
  const { isFavorite, toggleFavorite } = useFavorites();

  useEffect(() => {
    if (!product) return;
    recordRecentlyViewed(registryProductDrugRef(product));
  }, [product]);

  useEffect(() => {
    if (!validRoute || isLoading || isError || !data || product) return;
    removeStaleDrugRef(
      productId,
      registryProductDetailHref({
        id: productId,
        registration: { number: registration },
      }),
    );
  }, [data, isError, isLoading, product, productId, registration, validRoute]);

  if (!validRoute) return <RegistryProductError invalid />;
  if (isLoading) return <RegistryProductDetailSkeleton />;
  if (isError) {
    return (
      <div
        className="max-w-full space-y-4 overflow-x-hidden py-10 text-center"
        role="alert"
      >
        <p className="font-semibold">Не вдалося завантажити препарат</p>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          <RefreshCw className="h-4 w-4" />
          Спробувати ще раз
        </Button>
      </div>
    );
  }
  if (!product) return <RegistryProductError />;

  return (
    <RegistryProductDetailContent
      product={product}
      favorite={isFavorite(product.id)}
      onToggleFavorite={() => toggleFavorite(registryProductDrugRef(product))}
    />
  );
}
