import { useEffect, useMemo, useState } from "react";
import {
  getSearchCatalogQueryKey,
  useSearchCatalog,
  type RegistryProductResult,
} from "@workspace/api-client-react";
import type {
  CatalogClientIndexProduct,
  CatalogNormalizedCandidate,
} from "@workspace/catalog-index";
import { Database, Search } from "lucide-react";
import {
  useCatalogClientIndex,
  useCatalogClientNormalizedSearch,
} from "@/lib/catalog-client-index";
import { useDebounce } from "@/hooks/use-debounce";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { markFirstResult } from "@/lib/search-metrics";

export type InteractionProductSelection = CatalogClientIndexProduct;

function fromServerProduct(
  product: RegistryProductResult,
): InteractionProductSelection {
  return {
    productId: product.id,
    registration: product.registration.number,
    tradeName: product.tradeName,
    inn: product.inn || product.activeIngredient,
    form: product.dosageForm,
    strength: product.strength ?? "",
  };
}

function interactionIdentity(product: InteractionProductSelection): string {
  return `${product.productId}|${product.registration}`;
}

export function uniqueInteractionOptions(
  products: readonly InteractionProductSelection[],
): InteractionProductSelection[] {
  const seen = new Set<string>();
  return products.filter((product) => {
    const key = interactionIdentity(product);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function candidateCorrections(
  candidates: readonly CatalogNormalizedCandidate[],
): Map<string, string> {
  return new Map(
    candidates.flatMap((candidate) =>
      candidate.correctedQuery
        ? [[interactionIdentity(candidate.product), candidate.correctedQuery]]
        : [],
    ),
  );
}

function ProductOption({
  product,
  correctedQuery,
  suggested = false,
  onSelect,
}: {
  product: InteractionProductSelection;
  correctedQuery?: string;
  suggested?: boolean;
  onSelect: (product: InteractionProductSelection) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className="grid w-full min-w-0 gap-1 rounded-lg px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
      data-testid={`btn-add-product-${product.productId}`}
    >
      <span className="flex flex-wrap items-center gap-2 break-words font-semibold">
        {product.tradeName}
        {correctedQuery ? (
          <Badge
            variant={suggested ? "secondary" : "outline"}
            className="max-w-full whitespace-normal break-all text-left"
          >
            {suggested ? "Виправлено" : "Розкладку виправлено"}:{" "}
            {correctedQuery}
          </Badge>
        ) : null}
      </span>
      <span className="break-words text-xs text-muted-foreground">
        {[product.strength, product.form].filter(Boolean).join(" · ") ||
          "Форма не вказана"}
      </span>
      <span className="break-all text-xs text-muted-foreground">
        {product.registration} · {product.inn || "Склад не вказано"}
      </span>
    </button>
  );
}

export function RegistryInteractionSearchSelect({
  onSelect,
  disabled = false,
  label = "Знайти конкретну реєстрову позицію",
  placeholder = "Назва, МНН або реєстраційний номер",
  inputTestId = "input-interaction-search",
}: {
  onSelect: (product: InteractionProductSelection) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  inputTestId?: string;
}) {
  const [query, setQuery] = useState("");
  const clientCatalog = useCatalogClientIndex();
  const debouncedQuery = useDebounce(query.trim(), 250);
  const localReady = clientCatalog.status === "ready";
  const fallbackEnabled =
    clientCatalog.status === "error" && debouncedQuery.length > 0;
  const fallbackParams = {
    q: debouncedQuery,
    type: "registry_products" as const,
    view: "flat" as const,
    page: 1,
    pageSize: 25,
  };
  const fallback = useSearchCatalog(fallbackParams, {
    query: {
      enabled: fallbackEnabled,
      queryKey: getSearchCatalogQueryKey(fallbackParams),
      retry: false,
    },
  });
  const localResult = useMemo(
    () =>
      clientCatalog.search(query.trim(), {
        limit: 25,
        scope: "registry_products",
      }),
    [clientCatalog, query],
  );
  const normalizedLocalResult = useCatalogClientNormalizedSearch(
    query.trim(),
    {
      limit: 25,
      scope: "registry_products",
    },
    localResult.items.length,
  );
  const primaryCandidates = normalizedLocalResult?.primary ?? [];
  const primaryCorrections = useMemo(
    () => candidateCorrections(primaryCandidates),
    [primaryCandidates],
  );
  const options = useMemo(
    () =>
      uniqueInteractionOptions(
        localReady
          ? (normalizedLocalResult?.primary ?? localResult.items).map(
              (item) => item.product,
            )
          : (fallback.data?.registryProducts.items ?? []).map(
              fromServerProduct,
            ),
      ),
    [fallback.data, localReady, localResult.items, normalizedLocalResult],
  );
  const suggestedCandidates = normalizedLocalResult?.suggested ?? [];
  const suggestedOptions = useMemo(
    () =>
      uniqueInteractionOptions(
        suggestedCandidates.map((candidate) => candidate.product),
      ),
    [suggestedCandidates],
  );
  const suggestedCorrections = useMemo(
    () => candidateCorrections(suggestedCandidates),
    [suggestedCandidates],
  );

  const select = (product: InteractionProductSelection) => {
    onSelect(product);
    setQuery("");
  };
  const showResults = query.trim().length > 0;
  const loading =
    clientCatalog.status === "loading" ||
    clientCatalog.status === "idle" ||
    (fallbackEnabled && fallback.isLoading);
  const renderedOptions = options.length + suggestedOptions.length;

  useEffect(() => {
    if (showResults && !loading && renderedOptions > 0) {
      markFirstResult(query);
    }
  }, [loading, query, renderedOptions, showResults]);

  return (
    <div className="relative max-w-full space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={inputTestId} className="text-sm font-semibold">
          {label}
        </label>
        <Badge variant={localReady ? "secondary" : "outline"} className="gap-1">
          <Database className="h-3.5 w-3.5" />
          {localReady
            ? `Каталог готовий · ${clientCatalog.productCount.toLocaleString("uk-UA")}`
            : clientCatalog.status === "error"
              ? "Серверний резервний пошук"
              : "Каталог завантажується"}
        </Badge>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={inputTestId}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className="min-h-12 max-w-full pl-9"
          autoComplete="off"
          data-testid={inputTestId}
        />
      </div>
      {showResults ? (
        <Card className="relative z-20 mt-1 max-h-80 w-full max-w-full overflow-y-auto shadow-xl">
          <CardContent className="space-y-1 p-2">
            {loading ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Пошук…
              </p>
            ) : renderedOptions ? (
              <>
                {options.map((product) => (
                  <ProductOption
                    key={interactionIdentity(product)}
                    product={product}
                    correctedQuery={primaryCorrections.get(
                      interactionIdentity(product),
                    )}
                    onSelect={select}
                  />
                ))}
                {suggestedOptions.length ? (
                  <section
                    className="mt-2 space-y-1 border-t border-primary/30 pt-2"
                    data-testid="interaction-suggested-results"
                  >
                    <p className="px-3 py-1 text-sm font-semibold">
                      Можливо, ви шукали:
                    </p>
                    {suggestedOptions.map((product) => (
                      <ProductOption
                        key={`suggested-${interactionIdentity(product)}`}
                        product={product}
                        correctedQuery={suggestedCorrections.get(
                          interactionIdentity(product),
                        )}
                        suggested
                        onSelect={select}
                      />
                    ))}
                  </section>
                ) : null}
              </>
            ) : (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Нічого не знайдено
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
