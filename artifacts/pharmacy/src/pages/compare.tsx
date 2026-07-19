import React, { useMemo, useState } from "react";
import {
  getGetDrugInstructionQueryKey,
  getSearchCatalogQueryKey,
  useGetDrugInstruction,
  useSearchCatalog,
  type DrugInstruction,
  type RegistryProductResult,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  BookOpenText,
  Columns3,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import {
  comparisonProductFromRegistry,
  type ComparisonProductRef,
  useProductComparison,
} from "@/hooks/use-product-comparison";
import { conciseDosageForm } from "@/pages/search";

const NO_DATA = "Немає даних";

type InstructionSectionKey =
  | "indications"
  | "contraindications"
  | "interactions"
  | "specialWarnings";

interface ComparisonInstructions {
  [productId: string]: DrugInstruction | null | undefined;
}

export function exactComparisonInstruction(
  product: ComparisonProductRef,
  instruction: DrugInstruction | null | undefined,
): DrugInstruction | null {
  if (
    !instruction ||
    instruction.registryProductId !== product.productId ||
    instruction.registrationNumber !== product.registrationNumber
  ) {
    return null;
  }
  return instruction;
}

function present(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized ? normalized : NO_DATA;
}

function nationalListLabel(status: ComparisonProductRef["nationalListStatus"]): string {
  if (status === "exact") return "У Нацпереліку";
  if (status === "ingredient_only") return "МНН є; форму й дозування не підтверджено";
  if (status === "not_listed") return "Не в Нацпереліку";
  if (status === "uncertain") return "Потребує уточнення";
  return NO_DATA;
}

function BasicValue({ value }: { value: string | null | undefined }) {
  const text = present(value);
  return (
    <p className={text === NO_DATA ? "text-muted-foreground" : "break-words text-foreground"}>
      {text}
    </p>
  );
}

function LongValue({
  value,
  loading,
  label,
}: {
  value: string | null | undefined;
  loading: boolean;
  label: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-label={`Завантаження: ${label}`}>
        <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
        Завантаження…
      </div>
    );
  }
  if (!value?.trim()) return <p className="text-muted-foreground">{NO_DATA}</p>;
  return (
    <details className="group max-w-full overflow-hidden rounded-xl border bg-background/60">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium">
        Показати текст
        <BookOpenText className="h-4 w-4 shrink-0 text-primary" />
      </summary>
      <p className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words border-t px-3 py-3 text-sm leading-relaxed">
        {value}
      </p>
    </details>
  );
}

