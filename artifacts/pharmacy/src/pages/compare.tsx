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
  Trash2,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EvidenceComparisonExperience } from "@/components/evidence-comparison-panel";
import {
  RegistryInteractionSearchSelect,
  type InteractionProductSelection,
} from "@/components/registry-interaction-search-select";
import {
  comparisonProductFromRegistry,
  type ComparisonProductRef,
  useProductComparison,
} from "@/hooks/use-product-comparison";
import { resolveEvidenceComparison } from "@/lib/evidence-comparisons";
import { registryProductDetailHref } from "@/lib/registry-product-route";
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

export function exactComparisonProductSearchParams(
  product: ComparisonProductRef | undefined,
) {
  return {
    q: product?.registrationNumber ?? "",
    ...(product ? { productId: product.productId } : {}),
    type: "registry_products" as const,
    view: "grouped" as const,
    page: 1,
    pageSize: 25,
  };
}

export function exactComparisonRegistryProduct(
  selected: ComparisonProductRef,
  candidates: readonly RegistryProductResult[],
): RegistryProductResult | null {
  const exactMatches = candidates.filter(
    (candidate) =>
      candidate.id === selected.productId &&
      candidate.registration.number === selected.registrationNumber,
  );
  return exactMatches.length === 1 ? exactMatches[0] : null;
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

export function comparisonProductFromClientIndex(
  product: InteractionProductSelection,
): ComparisonProductRef {
  const productId = product.productId.trim().toUpperCase();
  const registrationNumber = product.registration.trim();
  const inn = product.inn.trim() || null;
  return {
    productId,
    registrationNumber,
    tradeName: product.tradeName.trim(),
    inn,
    atcCode: null,
    activeIngredient: inn,
    strength: product.strength.trim() || null,
    dosageForm: conciseDosageForm(product.form),
    manufacturer: null,
    nationalListStatus: "uncertain",
    instructionAvailable: false,
    href: registryProductDetailHref({
      id: productId,
      registration: { number: registrationNumber },
    }),
  };
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
  const { addProduct, isFull, isSelected } = useProductComparison();

  if (isFull) {
    return (
      <p className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Обрано максимум — два препарати. Приберіть один, щоб додати інший.
      </p>
    );
  }

  return (
    <section className="space-y-3" aria-label="Додати препарат до порівняння">
      <RegistryInteractionSearchSelect
        onSelect={(product) => {
          if (isSelected(product.productId)) return;
          addProduct(comparisonProductFromClientIndex(product));
        }}
      />
    </section>
  );
}

export function EvidenceResolutionSection({
  products,
}: {
  products: ComparisonProductRef[];
}) {
  const [selectedIndicationId, setSelectedIndicationId] = useState<string | null>(null);
  const resolution = useMemo(
    () => resolveEvidenceComparison(products, selectedIndicationId),
    [products, selectedIndicationId],
  );

  return (
    <EvidenceComparisonExperience
      resolution={resolution}
      selectedIndicationId={selectedIndicationId}
      onSelectIndication={setSelectedIndicationId}
    />
  );
}

export function VerifiedProductComparison({
  products,
  instructions,
  loadingIds,
}: {
  products: ComparisonProductRef[];
  instructions: ComparisonInstructions;
  loadingIds: string[];
}) {
  return (
    <section className="space-y-5" aria-label="Результат порівняння">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">2 точні реєстрові позиції</Badge>
        <Badge variant="outline">Дані підтверджено за product ID і реєстрацією</Badge>
      </div>
      <section className="space-y-3" aria-labelledby="registry-comparison-title">
        <div>
          <h2 id="registry-comparison-title" className="text-lg font-bold">Порівняння обраних реєстрових позицій</h2>
          <p className="text-sm text-muted-foreground">Нижче показані дані саме двох вибраних позицій із каталогу.</p>
        </div>
        <ProductComparisonGrid products={products} instructions={instructions} loadingIds={loadingIds} />
      </section>
      <section className="space-y-3" aria-labelledby="evidence-comparison-title">
        <div>
          <h2 id="evidence-comparison-title" className="text-lg font-bold">Доказове клінічне порівняння</h2>
          <p className="text-sm text-muted-foreground">Клінічний висновок доступний лише за точного збігу перевірених доказів.</p>
        </div>
        <EvidenceResolutionSection key={products.map((product) => product.productId).sort().join(":")} products={products} />
      </section>
    </section>
  );
}

export default function Compare() {
  const { products, removeProduct, clear } = useProductComparison();
  const first = products[0];
  const second = products[1];

  const firstExactParams = useMemo(() => exactComparisonProductSearchParams(first), [first]);
  const secondExactParams = useMemo(() => exactComparisonProductSearchParams(second), [second]);
  const firstExactQuery = useSearchCatalog(firstExactParams, {
    query: { queryKey: getSearchCatalogQueryKey(firstExactParams), enabled: Boolean(first), retry: 1, staleTime: 60_000, refetchOnWindowFocus: false },
  });
  const secondExactQuery = useSearchCatalog(secondExactParams, {
    query: { queryKey: getSearchCatalogQueryKey(secondExactParams), enabled: Boolean(second), retry: 1, staleTime: 60_000, refetchOnWindowFocus: false },
  });
  const firstExactRegistryProduct = first
    ? exactComparisonRegistryProduct(first, firstExactQuery.data?.registryProducts.items ?? [])
    : null;
  const secondExactRegistryProduct = second
    ? exactComparisonRegistryProduct(second, secondExactQuery.data?.registryProducts.items ?? [])
    : null;
  const firstVerified = firstExactRegistryProduct
    ? comparisonProductFromRegistry(firstExactRegistryProduct, conciseDosageForm(firstExactRegistryProduct.dosageForm))
    : null;
  const secondVerified = secondExactRegistryProduct
    ? comparisonProductFromRegistry(secondExactRegistryProduct, conciseDosageForm(secondExactRegistryProduct.dosageForm))
    : null;
  const verifiedProducts = firstVerified && secondVerified ? [firstVerified, secondVerified] : [];
  const isVerifyingExactProducts = products.length === 2 && (firstExactQuery.isLoading || secondExactQuery.isLoading);
  const exactProductVerificationFailed = products.length === 2 && !isVerifyingExactProducts &&
    (firstExactQuery.isError || secondExactQuery.isError || verifiedProducts.length !== 2);

  const firstInstruction = useGetDrugInstruction(firstVerified?.productId ?? "", {
    query: { queryKey: getGetDrugInstructionQueryKey(firstVerified?.productId ?? ""), enabled: Boolean(firstVerified?.instructionAvailable), retry: false, staleTime: 6 * 60 * 60 * 1_000 },
  });
  const secondInstruction = useGetDrugInstruction(secondVerified?.productId ?? "", {
    query: { queryKey: getGetDrugInstructionQueryKey(secondVerified?.productId ?? ""), enabled: Boolean(secondVerified?.instructionAvailable), retry: false, staleTime: 6 * 60 * 60 * 1_000 },
  });

  const instructions: ComparisonInstructions = {
    ...(firstVerified ? { [firstVerified.productId]: firstInstruction.data } : {}),
    ...(secondVerified ? { [secondVerified.productId]: secondInstruction.data } : {}),
  };
  const loadingIds = [
    ...(firstVerified?.instructionAvailable && firstInstruction.isLoading ? [firstVerified.productId] : []),
    ...(secondVerified?.instructionAvailable && secondInstruction.isLoading ? [secondVerified.productId] : []),
  ];

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 overflow-x-hidden pb-16">
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

      {products.length === 2 && isVerifyingExactProducts ? (
        <div className="flex items-center gap-2 rounded-xl border px-4 py-4 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          Перевіряємо точні реєстрові позиції…
        </div>
      ) : products.length === 2 && exactProductVerificationFailed ? (
        <Alert className="border-amber-500/45 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Не вдалося підтвердити точні позиції</AlertTitle>
          <AlertDescription>
            Одна з вибраних позицій більше не збігається з актуальним каталогом за product ID і реєстраційним номером.
            Приберіть її та оберіть знову. Дані іншого препарату не підставляються.
          </AlertDescription>
        </Alert>
      ) : verifiedProducts.length === 2 ? (
        <VerifiedProductComparison products={verifiedProducts} instructions={instructions} loadingIds={loadingIds} />
      ) : (
        <p className="rounded-xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
          Додайте ще {2 - products.length} препарат, щоб побачити порівняння.
        </p>
      )}
    </main>
  );
}
