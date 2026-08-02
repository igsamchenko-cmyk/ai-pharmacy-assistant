import React, { useLayoutEffect, useMemo, useState } from "react";
import {
  getGetDrugInstructionQueryKey,
  useGetDrugInstruction,
  type DrugInstruction,
} from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenText,
  CalendarDays,
  ChevronDown,
  CircleCheckBig,
  ExternalLink,
  FileCheck2,
  Search,
  ShieldX,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type SectionKey = keyof DrugInstruction["sections"];

export const INSTRUCTION_SAFETY_COPY =
  "Інформація відтворена з офіційної інструкції. Не змінюйте лікування без консультації лікаря.";

export const INSTRUCTION_PAGE_CLASS =
  "mx-auto min-w-0 w-full max-w-5xl overflow-x-hidden pb-16";

export const INSTRUCTION_HEADER_CLASS =
  "min-w-0 space-y-4 border-b pb-6";

export const INSTRUCTION_TITLE_CLASS =
  "max-w-full [overflow-wrap:anywhere] text-2xl font-bold leading-tight sm:text-3xl";

export type InstructionScrollTarget = {
  scrollTo(options: ScrollToOptions): void;
};

export function resetInstructionPageScroll(
  target: InstructionScrollTarget,
): void {
  target.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

export function InstructionTitle({ tradeName }: { tradeName: string }) {
  return (
    <h1 className={INSTRUCTION_TITLE_CLASS} data-testid="instruction-title">
      {tradeName}
    </h1>
  );
}

export const INSTRUCTION_SECTION_LABELS: ReadonlyArray<{
  key: SectionKey;
  label: string;
}> = [
  { key: "indications", label: "Показання" },
  { key: "contraindications", label: "Протипоказання" },
  { key: "adverseReactions", label: "Побічні реакції" },
  { key: "interactions", label: "Взаємодії" },
  { key: "specialWarnings", label: "Особливі застереження" },
  { key: "pregnancyAndLactation", label: "Вагітність і годування груддю" },
  { key: "administration", label: "Спосіб застосування та дози" },
  { key: "overdose", label: "Передозування" },
  { key: "storage", label: "Умови зберігання" },
];

const QUICK_SECTION_KEYS: SectionKey[] = ["specialWarnings", "interactions"];

export function filterInstructionSections(
  sections: DrugInstruction["sections"],
  query: string,
) {
  const normalized = query.trim().toLocaleLowerCase("uk-UA");
  if (!normalized) return INSTRUCTION_SECTION_LABELS;
  return INSTRUCTION_SECTION_LABELS.filter(({ key, label }) =>
    `${label}\n${sections[key] ?? ""}`
      .toLocaleLowerCase("uk-UA")
      .includes(normalized),
  );
}

export function InstructionSectionContent({
  content,
  missingMessage = "Розділ ще не структуровано. Відкрийте офіційну інструкцію нижче.",
}: {
  content: string | null;
  missingMessage?: string;
}) {
  return content ? (
    <p className="whitespace-pre-wrap break-words">{content}</p>
  ) : (
    <p className="text-muted-foreground">{missingMessage}</p>
  );
}

export function InstructionEssentials({
  sections,
}: {
  sections: DrugInstruction["sections"];
}) {
  return (
    <section
      className="py-6"
      aria-labelledby="instruction-essentials-title"
      data-testid="instruction-essentials"
    >
      <h2 id="instruction-essentials-title" className="text-xl font-semibold">
        Основне
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Точний текст двох ключових розділів офіційної інструкції.
      </p>
      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
        <article
          className="min-w-0 rounded-2xl border border-emerald-500/35 bg-emerald-500/5 p-4"
          data-testid="instruction-essential-indications"
        >
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <CircleCheckBig className="h-5 w-5 shrink-0 text-emerald-700" />
            Для чого застосовують
          </h3>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Показання
          </p>
          <div className="mt-3 text-sm leading-7">
            <InstructionSectionContent
              content={sections.indications}
              missingMessage="Показання ще не структуровано. Не робіть висновок про призначення препарату без офіційного документа."
            />
          </div>
        </article>

        <article
          className="min-w-0 rounded-2xl border border-destructive/40 bg-destructive/5 p-4"
          data-testid="instruction-essential-contraindications"
        >
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldX className="h-5 w-5 shrink-0 text-destructive" />
            Коли не застосовувати
          </h3>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Протипоказання
          </p>
          <div className="mt-3 text-sm leading-7">
            <InstructionSectionContent
              content={sections.contraindications}
              missingMessage="Протипоказання ще не структуровано. Це не означає, що протипоказань немає — перевірте офіційний документ."
            />
          </div>
        </article>
      </div>
    </section>
  );
}

export function OfficialInstructionLink({ url }: { url: string }) {
  return (
    <Button asChild className="mt-4 w-full sm:w-auto">
      <a href={url} target="_blank" rel="noreferrer">
        <ExternalLink className="h-4 w-4" />
        Відкрити оригінальний документ
      </a>
    </Button>
  );
}

function formatDocumentDate(value: string | null): string {
  if (!value) return "дату документа не вказано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "дату документа не вказано";
  return new Intl.DateTimeFormat("uk-UA", { dateStyle: "long" }).format(date);
}

function InstructionLoading() {
  return (
    <div
      className="mx-auto max-w-4xl space-y-6"
      aria-label="Завантаження інструкції"
    >
      <Skeleton className="h-9 w-32" />
      <Skeleton className="h-12 w-4/5" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function DrugInstructionPage() {
  const { productId = "" } = useParams<{ productId: string }>();
  const validProductId = /^[A-F0-9]{32}$/u.test(productId);
  const [sectionSearch, setSectionSearch] = useState("");
  const [fullInstructionOpen, setFullInstructionOpen] = useState(false);

  useLayoutEffect(() => {
    resetInstructionPageScroll(window);
  }, [productId]);

  const { data, isLoading, isError } = useGetDrugInstruction(productId, {
    query: {
      enabled: validProductId,
      queryKey: getGetDrugInstructionQueryKey(productId),
      staleTime: 6 * 60 * 60 * 1_000,
      retry: false,
    },
  });

  const visibleSections = useMemo(
    () => (data ? filterInstructionSections(data.sections, sectionSearch) : []),
    [data, sectionSearch],
  );

  if (isLoading && validProductId) return <InstructionLoading />;

  if (!validProductId || isError || !data) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <BookOpenText className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">Інструкція недоступна</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Для цього реєстрового запису немає перевіреної офіційної інструкції.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/search">
            <ArrowLeft className="h-4 w-4" />
            Повернутися до пошуку
          </Link>
        </Button>
      </div>
    );
  }

  const quickSections = INSTRUCTION_SECTION_LABELS.filter(
    ({ key }) => QUICK_SECTION_KEYS.includes(key) && data.sections[key],
  );

  return (
    <main className={INSTRUCTION_PAGE_CLASS}>
      <Link
        href="/search"
        className="mb-5 inline-flex min-h-9 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        До результатів пошуку
      </Link>

      <header className={INSTRUCTION_HEADER_CLASS}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="gap-1">
            <FileCheck2 className="h-3 w-3" />
            Офіційна інструкція
          </Badge>
          <Badge variant="outline">
            {data.provenance.availableSectionCount}/9 розділів
          </Badge>
        </div>
        <div className="min-w-0 max-w-full">
          <InstructionTitle tradeName={data.tradeName} />
          <p className="mt-2 max-w-full [overflow-wrap:anywhere] text-sm text-muted-foreground">
            {[data.inn, data.activeIngredient].filter(Boolean).join(" · ")}
          </p>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">
              Форма та дозування
            </dt>
            <dd className="mt-1 break-words">
              {data.dosageForm}, {data.strength}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Виробник</dt>
            <dd className="mt-1 break-words">
              {data.manufacturer}, {data.manufacturerCountry}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              Реєстраційне посвідчення
            </dt>
            <dd className="mt-1 break-words font-mono">
              {data.registrationNumber}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              Дата офіційного документа
            </dt>
            <dd className="mt-1 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0" />
              {formatDocumentDate(data.source.documentDate)}
            </dd>
          </div>
        </dl>
      </header>

      <Alert className="my-6 border-amber-500/60 bg-amber-500/5">
        <AlertTriangle className="h-4 w-4 text-amber-700" />
        <AlertTitle>Важливо</AlertTitle>
        <AlertDescription>{INSTRUCTION_SAFETY_COPY}</AlertDescription>
      </Alert>

      <InstructionEssentials sections={data.sections} />

      <section className="border-y py-4" aria-label="Швидка навігація">
        <div className="flex flex-wrap items-center gap-2">
          {quickSections.map(({ key, label }) => (
            <a
              key={key}
              href={`#instruction-${key}`}
              onClick={() => setFullInstructionOpen(true)}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
            >
              {label}
            </a>
          ))}
          <span className="text-xs text-muted-foreground">
            Оновлено: {formatDocumentDate(data.source.documentDate)}
          </span>
        </div>
      </section>

      <details
        className="group border-b"
        open={fullInstructionOpen}
        onToggle={(event) => setFullInstructionOpen(event.currentTarget.open)}
        data-testid="full-official-instruction"
      >
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-4 text-lg font-semibold">
          <span>Повна офіційна інструкція</span>
          <ChevronDown className="h-5 w-5 shrink-0 transition-transform duration-200 motion-reduce:transition-none group-open:rotate-180" />
        </summary>
        <section className="pb-6" aria-labelledby="instruction-contents-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2
                id="instruction-contents-title"
                className="text-lg font-semibold"
              >
                Зміст інструкції
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Текст відтворено без клінічного переказу або доповнень.
              </p>
            </div>
            <label className="relative block w-full sm:max-w-xs">
              <span className="sr-only">Пошук у розділах</span>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={sectionSearch}
                onChange={(event) => setSectionSearch(event.target.value)}
                className="pl-9"
                placeholder="Пошук в інструкції"
              />
            </label>
          </div>

          <nav
            className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm"
            aria-label="Розділи інструкції"
          >
            {INSTRUCTION_SECTION_LABELS.map(({ key, label }) => (
              <a
                key={key}
                href={`#instruction-${key}`}
                className="text-primary hover:underline"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="mt-6 border-t">
            {visibleSections.map(({ key, label }) => {
              const content = data.sections[key];
              return (
                <details
                  key={key}
                  id={`instruction-${key}`}
                  className="scroll-mt-20 border-b py-1"
                  open={
                    key === "indications" && !sectionSearch ? true : undefined
                  }
                >
                  <summary className="cursor-pointer list-none py-4 pr-8 font-semibold marker:content-none">
                    {label}
                  </summary>
                  <div className="pb-6 text-sm leading-7">
                    <InstructionSectionContent content={content} />
                  </div>
                </details>
              );
            })}
            {visibleSections.length === 0 ? (
              <p className="border-b py-8 text-center text-sm text-muted-foreground">
                У структурованих розділах збігів не знайдено.
              </p>
            ) : null}
          </div>
        </section>
      </details>

      <footer className="border-t pt-6">
        <p className="text-sm text-muted-foreground">
          Джерело: Державний реєстр лікарських засобів України. Ліцензія набору
          даних: {data.source.license}.
        </p>
        <OfficialInstructionLink url={data.source.url} />
      </footer>
    </main>
  );
}