function ComparisonRow({
  label,
  products,
  value,
  long = false,
  loadingIds,
}: {
  label: string;
  products: ComparisonProductRef[];
  value: (product: ComparisonProductRef) => string | null | undefined;
  long?: boolean;
  loadingIds: ReadonlySet<string>;
}) {
  return (
    <section className="max-w-full overflow-hidden rounded-2xl border bg-card/70" data-testid="comparison-row">
      <h3 className="border-b bg-muted/35 px-3 py-2 text-sm font-semibold">{label}</h3>
      <div className="grid min-w-0 gap-0 sm:grid-cols-2">
        {products.map((product, index) => (
          <div
            key={product.productId}
            className={`min-w-0 p-3 ${index > 0 ? "border-t sm:border-l sm:border-t-0" : ""}`}
          >
            <p className="mb-2 truncate text-xs font-semibold text-primary">{product.tradeName}</p>
            {long ? (
              <LongValue
                value={value(product)}
                loading={loadingIds.has(product.productId)}
                label={`${label} — ${product.tradeName}`}
              />
            ) : (
              <BasicValue value={value(product)} />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function ProductComparisonGrid({
  products,
  instructions,
  loadingIds = [],
}: {
  products: ComparisonProductRef[];
  instructions: ComparisonInstructions;
  loadingIds?: string[];
}) {
  const exactInstructions = Object.fromEntries(
    products.map((product) => [
      product.productId,
      exactComparisonInstruction(product, instructions[product.productId]),
    ]),
  ) as Record<string, DrugInstruction | null>;
  const loadingSet = new Set(loadingIds);
  const sectionValue = (key: InstructionSectionKey) => (product: ComparisonProductRef) =>
    exactInstructions[product.productId]?.sections[key];

  return (
    <div className="grid max-w-full gap-3 overflow-x-hidden" data-testid="product-comparison-grid">
      <ComparisonRow label="Торгова назва" products={products} value={(product) => product.tradeName} loadingIds={loadingSet} />
      <ComparisonRow label="МНН / склад" products={products} value={(product) => product.inn || product.activeIngredient} loadingIds={loadingSet} />
      <ComparisonRow label="Дозування" products={products} value={(product) => product.strength} loadingIds={loadingSet} />
      <ComparisonRow label="Форма" products={products} value={(product) => product.dosageForm} loadingIds={loadingSet} />
      <ComparisonRow label="Виробник" products={products} value={(product) => product.manufacturer} loadingIds={loadingSet} />
      <ComparisonRow label="Реєстраційний номер" products={products} value={(product) => product.registrationNumber} loadingIds={loadingSet} />
      <ComparisonRow label="Нацперелік" products={products} value={(product) => nationalListLabel(product.nationalListStatus)} loadingIds={loadingSet} />
      <ComparisonRow label="Офіційна інструкція" products={products} value={(product) => product.instructionAvailable ? "Є інструкція" : NO_DATA} loadingIds={loadingSet} />
      <ComparisonRow label="Показання" products={products} value={sectionValue("indications")} long loadingIds={loadingSet} />
      <ComparisonRow label="Протипоказання" products={products} value={sectionValue("contraindications")} long loadingIds={loadingSet} />
      <ComparisonRow label="Взаємодії" products={products} value={sectionValue("interactions")} long loadingIds={loadingSet} />
      <ComparisonRow label="Особливості застосування" products={products} value={sectionValue("specialWarnings")} long loadingIds={loadingSet} />
    </div>
  );
}

function SelectedProduct({
  product,
  onRemove,
}: {
  product: ComparisonProductRef;
  onRemove: (productId: string) => void;
}) {
  return (
    <Card className="max-w-full overflow-hidden rounded-2xl">
      <CardContent className="flex min-w-0 items-start gap-3 p-4">
        <a href={product.href} className="min-w-0 flex-1">
          <p className="break-words font-bold text-foreground">{product.tradeName}</p>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {[product.strength, product.dosageForm].filter(Boolean).join(" · ") || NO_DATA}
          </p>
          <p className="mt-1 break-words text-xs text-muted-foreground">{product.registrationNumber}</p>
        </a>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="shrink-0"
          onClick={() => onRemove(product.productId)}
          aria-label={`Прибрати ${product.tradeName} з порівняння`}
        >
          <X className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function RegistryPicker() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query.trim(), 175);
  const { addProduct, isFull, isSelected } = useProductComparison();
  const params = useMemo(
    () => ({
      q: debouncedQuery,
      type: "registry_products" as const,
      view: "flat" as const,
      page: 1,
      pageSize: 25 as const,
    }),
    [debouncedQuery],
  );
  const enabled = debouncedQuery.length >= 3 && !isFull;
  const { data, isLoading, isError } = useSearchCatalog(params, {
    query: {
      queryKey: getSearchCatalogQueryKey(params),
      enabled,
      retry: false,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  });
  const products = data?.registryProducts.items ?? [];

  if (isFull) {
    return (
      <p className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Обрано максимум — два препарати. Приберіть один, щоб додати інший.
      </p>
    );
  }

  return (
    <section className="space-y-3" aria-label="Додати препарат до порівняння">
      <label htmlFor="comparison-search" className="text-sm font-semibold">
        Знайти конкретну реєстрову позицію
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <Input
          id="comparison-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Назва або реєстраційний номер"
          className="min-h-11 pl-9"
          data-testid="input-compare-search"
        />
      </div>
      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          Пошук…
        </p>
      ) : null}
      {isError ? (
        <p className="text-sm text-destructive">Не вдалося завантажити результати.</p>
      ) : null}
      {enabled && !isLoading && !isError && products.length === 0 ? (
        <p className="text-sm text-muted-foreground">Реєстрових позицій не знайдено.</p>
      ) : null}
      <div className="grid max-w-full gap-2">
        {products.map((product: RegistryProductResult) => {
          const selected = isSelected(product.id);
          return (
            <Card key={product.id} className="max-w-full overflow-hidden">
              <CardContent className="flex min-w-0 items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold">{product.tradeName}</p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {[product.strength, conciseDosageForm(product.dosageForm)].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {product.registration.number}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={selected}
                  onClick={() => {
                    addProduct(comparisonProductFromRegistry(product, conciseDosageForm(product.dosageForm)));
                    setQuery("");
                  }}
                  data-testid={`btn-add-compare-${product.id}`}
                >
                  <Plus className="h-4 w-4" />
                  {selected ? "Додано" : "Додати"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

export default function Compare() {
  const { products, removeProduct, clear } = useProductComparison();
  const first = products[0];
  const second = products[1];

  const firstInstruction = useGetDrugInstruction(first?.productId ?? "", {
    query: {
      queryKey: getGetDrugInstructionQueryKey(first?.productId ?? ""),
      enabled: Boolean(first?.instructionAvailable),
      retry: false,
      staleTime: 6 * 60 * 60 * 1_000,
    },
  });
  const secondInstruction = useGetDrugInstruction(second?.productId ?? "", {
    query: {
      queryKey: getGetDrugInstructionQueryKey(second?.productId ?? ""),
      enabled: Boolean(second?.instructionAvailable),
      retry: false,
      staleTime: 6 * 60 * 60 * 1_000,
    },
  });

  const instructions: ComparisonInstructions = {
    ...(first ? { [first.productId]: firstInstruction.data } : {}),
    ...(second ? { [second.productId]: secondInstruction.data } : {}),
  };
  const loadingIds = [
    ...(first?.instructionAvailable && firstInstruction.isLoading ? [first.productId] : []),
    ...(second?.instructionAvailable && secondInstruction.isLoading ? [second.productId] : []),
  ];

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 overflow-x-hidden pb-16">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Columns3 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-primary">Порівняння препаратів</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Оберіть дві конкретні реєстрові позиції. Дані показані поруч без оцінки взаємозамінності.
        </p>
      </header>

      <Alert className="border-amber-500/35 bg-amber-500/5">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Важливо</AlertTitle>
        <AlertDescription>
          Це інформаційне порівняння не є висновком про терапевтичну взаємозамінність.
          Не змінюйте лікування без консультації лікаря.
        </AlertDescription>
      </Alert>

      <section className="space-y-3" aria-label="Обрані препарати">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Обрано {products.length} з 2</h2>
          {products.length > 0 ? (
            <Button type="button" size="sm" variant="ghost" onClick={clear}>
              <Trash2 className="h-4 w-4" />
              Очистити
            </Button>
          ) : null}
        </div>
        {products.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <Columns3 className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">Ще нічого не додано</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Додайте препарат із пошуку, його сторінки або знайдіть нижче.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {products.map((product) => (
              <SelectedProduct key={product.productId} product={product} onRemove={removeProduct} />
            ))}
          </div>
        )}
      </section>

      <RegistryPicker />

      {products.length === 2 ? (
        <section className="space-y-3" aria-label="Результат порівняння">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">2 точні реєстрові позиції</Badge>
            <Badge variant="outline">Довгі тексти згорнуті</Badge>
          </div>
          <ProductComparisonGrid
            products={products}
            instructions={instructions}
            loadingIds={loadingIds}
          />
        </section>
      ) : (
        <p className="rounded-xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
          Додайте ще {2 - products.length} препарат, щоб побачити порівняння.
        </p>
      )}
    </main>
  );
}