import React from "react";
import { Link } from "wouter";
import {
  normalizeCatalogIndexText,
  type CatalogClientIndexSearchItem,
  type CatalogClientIndexSearchResult,
} from "@workspace/catalog-index";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Database, Search } from "lucide-react";
import { registryProductDetailHref } from "@/lib/registry-product-route";

interface LocalCatalogGroup {
  key: string;
  tradeName: string;
  inn: string;
  bestRank: number;
  variants: CatalogClientIndexSearchItem[];
}

export function registeredVariantsLabel(count: number): string {
  const absoluteCount = Math.abs(count);
  const lastTwoDigits = absoluteCount % 100;
  const lastDigit = absoluteCount % 10;
  const noun =
    lastDigit === 1 && lastTwoDigits !== 11
      ? "зареєстрований варіант"
      : lastDigit >= 2 &&
          lastDigit <= 4 &&
          (lastTwoDigits < 12 || lastTwoDigits > 14)
        ? "зареєстровані варіанти"
        : "зареєстрованих варіантів";
  return `1 торгова назва · ${count} ${noun}`;
}

export function groupLocalCatalogResults(
  items: readonly CatalogClientIndexSearchItem[],
): LocalCatalogGroup[] {
  const groups = new Map<string, LocalCatalogGroup>();
  for (const item of items) {
    const key = normalizeCatalogIndexText(item.product.tradeName);
    const existing = groups.get(key);
    if (existing) {
      existing.variants.push(item);
      existing.bestRank = Math.min(existing.bestRank, item.rank);
      continue;
    }
    groups.set(key, {
      key,
      tradeName: item.product.tradeName,
      inn: item.product.inn,
      bestRank: item.rank,
      variants: [item],
    });
  }
  return [...groups.values()].sort(
    (left, right) =>
      left.bestRank - right.bestRank ||
      left.tradeName.localeCompare(right.tradeName, "uk-UA"),
  );
}

export function LocalCatalogResults({
  result,
  mode = "catalog",
}: {
  result: CatalogClientIndexSearchResult;
  mode?: "catalog" | "ingredients";
}) {
  const groups = groupLocalCatalogResults(result.items);
  const ingredientMode = mode === "ingredients";
  if (!result.query.trim()) {
    return (
      <div
        className="space-y-2 border-y py-10 text-center"
        data-testid="local-catalog-empty-query"
      >
        <Search className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="font-semibold">
          {ingredientMode
            ? "Почніть вводити назву діючої речовини"
            : "Почніть вводити назву препарату або МНН"}
        </p>
        <p className="text-sm text-muted-foreground">
          Пошук виконується локально без очікування сервера.
        </p>
      </div>
    );
  }
  if (!groups.length) {
    return (
      <div
        className="space-y-2 border-y py-10 text-center"
        data-testid="local-catalog-no-results"
      >
        <Search className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="font-semibold">Нічого не знайдено</p>
        <p className="text-sm text-muted-foreground">
          {ingredientMode
            ? "Спробуйте українську, латинську або міжнародну назву МНН."
            : "Спробуйте повну торгову назву, МНН або реєстраційний номер."}
        </p>
      </div>
    );
  }
  return (
    <section
      className="max-w-full space-y-3 overflow-x-hidden"
      data-testid="local-catalog-results"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">
            {ingredientMode
              ? "Препарати та їхні діючі речовини"
              : "Зареєстровані препарати"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {ingredientMode ? "За збігом МНН · " : "Знайдено "}
            {result.total.toLocaleString("uk-UA")} позицій
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Database className="h-3.5 w-3.5" />
          Локально · {result.durationMs.toFixed(1)} мс
        </Badge>
      </div>
      <div className="space-y-3">
        {groups.map((group) => (
          <Card
            key={group.key}
            className="max-w-full overflow-hidden"
            data-testid={`local-brand-${group.key}`}
          >
            <CardContent className="space-y-3 p-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="break-words text-lg font-bold text-primary">
                    {group.tradeName}
                  </h3>
                  {group.bestRank === 0 ? <Badge>Точний збіг</Badge> : null}
                  <Badge
                    variant="outline"
                    className="max-w-full whitespace-normal text-left"
                  >
                    {registeredVariantsLabel(group.variants.length)}
                  </Badge>
                </div>
                <p className="break-words text-sm text-muted-foreground">
                  МНН/склад: {group.inn || "Не вказано"}
                </p>
              </div>
              <div className="divide-y rounded-xl border">
                {group.variants.map(({ product }, index) => (
                  <div
                    key={`${product.productId}:${product.registration}`}
                    className="grid min-w-0 gap-3 p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                  >
                    <div className="min-w-0 space-y-2">
                      {group.variants.length > 1 ? (
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                          Реєстровий варіант {index + 1}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {product.strength ? (
                          <Badge variant="secondary">{product.strength}</Badge>
                        ) : null}
                        {product.form ? (
                          <Badge
                            variant="outline"
                            className="max-w-full whitespace-normal text-left"
                          >
                            {product.form}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="break-all text-xs text-muted-foreground">
                        <span className="font-medium">Реєстрація:</span>{" "}
                        {product.registration}
                      </p>
                    </div>
                    <Button
                      asChild
                      variant="outline"
                      className="min-h-11 w-full sm:w-auto"
                    >
                      <Link
                        href={registryProductDetailHref({
                          id: product.productId,
                          registration: { number: product.registration },
                        })}
                        data-navigation="spa"
                        data-testid={"local-product-open-" + product.productId}
                      >
                        Відкрити
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {result.total > result.items.length ? (
        <p className="text-center text-xs text-muted-foreground">
          Показано перші {result.items.length.toLocaleString("uk-UA")} позицій.
          Уточніть запит, щоб звузити результат.
        </p>
      ) : null}
    </section>
  );
}
