import React, { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  getGetProfessionalProductProfileQueryKey,
  getProfessionalProductProfile,
  useGetProfessionalProductProfile,
  type DispensingCategoryCheck,
  type ProfessionalProductProfile,
  type RegistryProductResult,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  Banknote,
  BellRing,
  BookOpenText,
  CheckCircle2,
  CircleHelp,
  Clock,
  ClipboardCheck,
  Database,
  ExternalLink,
  GitCompare,
  LoaderCircle,
  OctagonX,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RegistryInteractionSearchSelect,
  type InteractionProductSelection,
} from "@/components/registry-interaction-search-select";
import {
  buildDispensingAssessment,
  type DispensingAssessment,
  type DispensingCheckTone,
} from "@/lib/dispensing-safety";
import { conciseManufacturerText } from "@/lib/manufacturer-display";
import { registryProductDetailHref } from "@/lib/registry-product-route";
import { drugRefHref, useRecentlyViewed } from "@/hooks/use-favorites";
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

const PROFILE_SOURCE_LABELS: Record<
  ProfessionalProductProfile["coverage"]["sources"][number]["status"],
  string
> = {
  ready: "Підтверджено",
  attention: "Потребує уваги",
  requires_input: "Потрібні дані",
  not_connected: "Не підключено",
  unavailable: "Недоступно",
};

