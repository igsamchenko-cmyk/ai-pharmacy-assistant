import React, { useMemo, useState } from "react";
import {
  getCheckProductDispensingCategoryQueryKey,
  getSearchCatalogQueryKey,
  getCheckProductSeriesRestrictionsQueryKey,
  useCheckProductDispensingCategory,
  useCheckProductSeriesRestrictions,
  useSearchCatalog,
  type DispensingCategoryCheck,
  type RegistryProductResult,
  type SeriesRestrictionCheck,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  BookOpenText,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  Database,
  ExternalLink,
  GitCompare,
  LoaderCircle,
  OctagonX,
  RotateCcw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SeriesRestrictionCheckPanel } from "@/components/series-restriction-check";
import { useDebounce } from "@/hooks/use-debounce";
import {
  buildDispensingAssessment,
  type DispensingAssessment,
  type DispensingCheckTone,
} from "@/lib/dispensing-safety";
import { conciseManufacturerText } from "@/lib/manufacturer-display";
import { registryProductDetailHref } from "@/lib/registry-product-route";
import { conciseDosageForm } from "@/pages/search";

export const MANUAL_DISPENSING_STEPS = [
  "Звірити пацієнта, препарат, алергії та особливі стани",
  "Перевірити рецепт, дозу, шлях введення і тривалість, якщо це застосовно",
  "Звірити протипоказання та спеціальні застереження в точній інструкції",
  "Перевірити клінічно значущі взаємодії з іншими препаратами",
  "Надати рекомендації щодо застосування, зберігання та небажаних реакцій",
] as const;

const TONE_STYLES: Record<
  DispensingCheckTone,
  { card: string; badge: string; Icon: typeof CheckCircle2 }
> = {
  verified: {
    card: "border-emerald-500/30 bg-emerald-500/5",
    badge: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
    Icon: CheckCircle2,
  },
  attention: {
    card: "border-amber-500/30 bg-amber-500/5",
    badge: "border-amber-500/40 text-amber-700 dark:text-amber-300",
    Icon: AlertTriangle,
  },
  blocked: {
    card: "border-destructive/40 bg-destructive/5",
    badge: "border-destructive/40 text-destructive",
    Icon: OctagonX,
  },
  unavailable: {
    card: "border-muted-foreground/20 bg-muted/20",
    badge: "text-muted-foreground",
    Icon: CircleHelp,
  },
};

function formatCheckedAt(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium" }).format(date);
}

