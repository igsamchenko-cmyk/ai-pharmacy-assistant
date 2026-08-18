import React, { useMemo } from "react";
import type { ProductCard } from "@workspace/api-client-react";
import {
  normalizeCatalogIndexText,
  type CatalogClientIndexProduct,
} from "@workspace/catalog-index";
import {
  AlertTriangle,
  ChevronRight,
  Columns3,
  Database,
  Info,
  Pill,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  comparisonProductFromClientIndexRow,
  comparisonProductFromRegistry,
  useProductComparison,
} from "@/hooks/use-product-comparison";
import { useCatalogClientIndex } from "@/lib/catalog-client-index";
import {
  CATALOG_REGISTRATION_STATUS_LABELS,
  groupCatalogVariants,
} from "@/lib/catalog-result-variants";
import {
  catalogInnSpecificity,
  classifyRegistryAnalogs,
} from "@/lib/product-analogs";

function analogHref(product: CatalogClientIndexProduct): string {
  return `/products/${encodeURIComponent(product.productId)}?registration=${encodeURIComponent(product.registration)}&tab=profile`;
}

/**
 * The analog list groups by certificate for the same reason search results do.
 *
 * A search for a common substance returns whole certificates — `UA/0235/02/01`,
 * `/02`, `/03` are one ОМЕЗ in 20, 10 and 40 мг. Listed as three cards reading
 * "ОМЕЗ® · капсули" they look like three analogs to choose between, and the
 * registration number is the only thing telling them apart, which is exactly
 * what a pharmacist cannot act on. Collapsed, the choice becomes the strength.
 */