export function ProfessionalProfileCoveragePanel({
  profile,
}: {
  profile: ProfessionalProductProfile;
}) {
  return (
    <Card data-testid="professional-profile-coverage">
      <CardHeader className="space-y-2 p-4 pb-2 sm:p-5 sm:pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-xl">Єдиний профіль джерел</CardTitle>
          <Badge variant="outline">
            Підключено {profile.coverage.connectedSources}/
            {profile.coverage.totalSources}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Кожен статус прив'язаний до точної реєстрової позиції. Неповне
          покриття не є дозволом на відпуск.
        </p>
      </CardHeader>
      <CardContent className="grid gap-2 p-4 pt-2 sm:grid-cols-2 sm:p-5 sm:pt-2">
        {profile.coverage.sources.map((item) => (
          <div
            key={item.key}
            className="flex min-h-12 items-center justify-between gap-3 rounded-xl border bg-background/60 px-3 py-2"
            data-testid={"profile-source-" + item.key}
          >
            <span className="min-w-0 break-words text-sm font-medium">
              {item.label}
            </span>
            <Badge
              variant={item.status === "ready" ? "default" : "secondary"}
              className="shrink-0"
            >
              {PROFILE_SOURCE_LABELS[item.status]}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
function formatUah(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "Не оприлюднено";
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${value} грн`;
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(amount);
}

export function OfficialProgramsPanel({
  profile,
  isLoading = false,
  error = null,
  onSelectReimbursementPackage,
  onSelectPricePackage,
}: {
  profile: ProfessionalProductProfile;
  isLoading?: boolean;
  error?: string | null;
  onSelectReimbursementPackage?: (packageKey: string) => void;
  onSelectPricePackage?: (catalogId: string) => void;
}) {
  const reimbursement = profile.reimbursement;
  const price = profile.price;
  const listedReimbursementPackage =
    reimbursement?.status === "listed" ? reimbursement.selected : null;
  const reimbursedPackage =
    reimbursement?.source.freshness === "current"
      ? listedReimbursementPackage
      : null;

  return (
    <section className="space-y-3" data-testid="official-programs-panel">
      <div>
        <h2 className="text-xl font-bold">Офіційні програми та ціни</h2>
        <p className="text-sm text-muted-foreground">
          Результати зіставлено лише за точним реєстраційним номером. Для
          неоднозначних записів потрібно обрати упаковку.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Упаковку не підтверджено</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="overflow-hidden" data-testid="reimbursement-card">
          <CardHeader className="space-y-2 p-4 pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base">«Доступні ліки»</CardTitle>
              <Badge
                variant={reimbursedPackage ? "default" : "secondary"}
                className="shrink-0"
              >
                {reimbursement && reimbursement.source.freshness !== "current"
                  ? reimbursement.source.freshness === "stale"
                    ? "Дані застарілі"
                    : "Дані неповні"
                  : reimbursedPackage
                    ? "Включено"
                    : reimbursement?.status === "requires_package"
                      ? "Оберіть упаковку"
                      : reimbursement?.status === "not_listed"
                        ? "Не підтверджено"
                        : "Недоступно"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {reimbursement?.summary ??
                "Офіційний знімок переліку НСЗУ недоступний."}
            </p>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-1 text-sm">
            {listedReimbursementPackage ? (
              <div className="rounded-xl border bg-primary/5 p-3">
                <p className="font-semibold">
                  {listedReimbursementPackage.tradeName}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {[
                    listedReimbursementPackage.strength,
                    listedReimbursementPackage.dosageForm,
                    listedReimbursementPackage.packageQuantity,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-2 text-lg font-bold text-primary">
                  {Number(listedReimbursementPackage.copayUah) === 0
                    ? "Безоплатно"
                    : `Доплата ${formatUah(listedReimbursementPackage.copayUah)}`}
                </p>
              </div>
            ) : null}

            {reimbursement && reimbursement.candidates.length > 1 ? (
              <label className="block space-y-1.5">
                <span className="font-medium">Точна упаковка НСЗУ</span>
                <select
                  value={listedReimbursementPackage?.packageKey ?? ""}
                  disabled={isLoading || !onSelectReimbursementPackage}
                  onChange={(event) => {
                    if (event.target.value) {
                      onSelectReimbursementPackage?.(event.target.value);
                    }
                  }}
                  className="min-h-11 w-full rounded-xl border bg-background px-3 py-2 text-sm"
                  aria-label="Точна упаковка програми Доступні ліки"
                >
                  <option value="" disabled>
                    Оберіть форму, дозування й кількість
                  </option>
                  {reimbursement.candidates.map((candidate) => (
                    <option
                      key={candidate.packageKey}
                      value={candidate.packageKey}
                    >
                      {candidate.tradeName} — {candidate.strength} — №
                      {candidate.packageQuantity} —{" "}
                      {formatUah(candidate.copayUah)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {reimbursement ? (
              <p className="text-xs text-muted-foreground">
                Джерело:{" "}
                <a
                  href={reimbursement.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  НСЗУ <ExternalLink className="ml-1 inline h-3 w-3" />
                </a>
                {formatCheckedAt(reimbursement.source.checkedAt)
                  ? ` · перевірено ${formatCheckedAt(reimbursement.source.checkedAt)}`
                  : ""}
              </p>
            ) : null}
            {reimbursement && reimbursement.source.freshness !== "current" ? (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Не використовуйте цей статус для відпуску без звірки з чинним
                переліком НСЗУ.
              </p>
            ) : null}
            {reimbursement?.source.warnings.length ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                У публікації та самому PDF різниться підсумкова кількість
                позицій; перевірка виконується за фактичними рядками PDF.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="overflow-hidden" data-testid="price-catalog-card">
          <CardHeader className="space-y-2 p-4 pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Banknote className="h-4 w-4 text-primary" />
                Національний каталог цін
              </CardTitle>
              <Badge variant="secondary" className="shrink-0">
                {price && price.source.freshness !== "current"
                  ? price.source.freshness === "stale"
                    ? "Дані застарілі"
                    : "Дані неповні"
                  : reimbursedPackage
                    ? "НСЗУ"
                    : price?.status === "priced"
                      ? "Ціну знайдено"
                      : price?.status === "requires_package"
                        ? "Оберіть упаковку"
                        : price?.status === "not_in_catalog"
                          ? "Поза каталогом"
                          : "Недоступно"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {reimbursedPackage
                ? "Для обраної реімбурсованої упаковки використовуйте офіційну суму доплати НСЗУ."
                : (price?.summary ??
                  "Офіційний знімок Національного каталогу цін недоступний.")}
            </p>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-1 text-sm">
            {!reimbursedPackage && price?.selected ? (
              <div className="grid gap-2 rounded-xl border bg-primary/5 p-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    Гранична роздрібна ціна
                  </p>
                  <p className="text-lg font-bold text-primary">
                    {formatUah(price.selected.maximumRetailPriceUah)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    Задекларована ціна
                  </p>
                  <p className="font-semibold">
                    {formatUah(price.selected.declaredPriceUah)}
                  </p>
                </div>
                <p className="break-words text-muted-foreground sm:col-span-2">
                  {price.selected.tradeName} ·{" "}
                  {price.selected.packageDescription}
                </p>
              </div>
            ) : null}

            {!reimbursedPackage && price && price.candidates.length > 1 ? (
              <label className="block space-y-1.5">
                <span className="font-medium">Точна упаковка каталогу</span>
                <select
                  value={price.selected?.catalogId ?? ""}
                  disabled={isLoading || !onSelectPricePackage}
                  onChange={(event) => {
                    if (event.target.value) {
                      onSelectPricePackage?.(event.target.value);
                    }
                  }}
                  className="min-h-11 w-full rounded-xl border bg-background px-3 py-2 text-sm"
                  aria-label="Точна упаковка Національного каталогу цін"
                >
                  <option value="" disabled>
                    Оберіть точний опис упаковки
                  </option>
                  {price.candidates.map((candidate) => (
                    <option
                      key={candidate.catalogId}
                      value={candidate.catalogId}
                    >
                      {candidate.tradeName} — {candidate.packageDescription} —{" "}
                      {formatUah(candidate.maximumRetailPriceUah)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {price ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Джерело:{" "}
                  <a
                    href={price.source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    МОЗ України <ExternalLink className="ml-1 inline h-3 w-3" />
                  </a>
                  {formatCheckedAt(price.source.checkedAt)
                    ? ` · перевірено ${formatCheckedAt(price.source.checkedAt)}`
                    : ""}
                </p>
                {price.source.freshness !== "current" ? (
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    Не використовуйте цю ціну без звірки з чинним каталогом МОЗ.
                  </p>
                ) : null}
                {!reimbursedPackage ? (
                  <p className="text-xs text-muted-foreground">
                    {price.source.scopeNote}
                  </p>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Перевіряємо точну упаковку…
        </p>
      ) : null}
    </section>
  );
}

export function DispensingAssessmentPanel({
  product,
  dispensingCategory,
  officialPrograms,
}: {
  product: RegistryProductResult;
  dispensingCategory?: DispensingCategoryCheck | null;
  officialPrograms?: ProfessionalProductProfile | null;
}) {
  const assessment = buildDispensingAssessment(
    product,
    dispensingCategory,
    officialPrograms ?? undefined,
  );
  const instructionStatus =
    product.instructionSourceStatus ??
    (product.instructionAvailable ? "structured" : "not_published");
  const officialInstructionUrl = product.officialInstructionDocumentUrl ?? null;
  const DecisionIcon =
    assessment.decision === "manual_review"
      ? CheckCircle2
      : assessment.decision === "blocked"
        ? OctagonX
        : ShieldAlert;

  return (
    <section className="space-y-4" data-testid="dispensing-assessment">
      <Alert
        variant={assessment.decision === "blocked" ? "destructive" : "default"}
        className={
          assessment.decision === "blocked"
            ? undefined
            : assessment.decision === "manual_review"
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-amber-500/40 bg-amber-500/5"
        }
      >
        <DecisionIcon className="h-4 w-4" />
        <AlertTitle>{assessment.decisionLabel}</AlertTitle>
        <AlertDescription>{assessment.decisionDetail}</AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Регуляторна картка</h2>
        <Badge variant="outline" data-testid="connected-source-count">
          Активні перевірки: {assessment.connectedCount}/
          {assessment.checks.length}
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

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
        <Button
          asChild
          variant="outline"
          className="min-h-11 whitespace-normal"
        >
          <a
            href={`/regulatory-radar?q=${encodeURIComponent(product.registration.number)}`}
          >
            <BellRing className="h-4 w-4" />
            Заборони й поновлення
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
  const recentlyViewed = useRecentlyViewed();
  const [selectedProfile, setSelectedProfile] =
    useState<ProfessionalProductProfile | null>(null);
  const [officialPackageLoading, setOfficialPackageLoading] = useState(false);
  const [officialPackageError, setOfficialPackageError] = useState<
    string | null
  >(null);
  const selected = selectedProfile?.product ?? null;
  const [pendingProduct, setPendingProduct] =
    useState<InteractionProductSelection | null>(null);
  const [manualChecks, setManualChecks] = useState<boolean[]>(
    MANUAL_DISPENSING_STEPS.map(() => false),
  );

  const profileParams = useMemo(
    () => ({
      productId: pendingProduct?.productId ?? "0".repeat(32),
      registrationNumber: pendingProduct?.registration ?? "UA/0/0/0",
    }),
    [pendingProduct],
  );
  const profileQuery = useGetProfessionalProductProfile(profileParams, {
    query: {
      enabled: Boolean(pendingProduct),
      queryKey: getGetProfessionalProductProfileQueryKey(profileParams),
      retry: 1,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  });
  const profileIdentityMismatch = Boolean(
    pendingProduct &&
    profileQuery.data &&
    (profileQuery.data.product.id !== pendingProduct.productId ||
      profileQuery.data.product.registration.number !==
        pendingProduct.registration),
  );
  const exactResolutionFailed = Boolean(
    pendingProduct &&
    !profileQuery.isLoading &&
    !profileQuery.isFetching &&
    (profileQuery.isError || profileIdentityMismatch),
  );

  useEffect(() => {
    if (!pendingProduct || !profileQuery.data) return;
    if (
      profileQuery.data.product.id !== pendingProduct.productId ||
      profileQuery.data.product.registration.number !==
        pendingProduct.registration
    ) {
      return;
    }
    setSelectedProfile(profileQuery.data);
    setPendingProduct(null);
  }, [pendingProduct, profileQuery.data]);

  const dispensingCategoryAssessment =
    selectedProfile?.dispensingCategory ?? null;
  const selectProduct = (product: InteractionProductSelection) => {
    setPendingProduct(product);
    setOfficialPackageError(null);
    setManualChecks(MANUAL_DISPENSING_STEPS.map(() => false));
  };

  const reset = () => {
    setSelectedProfile(null);
    setPendingProduct(null);
    setOfficialPackageLoading(false);
    setOfficialPackageError(null);
    setManualChecks(MANUAL_DISPENSING_STEPS.map(() => false));
  };

  const resolveOfficialPackage = async (selection: {
    reimbursementPackageKey?: string;
    priceCatalogId?: string;
  }) => {
    const current = selectedProfile;
    if (!current) return;
    setOfficialPackageLoading(true);
    setOfficialPackageError(null);
    try {
      const next = await getProfessionalProductProfile({
        productId: current.product.id,
        registrationNumber: current.product.registration.number,
        reimbursementPackageKey:
          selection.reimbursementPackageKey ??
          current.reimbursement?.selected?.packageKey,
        priceCatalogId:
          selection.priceCatalogId ?? current.price?.selected?.catalogId,
      });
      if (
        next.product.id !== current.product.id ||
        next.product.registration.number !== current.product.registration.number
      ) {
        throw new Error("profile_identity_mismatch");
      }
      setSelectedProfile(next);
    } catch {
      setOfficialPackageError(
        "Не вдалося повторно перевірити вибрану упаковку. Спробуйте ще раз або звірте офіційне джерело.",
      );
    } finally {
      setOfficialPackageLoading(false);
    }
  };

  return (
    <div className="max-w-full space-y-6 overflow-x-hidden pb-10 animate-in fade-in">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-primary/10 p-3">
            <ClipboardCheck className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Довідник лікарських засобів</h1>
            <p className="text-muted-foreground">
              Реєстрові, регуляторні та цінові дані точної позиції.
            </p>
          </div>
        </div>
      </header>

      {!selected ? (
        <section className="space-y-4">
          <Alert className="border-primary/30 bg-primary/5">
            <Database className="h-4 w-4" />
            <AlertTitle>Почніть з точної реєстрової позиції</AlertTitle>
            <AlertDescription>
              Введіть торгову назву, МНН або повний реєстраційний номер. Не
              обирайте препарат лише за схожою назвою.
            </AlertDescription>
          </Alert>
          <RegistryInteractionSearchSelect
            onSelect={selectProduct}
            disabled={Boolean(pendingProduct)}
            label="Знайти препарат у довіднику"
            placeholder="Наприклад: Енап, ібупрофен або UA/1234/01/01"
            inputTestId="dispensing-search-input"
          />
          <div className="flex justify-end">
            <Button asChild variant="outline" size="sm">
              <Link href="/search?type=registry_products">
                <Database className="h-4 w-4" />
                Повний каталог і фільтри
              </Link>
            </Button>
          </div>
          {recentlyViewed.length > 0 ? (
            <section
              className="space-y-2 pt-2"
              aria-labelledby="recently-viewed-heading"
            >
              <h2
                id="recently-viewed-heading"
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"
              >
                <Clock className="h-4 w-4" />
                Нещодавно переглянуті
              </h2>
              <div className="flex flex-wrap gap-2">
                {recentlyViewed.slice(0, 8).map((item) => (
                  <Link
                    key={item.id}
                    href={drugRefHref(item)}
                    className="rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
                  >
                    {item.brandName}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
          {pendingProduct ? (
            <Card data-testid="dispensing-exact-resolution">
              <CardContent className="space-y-3 p-4">
                {exactResolutionFailed ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Точну позицію не підтверджено</AlertTitle>
                    <AlertDescription>
                      Не використовуйте неповну картку як оперативну довідку.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="flex items-center gap-3 text-sm">
                    <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
                    <span>
                      Завантажуємо професійний профіль:{" "}
                      {pendingProduct.tradeName}
                    </span>
                  </div>
                )}
                {exactResolutionFailed ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void profileQuery.refetch()}
                    >
                      Повторити
                    </Button>
                    <Button type="button" variant="ghost" onClick={reset}>
                      Обрати інший препарат
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
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
          {selectedProfile ? (
            <OfficialProgramsPanel
              profile={selectedProfile}
              isLoading={officialPackageLoading}
              error={officialPackageError}
              onSelectReimbursementPackage={(packageKey) =>
                void resolveOfficialPackage({
                  reimbursementPackageKey: packageKey,
                })
              }
              onSelectPricePackage={(catalogId) =>
                void resolveOfficialPackage({ priceCatalogId: catalogId })
              }
            />
          ) : null}
          <DispensingAssessmentPanel
            product={selected}
            dispensingCategory={dispensingCategoryAssessment}
            officialPrograms={selectedProfile}
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
