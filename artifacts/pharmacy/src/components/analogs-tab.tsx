import { useMemo } from "react";
import type { ProductCard } from "@workspace/api-client-react";
import type { CatalogClientIndexProduct } from "@workspace/catalog-index";
import { AlertTriangle, ChevronRight, Database, Pill } from "lucide-react";
import { Link } from "wouter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useCatalogClientIndex } from "@/lib/catalog-client-index";
import { classifyRegistryAnalogs } from "@/lib/product-analogs";

function ProductList({ products }: { products: CatalogClientIndexProduct[] }) {
  if (!products.length) {
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        Реєстрових варіантів у цій групі не знайдено.
      </p>
    );
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {products.map((product) => (
        <Link
          key={product.productId}
          href={`/products/${encodeURIComponent(product.productId)}?registration=${encodeURIComponent(product.registration)}&tab=profile`}
          className="block min-w-0"
        >
          <Card className="group h-full transition-colors hover:border-primary/40">
            <CardContent className="flex min-w-0 items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1 space-y-1">
                <h4 className="break-words font-bold">{product.tradeName}</h4>
                <p className="break-words text-xs text-muted-foreground">
                  {[product.strength, product.form]
                    .filter(Boolean)
                    .join(" · ") || "Форму не вказано"}
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  {product.registration}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export function ProductAnalogsTab({ card }: { card: ProductCard }) {
  const catalog = useCatalogClientIndex();
  const product = card.identity;
  const inn = product.inn || product.activeIngredient || "";
  const result = useMemo(
    () =>
      catalog.search(inn, {
        limit: 100,
        scope: "ingredients",
      }),
    [catalog, inn],
  );
  const groups = useMemo(
    () =>
      classifyRegistryAnalogs(
        {
          productId: product.id,
          inn,
          form: product.dosageForm,
          strength: product.strength ?? "",
        },
        result.items.map((item) => item.product),
      ),
    [inn, product.dosageForm, product.id, product.strength, result.items],
  );

  return (
    <section className="space-y-6" data-testid="product-analogs-tab">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Pill className="h-5 w-5 text-primary" />
            Реєстрові варіанти за МНН
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {inn || "МНН цієї позиції не зіставлено"}
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Database className="h-3.5 w-3.5" />
          {catalog.status === "ready"
            ? `${groups.full.length + groups.partial.length} варіантів`
            : "Каталог завантажується"}
        </Badge>
      </div>

      <div className="space-y-4">
        <h3 className="flex flex-wrap items-center gap-2 font-bold">
          <span className="h-3 w-3 rounded-full bg-emerald-500" />
          Точний збіг форми й дозування
        </h3>
        <ProductList products={groups.full} />
      </div>

      <div className="space-y-4">
        <h3 className="flex flex-wrap items-center gap-2 font-bold">
          <span className="h-3 w-3 rounded-full bg-amber-500" />
          Те саме МНН, інша форма або дозування
        </h3>
        <ProductList products={groups.partial} />
      </div>

      <Alert className="border-amber-500/40 bg-amber-500/5">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Не автоматична заміна</AlertTitle>
        <AlertDescription>
          Збіг МНН не підтверджує взаємозамінність. Перевірте форму, дозування,
          шлях введення, показання та умови рецепта. Терапевтичні аналоги без
          окремої перевіреної доказової бази тут не формуються.
        </AlertDescription>
      </Alert>
    </section>
  );
}
