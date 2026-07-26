import { useMemo, useState } from "react";
import {
  getSearchCatalogQueryKey,
  useSearchCatalog,
  type RegistryProductResult,
} from "@workspace/api-client-react";
import type { CatalogClientIndexProduct } from "@workspace/catalog-index";
import { Database, Search } from "lucide-react";
import { useCatalogClientIndex } from "@/lib/catalog-client-index";
import { useDebounce } from "@/hooks/use-debounce";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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

export function uniqueInteractionOptions(
  products: readonly InteractionProductSelection[],
): InteractionProductSelection[] {
  const seen = new Set<string>();
  return products.filter((product) => {
    const key = `${product.productId}|${product.registration}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function RegistryInteractionSearchSelect({
  onSelect,
  disabled = false,
}: {
  onSelect: (product: InteractionProductSelection) => void;
  disabled?: boolean;
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
    () => clientCatalog.search(query.trim(), { limit: 25 }),
    [clientCatalog, query],
  );
  const options = useMemo(
    () =>
      uniqueInteractionOptions(
        localReady
          ? localResult.items.map((item) => item.product)
          : (fallback.data?.registryProducts.items ?? []).map(
              fromServerProduct,
            ),
      ),
    [fallback.data, localReady, localResult.items],
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

  return (
    <div className="relative max-w-full space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor="interaction-product-search"
          className="text-sm font-semibold"
        >
          Знайти конкретну реєстрову позицію
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
          id="interaction-product-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={disabled}
          placeholder="Назва, МНН або реєстраційний номер"
          className="min-h-12 max-w-full pl-9"
          autoComplete="off"
          data-testid="input-interaction-search"
        />
      </div>
      {showResults ? (
        <Card className="absolute z-20 mt-1 max-h-80 w-full max-w-full overflow-y-auto shadow-xl">
          <CardContent className="space-y-1 p-2">
            {loading ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Пошук…
              </p>
            ) : options.length ? (
              options.map((product) => (
                <button
                  key={`${product.productId}:${product.registration}`}
                  type="button"
                  onClick={() => select(product)}
                  className="grid w-full min-w-0 gap-1 rounded-lg px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  data-testid={`btn-add-product-${product.productId}`}
                >
                  <span className="break-words font-semibold">
                    {product.tradeName}
                  </span>
                  <span className="break-words text-xs text-muted-foreground">
                    {[product.strength, product.form]
                      .filter(Boolean)
                      .join(" · ") || "Форма не вказана"}
                  </span>
                  <span className="break-all text-xs text-muted-foreground">
                    {product.registration} · {product.inn || "Склад не вказано"}
                  </span>
                </button>
              ))
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