function AnalogList({
  products,
  onCompare,
  comparedProductId,
}: {
  products: CatalogClientIndexProduct[];
  onCompare: (product: CatalogClientIndexProduct) => void;
  comparedProductId: string;
}) {
  const groups = useMemo(
    () =>
      groupCatalogVariants(
        products.map((product, rank) => ({ product, rank })),
        new Date(),
      ),
    [products],
  );
  if (!groups.length) {
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        Реєстрових варіантів у цій групі не знайдено.
      </p>
    );
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {groups.map((group) => {
        const lead = group.lines[0]?.product;
        if (!lead) return null;
        return (
          <Card
            key={group.key + group.form + group.manufacturer}
            className="flex h-full min-w-0 flex-col"
            data-testid={`analog-variant-${group.key}`}
          >
            <CardContent className="flex min-w-0 flex-1 flex-col gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="break-words font-bold">{group.tradeName}</h4>
                  {group.status === "terminated" ? (
                    <Badge
                      variant="destructive"
                      data-testid="analog-variant-terminated"
                    >
                      {CATALOG_REGISTRATION_STATUS_LABELS.terminated}
                    </Badge>
                  ) : null}
                </div>
                {/* Manufacturer is how a pharmacist tells two same-name,
                    same-form registrations apart; the number never was. */}
                <p className="break-words text-sm font-medium">
                  {group.manufacturer || "Виробника не вказано"}
                </p>
                <p className="break-words text-xs text-muted-foreground">
                  {group.form || "Форму не вказано"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {group.lines.map(({ product }, index) => (
                  <Button
                    key={`${product.productId}:${product.registration}`}
                    asChild
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                  >
                    <Link
                      href={analogHref(product)}
                      data-testid={`analog-open-${product.productId}`}
                    >
                      {product.strength ||
                        (group.lines.length > 1
                          ? `Варіант ${index + 1}`
                          : "Відкрити")}
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ))}
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                <p className="break-all text-xs text-muted-foreground">
                  {group.lines.length > 1
                    ? `Посвідчення ${group.key} · ${group.lines.length} рядки`
                    : `Реєстрація: ${lead.registration}`}
                </p>
                <Button
                  type="button"
                  variant={
                    comparedProductId === lead.productId ? "secondary" : "ghost"
                  }
                  size="sm"
                  className="min-h-11"
                  onClick={() => onCompare(lead)}
                  data-testid={`analog-compare-${lead.productId}`}
                >
                  <Columns3 className="h-4 w-4 shrink-0" />
                  Порівняти
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function ProductAnalogsTab({ card }: { card: ProductCard }) {
  const catalog = useCatalogClientIndex();
  const product = card.identity;
  const inn = product.inn || product.activeIngredient || "";
  const specificity = catalogInnSpecificity(inn);

  // When the registry МНН does not identify the composition on its own, this
  // position's own index row carries the composition resolved from the
  // official price catalog. Read by id: ranking the whole catalog to find a
  // row whose identifier is already known was both wasteful and fragile.
  const compositionKey = useMemo(() => {
    if (specificity === "specific") return "";
    return catalog.productById(product.id)?.compositionKey ?? "";
  }, [catalog, specificity, product.id]);

  const mode = compositionKey
    ? "composition"
    : specificity === "specific"
      ? "inn"
      : specificity === "partial_combination"
        ? "inn_class"
        : "unresolved";
  const byComposition = mode === "composition";
  // Grouping is an equality question, so it is asked as one. The ranked text
  // search used to stand in for this: it capped the answer at 250 and counted
  // prefix matches — which the classifier then discarded — towards "the list
  // is incomplete". An exact lookup returns the whole group every time, so
  // there is no cap to warn about and no phantom shortfall.
  const candidates = useMemo(
    () =>
      mode === "unresolved"
        ? []
        : catalog.positionsByIdentity(
            compositionKey
              ? { compositionKey }
              : { innKey: normalizeCatalogIndexText(inn) },
          ),
    [catalog, compositionKey, inn, mode],
  );

  const [, navigate] = useLocation();
  const comparison = useProductComparison();
  /**
   * Comparing an analog always means comparing it against the position on
   * screen, so the pair is set outright instead of accumulating in a basket
   * the pharmacist has to reason about. This is why the old card-level button
   * could dead-end at a disabled «Максимум 2»: there was no way to say which
   * two, only how many.
   */
  const compareWithCurrent = React.useCallback(
    (analog: CatalogClientIndexProduct) => {
      comparison.clear();
      comparison.addProduct(
        comparisonProductFromRegistry(product, product.dosageForm),
      );
      comparison.addProduct(
        comparisonProductFromClientIndexRow(analog, analog.form),
      );
      navigate("/compare");
    },
    [comparison, navigate, product],
  );
  const comparedProductId =
    comparison.products.find((entry) => entry.productId !== product.id)
      ?.productId ?? "";
  const groups = useMemo(
    () =>
      classifyRegistryAnalogs(
        {
          productId: product.id,
          inn,
          form: product.dosageForm,
          strength: product.strength ?? "",
          compositionKey,
        },
        candidates,
      ),
    [
      candidates,
      compositionKey,
      inn,
      product.dosageForm,
      product.id,
      product.strength,
    ],
  );

  return (
    <section className="space-y-6" data-testid="product-analogs-tab">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Pill className="h-5 w-5 text-primary" />
            {byComposition
              ? "Реєстрові варіанти за складом"
              : mode === "inn_class"
                ? "Позиції з тим самим записом МНН"
                : "Реєстрові варіанти за МНН"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {byComposition
              ? "Той самий перелік діючих речовин"
              : inn || "МНН цієї позиції не зіставлено"}
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Database className="h-3.5 w-3.5" />
          {catalog.status === "ready"
            ? `${groups.full.length + groups.partial.length} варіантів`
            : "Каталог завантажується"}
        </Badge>
      </div>

      {byComposition ? (
        <Alert className="border-sky-500/40 bg-sky-500/5">
          <Info className="h-4 w-4" />
          <AlertTitle>Підібрано за складом, а не за МНН</AlertTitle>
          <AlertDescription>
            Держреєстр зберігає МНН цієї позиції як загальну позначку «{inn}» —
            так описують комбіновані препарати, склад яких не розкладено на
            окрему діючу речовину. Підбір за таким записом об&apos;єднав би
            непов&apos;язані препарати, тому FarmAssist зіставляє перелік діючих
            речовин із Національного каталогу цін МОЗ. Це інше джерело, ніж
            ДРЛЗ, і воно не охоплює препарати без задекларованої ціни.
          </AlertDescription>
        </Alert>
      ) : mode === "inn_class" ? (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <Info className="h-4 w-4" />
          <AlertTitle>Це група за записом МНН, а не за складом</AlertTitle>
          <AlertDescription>
            Запис «{inn}» називає одну діючу речовину та клас, а не повний
            склад, тому позиції нижче можуть містити різні другі компоненти. Це
            перелік однакового запису МНН, а не підтверджені аналоги.
            Структурованого складу для цієї позиції немає в Національному
            каталозі цін МОЗ — звіряйте фактичний склад в інструкції.
          </AlertDescription>
        </Alert>
      ) : mode === "unresolved" ? (
        <Alert className="border-sky-500/40 bg-sky-500/5">
          <Info className="h-4 w-4" />
          <AlertTitle>МНН не деталізовано в реєстрі</AlertTitle>
          <AlertDescription>
            Держреєстр зберігає МНН цієї позиції як загальну позначку «{inn}» —
            так описують комбіновані препарати, склад яких не розкладено на
            окрему діючу речовину. Підбір «тієї самої МНН» за таким записом
            об&apos;єднав би непов&apos;язані препарати, а структурованого
            складу для цієї позиції немає в Національному каталозі цін МОЗ.
            Перевірте фактичний склад в інструкції та зіставте аналоги вручну.
          </AlertDescription>
        </Alert>
      ) : null}

      {mode === "unresolved" ? null : (
        <>
          <div className="space-y-4">
            <h3 className="flex flex-wrap items-center gap-2 font-bold">
              <span className="h-3 w-3 rounded-full bg-emerald-500" />
              Точний збіг форми й дозування
            </h3>
            <AnalogList
              products={groups.full}
              onCompare={compareWithCurrent}
              comparedProductId={comparedProductId}
            />
          </div>

          <div className="space-y-4">
            <h3 className="flex flex-wrap items-center gap-2 font-bold">
              <span className="h-3 w-3 rounded-full bg-amber-500" />
              {byComposition
                ? "Той самий склад, інша форма або дозування"
                : "Той самий запис МНН, інша форма або дозування"}
            </h3>
            <AnalogList
              products={groups.partial}
              onCompare={compareWithCurrent}
              comparedProductId={comparedProductId}
            />
          </div>
        </>
      )}

      <Alert className="border-amber-500/40 bg-amber-500/5">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Не автоматична заміна</AlertTitle>
        <AlertDescription>
          {byComposition ? "Збіг складу" : "Збіг МНН"} не підтверджує
          взаємозамінність. Перевірте форму, дозування, шлях введення, показання
          та умови рецепта. Терапевтичні аналоги без окремої перевіреної
          доказової бази тут не формуються.
        </AlertDescription>
      </Alert>
    </section>
  );
}