export function DispensingAssessmentPanel({
  product,
  seriesRestriction,
  dispensingCategory,
}: {
  product: RegistryProductResult;
  seriesRestriction?: SeriesRestrictionCheck | null;
  dispensingCategory?: DispensingCategoryCheck | null;
}) {
  const assessment = buildDispensingAssessment(
    product,
    seriesRestriction,
    dispensingCategory,
  );
  const instructionStatus =
    product.instructionSourceStatus ??
    (product.instructionAvailable ? "structured" : "not_published");
  const officialInstructionUrl = product.officialInstructionDocumentUrl ?? null;

  return (
    <section className="space-y-4" data-testid="dispensing-assessment">
      <Alert
        variant={assessment.decision === "blocked" ? "destructive" : "default"}
        className={
          assessment.decision === "blocked"
            ? undefined
            : "border-amber-500/40 bg-amber-500/5"
        }
      >
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>{assessment.decisionLabel}</AlertTitle>
        <AlertDescription>{assessment.decisionDetail}</AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Регуляторна картка</h2>
        <Badge variant="outline" data-testid="connected-source-count">
          Джерела: {assessment.connectedCount}/{assessment.checks.length}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {assessment.checks.map((check) => {
          const style = TONE_STYLES[check.tone];
          const checkedAt = formatCheckedAt(check.checkedAt);
          return (
            <Card
              key={check.id}
              className={`overflow-hidden ${style.card}`}
              data-testid={`dispensing-check-${check.id}`}
            >
              <CardHeader className="space-y-2 p-4 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">
                    {check.title}
                  </CardTitle>
                  <style.Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                </div>
                <Badge
                  variant="outline"
                  className={`w-fit max-w-full whitespace-normal text-left ${style.badge}`}
                >
                  {check.statusLabel}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-1 text-sm">
                <p className="text-muted-foreground">{check.detail}</p>
                <p className="text-xs">
                  Джерело:{" "}
                  {check.sourceUrl ? (
                    <a
                      href={check.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {check.sourceLabel}
                      <ExternalLink className="ml-1 inline h-3 w-3" />
                    </a>
                  ) : (
                    <span className="font-medium">{check.sourceLabel}</span>
                  )}
                  {checkedAt ? ` · перевірено ${checkedAt}` : ""}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Button
          asChild
          variant="outline"
          className="min-h-11 whitespace-normal"
        >
          <a href={registryProductDetailHref(product)}>
            <Database className="h-4 w-4" />
            Картка препарату
          </a>
        </Button>
        {product.instructionAvailable ? (
          <Button
            asChild
            variant="outline"
            className="min-h-11 whitespace-normal"
          >
            <a href={`/instructions/${product.id}`}>
              <BookOpenText className="h-4 w-4" />
              Точна інструкція
            </a>
          </Button>
        ) : officialInstructionUrl &&
          instructionStatus === "official_document" ? (
          <Button
            asChild
            variant="outline"
            className="min-h-11 whitespace-normal"
          >
            <a href={officialInstructionUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Документ ДРЛЗ
            </a>
          </Button>
        ) : (
          <Button
            disabled
            variant="outline"
            className="min-h-11 whitespace-normal"
          >
            <BookOpenText className="h-4 w-4" />
            Інструкція недоступна
          </Button>
        )}
        <Button
          asChild
          variant="outline"
          className="min-h-11 whitespace-normal"
        >
          <a href="/interactions">
            <GitCompare className="h-4 w-4" />
            Перевірити взаємодії
          </a>
        </Button>
      </div>
    </section>
  );
}

function ProductSummary({ product }: { product: RegistryProductResult }) {
  return (
    <Card className="overflow-hidden border-primary/25 bg-primary/5">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2">
            <ClipboardCheck className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="break-words text-2xl font-bold">
              {product.tradeName}
            </h2>
            <p className="break-words text-sm text-muted-foreground">
              {product.inn || product.activeIngredient || "Склад не зазначено"}
            </p>
          </div>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-muted-foreground">
              Форма і сила
            </dt>
            <dd className="font-medium">
              {[product.strength, conciseDosageForm(product.dosageForm)]
                .filter(Boolean)
                .join(" · ") || "Не зазначено"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">
              Виробник
            </dt>
            <dd className="font-medium">
              {conciseManufacturerText(product.manufacturers)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">
              Реєстрація
            </dt>
            <dd className="break-all font-medium">
              {product.registration.number}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">
              Нормалізація МНН
            </dt>
            <dd className="font-medium">
              {product.mappingStatus === "approved"
                ? "Підтверджено"
                : product.mappingStatus === "ambiguous"
                  ? "Потребує уточнення"
                  : "Не підтверджено"}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function ManualChecklist({
  checked,
  onChange,
}: {
  checked: boolean[];
  onChange: (index: number, value: boolean) => void;
}) {
  const completed = checked.filter(Boolean).length;
  return (
    <section className="space-y-3" data-testid="manual-dispensing-checklist">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Ручний контроль перед відпуском</h2>
          <p className="text-sm text-muted-foreground">
            Позначки живуть лише поки відкрита ця сторінка; дані пацієнта не
            зберігаються.
          </p>
        </div>
        <Badge variant={completed === checked.length ? "default" : "secondary"}>
          {completed}/{checked.length}
        </Badge>
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {MANUAL_DISPENSING_STEPS.map((step, index) => (
            <label
              key={step}
              className="flex min-h-14 cursor-pointer items-start gap-3 p-4 hover:bg-accent/40"
            >
              <input
                type="checkbox"
                checked={checked[index]}
                onChange={(event) => onChange(index, event.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
              />
              <span
                className={
                  checked[index] ? "text-muted-foreground line-through" : ""
                }
              >
                {step}
              </span>
            </label>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

export default function Dispensing() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RegistryProductResult | null>(null);
  const [manualChecks, setManualChecks] = useState<boolean[]>(
    MANUAL_DISPENSING_STEPS.map(() => false),
  );
  const [seriesDraft, setSeriesDraft] = useState("");
  const [submittedSeries, setSubmittedSeries] = useState("");
  const effectiveQuery = useDebounce(query.trim(), 200);
  const params = useMemo(
    () => ({
      q: effectiveQuery,
      type: "registry_products" as const,
      view: "flat" as const,
      page: 1,
      pageSize: 25 as const,
    }),
    [effectiveQuery],
  );
  const enabled = effectiveQuery.length >= 3;
  const search = useSearchCatalog(params, {
    query: {
      enabled,
      queryKey: getSearchCatalogQueryKey(params),
      retry: 1,
    },
  });
  const results = search.data?.registryProducts.items ?? [];
  const dispensingCategoryParams = useMemo(
    () => ({
      productId: selected?.id ?? "0".repeat(32),
      registrationNumber: selected?.registration.number ?? "UA/0/0/0",
    }),
    [selected],
  );
  const dispensingCategoryCheck = useCheckProductDispensingCategory(
    dispensingCategoryParams,
    {
      query: {
        enabled: Boolean(selected),
        queryKey: getCheckProductDispensingCategoryQueryKey(
          dispensingCategoryParams,
        ),
        retry: false,
      },
    },
  );
  const dispensingCategoryAssessment = dispensingCategoryCheck.isError
    ? null
    : dispensingCategoryCheck.data;
  const seriesParams = useMemo(
    () => ({
      productId: selected?.id ?? "0".repeat(32),
      registrationNumber: selected?.registration.number ?? "UA/0/0/0",
      series: submittedSeries || "_",
    }),
    [selected, submittedSeries],
  );
  const seriesCheck = useCheckProductSeriesRestrictions(seriesParams, {
    query: {
      enabled: Boolean(selected && submittedSeries),
      queryKey: getCheckProductSeriesRestrictionsQueryKey(seriesParams),
      retry: false,
    },
  });
  const seriesAssessment = submittedSeries
    ? seriesCheck.isError
      ? null
      : seriesCheck.data
    : undefined;

  const selectProduct = (product: RegistryProductResult) => {
    setSelected(product);
    setManualChecks(MANUAL_DISPENSING_STEPS.map(() => false));
    setSeriesDraft("");
    setSubmittedSeries("");
  };

  const reset = () => {
    setSelected(null);
    setQuery("");
    setManualChecks(MANUAL_DISPENSING_STEPS.map(() => false));
    setSeriesDraft("");
    setSubmittedSeries("");
  };

  const changeSeries = (value: string) => {
    setSeriesDraft(value);
    setSubmittedSeries("");
  };

  const submitSeries = () => {
    const normalized = seriesDraft.trim();
    if (!normalized) return;
    if (normalized === submittedSeries) void seriesCheck.refetch();
    else setSubmittedSeries(normalized);
  };

  return (
    <div className="max-w-full space-y-6 overflow-x-hidden pb-10 animate-in fade-in">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-primary/10 p-3">
            <ClipboardCheck className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Перевірка відпуску</h1>
            <p className="text-muted-foreground">
              Професійний чекпойнт для точної реєстрової позиції.
            </p>
          </div>
        </div>
      </header>

      {!selected ? (
        <section className="space-y-4">
          <Alert className="border-primary/30 bg-primary/5">
            <Database className="h-4 w-4" />
            <AlertTitle>Почніть з точної упаковки</AlertTitle>
            <AlertDescription>
              Введіть торгову назву, МНН або повний реєстраційний номер. Не
              обирайте препарат лише за схожою назвою.
            </AlertDescription>
          </Alert>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Наприклад: Енап або UA/1234/01/01"
              className="min-h-14 pl-11 text-base"
              autoComplete="off"
              aria-label="Пошук реєстрової позиції для відпуску"
              data-testid="dispensing-search-input"
            />
          </div>

          {query.trim().length > 0 && query.trim().length < 3 ? (
            <p className="text-sm text-muted-foreground">
              Введіть щонайменше 3 символи.
            </p>
          ) : null}
          {enabled && search.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <LoaderCircle className="h-5 w-5 animate-spin" /> Пошук у реєстрі…
            </div>
          ) : null}
          {enabled && search.isError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Реєстр недоступний</AlertTitle>
              <AlertDescription>
                Не продовжуйте автоматичну перевірку. Скористайтеся офіційним
                ДРЛЗ.
              </AlertDescription>
            </Alert>
          ) : null}
          {search.data?.warnings.map((warning) => (
            <p
              key={warning}
              className="text-sm text-amber-700 dark:text-amber-300"
            >
              {warning}
            </p>
          ))}
          {enabled && !search.isLoading && !search.isError ? (
            <div className="space-y-2" data-testid="dispensing-search-results">
              {results.length ? (
                results.map((product) => (
                  <button
                    key={`${product.id}:${product.registration.number}`}
                    type="button"
                    onClick={() => selectProduct(product)}
                    className="grid w-full gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/30"
                  >
                    <span className="break-words font-bold">
                      {product.tradeName}
                    </span>
                    <span className="break-words text-sm text-muted-foreground">
                      {product.inn ||
                        product.activeIngredient ||
                        "Склад не зазначено"}
                    </span>
                    <span className="break-words text-xs text-muted-foreground">
                      {[product.strength, conciseDosageForm(product.dosageForm)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span className="break-all text-xs font-medium">
                      {product.registration.number} ·{" "}
                      {conciseManufacturerText(product.manufacturers)}
                    </span>
                  </button>
                ))
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Точної реєстрової позиції не знайдено.
                </p>
              )}
            </div>
          ) : null}
        </section>
      ) : (
        <>
          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Інший препарат
            </Button>
          </div>
          <ProductSummary product={selected} />
          <SeriesRestrictionCheckPanel
            product={selected}
            draftSeries={seriesDraft}
            submittedSeries={submittedSeries}
            result={seriesCheck.data}
            isLoading={seriesCheck.isLoading || seriesCheck.isFetching}
            isError={seriesCheck.isError}
            onDraftSeriesChange={changeSeries}
            onSubmit={submitSeries}
          />
          <DispensingAssessmentPanel
            product={selected}
            seriesRestriction={seriesAssessment}
            dispensingCategory={dispensingCategoryAssessment}
          />
          <ManualChecklist
            checked={manualChecks}
            onChange={(index, value) =>
              setManualChecks((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index ? value : item,
                ),
              )
            }
          />
        </>
      )}
    </div>
  );
}
