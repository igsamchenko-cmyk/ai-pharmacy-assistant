import React from "react";
import { Link } from "wouter";
import {
  normalizeCatalogIndexText,
  type CatalogClientIndexSearchItem,
  type CatalogClientIndexSearchResult,
  type CatalogNormalizedCandidate,
  type CatalogNormalizedMatchType,
  type CatalogNormalizedSearchResult,
  type CatalogSectionIntentKey,
} from "@workspace/catalog-index";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Database, FileSearch, Search } from "lucide-react";
import { registryProductDetailHref } from "@/lib/registry-product-route";
import { cacheOfflineProductIdentity } from "@/lib/offline-product-card";
import { instructionSectionTarget } from "@/lib/navigation-v3";

interface LocalCatalogGroup {
  key: string;
  tradeName: string;
  inn: string;
  bestRank: number;
  variants: CatalogClientIndexSearchItem[];
  matchType?: CatalogNormalizedMatchType;
  correctedQuery?: string;
}

function normalizedMetadata(item: CatalogClientIndexSearchItem): {
  matchType?: CatalogNormalizedMatchType;
  correctedQuery?: string;
} {
  const candidate = item as Partial<CatalogNormalizedCandidate>;
  return {
    ...(candidate.matchType ? { matchType: candidate.matchType } : {}),
    ...(candidate.correctedQuery
      ? { correctedQuery: candidate.correctedQuery }
      : {}),
  };
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
      if (item.rank < existing.bestRank) {
        existing.bestRank = item.rank;
        Object.assign(existing, normalizedMetadata(item));
      }
      continue;
    }
    groups.set(key, {
      key,
      tradeName: item.product.tradeName,
      inn: item.product.inn,
      bestRank: item.rank,
      variants: [item],
      ...normalizedMetadata(item),
    });
  }
  return [...groups.values()].sort(
    (left, right) =>
      left.bestRank - right.bestRank ||
      left.tradeName.localeCompare(right.tradeName, "uk-UA"),
  );
}

function productHref(
  product: CatalogClientIndexSearchItem["product"],
  correctedQuery?: string,
  sectionIntent?: CatalogSectionIntentKey,
): string {
  const href = registryProductDetailHref({
    id: product.productId,
    registration: { number: product.registration },
  });
  const withCorrection = correctedQuery
    ? `${href}&correctedQuery=${encodeURIComponent(correctedQuery)}`
    : href;
  // PR-H, H.2.3: when the query carried a section intent ("амоксил
  // лактація"), land directly on that instruction section instead of the
  // default Profile tab. Whether the section actually exists in this
  // product's parsed instruction is validated once the card loads --
  // product-card.tsx shows a toast instead of a silent no-op if it doesn't.
  return sectionIntent
    ? instructionSectionTarget(withCorrection, sectionIntent)
    : withCorrection;
}

function LocalCatalogGroupCards({
  groups,
  suggested = false,
  sectionIntent,
}: {
  groups: LocalCatalogGroup[];
  suggested?: boolean;
  sectionIntent?: CatalogSectionIntentKey;
}) {
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <Card
          key={group.key}
          className="max-w-full overflow-hidden"
          data-testid={
            suggested
              ? `suggested-brand-${group.key}`
              : `local-brand-${group.key}`
          }
        >
          <CardContent className="space-y-3 p-4">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="break-words text-lg font-bold text-primary">
                  {group.tradeName}
                </h3>
                {!suggested && group.bestRank === 0 ? (
                  <Badge>Точний збіг</Badge>
                ) : null}
                {group.correctedQuery ? (
                  <Badge
                    variant={suggested ? "secondary" : "outline"}
                    className="max-w-full whitespace-normal break-all text-left"
                  >
                    {suggested ? "Виправлено" : "Розкладку виправлено"}:{" "}
                    {group.correctedQuery}
                  </Badge>
                ) : null}
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
                      href={productHref(
                        product,
                        group.correctedQuery,
                        suggested ? undefined : sectionIntent,
                      )}
                      data-navigation="spa"
                      onClick={() =>
                        cacheOfflineProductIdentity({
                          productId: product.productId,
                          registration: product.registration,
                          tradeName: product.tradeName,
                          inn: product.inn,
                          form: product.form,
                          strength: product.strength,
                        })
                      }
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
  );
}

export function LocalCatalogResults({
  result,
  normalizedResult,
  mode = "catalog",
}: {
  result: CatalogClientIndexSearchResult;
  normalizedResult?: CatalogNormalizedSearchResult | null;
  mode?: "catalog" | "ingredients";
}) {
  const primaryItems = normalizedResult?.primary ?? result.items;
  const suggestedItems = normalizedResult?.suggested ?? [];
  const groups = groupLocalCatalogResults(primaryItems);
  const suggestedGroups = groupLocalCatalogResults(suggestedItems);
  const sectionIntent = normalizedResult?.sectionIntent;
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
  if (!groups.length && !suggestedGroups.length) {
    return (
      <div
        className="space-y-3 border-y py-10 text-center"
        data-testid="local-catalog-no-results"
      >
        <Search className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="font-semibold">Нічого не знайдено</p>
        <p className="text-sm text-muted-foreground">
          {ingredientMode
            ? "Спробуйте українську, латинську або міжнародну назву МНН."
            : "Спробуйте повну торгову назву, МНН або реєстраційний номер."}
        </p>
        {/* PR-H, H.3: second-tier search when the catalog (product identity)
            search is a genuine zero-result miss. Full-text instruction
            search is server-side and slower, so this is a deliberate
            second step, never triggered automatically. */}
        {!ingredientMode && result.query.trim() ? (
          <Button asChild variant="outline">
            <Link
              href={`/instruction-search?q=${encodeURIComponent(result.query.trim())}`}
              data-testid="local-catalog-search-instructions-cta"
            >
              <FileSearch className="h-4 w-4" />
              Шукати в текстах інструкцій
            </Link>
          </Button>
        ) : null}
      </div>
    );
  }
  const total = Math.max(result.total, primaryItems.length);
  const durationMs = normalizedResult?.durationMs ?? result.durationMs;
  return (
    <section
      className="max-w-full space-y-5 overflow-x-hidden"
      data-testid="local-catalog-results"
    >
      {groups.length ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">
                {ingredientMode
                  ? "Препарати та їхні діючі речовини"
                  : "Зареєстровані препарати"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {ingredientMode ? "За збігом МНН · " : "Знайдено "}
                {total.toLocaleString("uk-UA")} позицій
              </p>
            </div>
            <Badge variant="secondary" className="gap-1">
              <Database className="h-3.5 w-3.5" />
              Локально · {durationMs.toFixed(1)} мс
            </Badge>
          </div>
          <LocalCatalogGroupCards groups={groups} sectionIntent={sectionIntent} />
        </section>
      ) : null}

      {suggestedGroups.length ? (
        <section
          className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4"
          data-testid="suggested-results"
        >
          <div>
            <h2 className="text-lg font-semibold">Можливо, ви шукали:</h2>
            <p className="text-xs text-muted-foreground">
              Виправлений варіант не відкривається автоматично — перевірте й
              оберіть точну реєстрову позицію.
            </p>
          </div>
          <LocalCatalogGroupCards groups={suggestedGroups} suggested />
        </section>
      ) : null}

      {total > primaryItems.length && groups.length ? (
        <p className="text-center text-xs text-muted-foreground">
          Показано перші {primaryItems.length.toLocaleString("uk-UA")} позицій.
          Уточніть запит, щоб звузити результат.
        </p>
      ) : null}
    </section>
  );
}
