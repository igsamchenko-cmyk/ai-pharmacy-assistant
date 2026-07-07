import { useState } from "react";
import {
  useSearchDrugs,
  getSearchDrugsQueryKey,
  SearchDrugsField,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Search as SearchIcon, Pill, Database, Gauge } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useDebounce } from "@/hooks/use-debounce";
import { DEMO_LABEL } from "@/lib/constants";
import { ReportIssueButton } from "@/components/report-issue-button";

function initialQueryFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

export default function SearchPage() {
  const [q, setQ] = useState(initialQueryFromUrl);
  const debouncedQ = useDebounce(q, 180);
  const [field, setField] = useState<SearchDrugsField>("all");

  const {
    data: results,
    isLoading,
    isError,
  } = useSearchDrugs(
    { q: debouncedQ, field },
    {
      query: {
        queryKey: getSearchDrugsQueryKey({ q: debouncedQ, field }),
        enabled: true,
      },
    },
  );

  const isUpdating = q.trim() !== debouncedQ.trim();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-primary">Пошук препарату</h1>
        <p className="text-sm text-muted-foreground">
          Знайдіть препарат у демо-базі за брендом, МНН, ATC, формою або дозуванням.
        </p>
      </div>

      <div className="flex gap-2 flex-col sm:flex-row">
        <label className="relative flex-1 block">
          <span className="sr-only">Пошук препарату за назвою або МНН</span>
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Назва, МНН, ATC або дозування..."
            className="pl-9 bg-card"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Пошук препарату за назвою або МНН"
            data-testid="input-search-q"
            autoFocus
          />
        </label>
        <Select
          value={field}
          onValueChange={(val) => setField(val as SearchDrugsField)}
        >
          <SelectTrigger
            className="w-full sm:w-[160px] bg-card"
            data-testid="select-search-field"
          >
            <SelectValue placeholder="Де шукати" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Усі поля</SelectItem>
            <SelectItem value="brand">Бренд</SelectItem>
            <SelectItem value="inn">МНН</SelectItem>
            <SelectItem value="atc">ATC код</SelectItem>
            <SelectItem value="form">Форма</SelectItem>
            <SelectItem value="dosage">Дозування</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isUpdating && (
        <p className="text-xs text-muted-foreground">Оновлення результатів…</p>
      )}

      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))
        ) : isError ? (
          <div className="py-8 px-4 text-destructive border-2 border-dashed border-destructive/30 rounded-xl space-y-3">
            <p className="font-medium">Не вдалося виконати пошук.</p>
            <p className="text-sm text-muted-foreground">
              Перевірте з'єднання або скористайтеся локальною демо-базою після відновлення API.
            </p>
            <ReportIssueButton
              type="ui_bug"
              context={`search-error:${debouncedQ || "empty"}`}
              compact
            />
          </div>
        ) : !results?.length && debouncedQ ? (
          <div className="py-10 px-4 text-muted-foreground border-2 border-dashed border-border rounded-xl space-y-3">
            <SearchIcon className="w-8 h-8 opacity-20" />
            <div>
              <p className="font-medium text-foreground">
                Нічого не знайдено за запитом "{debouncedQ}"
              </p>
              <p className="text-sm mt-1">
                Спробуйте МНН, бренд без дозування або латинську/англійську назву. Якщо це реальний beta miss, збережіть звіт.
              </p>
            </div>
            <ReportIssueButton
              type="search_miss"
              context={`search-miss:${debouncedQ}`}
              sourceSnapshot={{ field, query: debouncedQ }}
              compact
            />
          </div>
        ) : !results?.length && !debouncedQ ? (
          <div className="py-10 px-4 text-muted-foreground border border-dashed border-border rounded-xl">
            <p className="text-sm">
              База PostgreSQL ще не підключена, але пошук працює через static fallback. Натисніть приклад на головній сторінці або введіть назву препарату.
            </p>
          </div>
        ) : (
          results?.map((drug, i) => (
            <Card
              key={drug.id}
              className="hover:border-primary/40 transition-colors animate-in slide-in-from-bottom-2 fade-in"
              style={{
                animationFillMode: "both",
                animationDelay: `${i * 40}ms`,
              }}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex gap-4">
                  <div className="bg-accent/30 p-3 rounded-lg flex items-center justify-center shrink-0 self-start">
                    <Pill className="w-6 h-6 text-primary" />
                  </div>
                  <Link
                    href={`/drug/${drug.id}`}
                    data-testid={`link-drug-${drug.id}`}
                    className="flex-1 min-w-0 block"
                  >
                    <h3 className="font-bold text-foreground truncate">
                      {drug.brandName}
                    </h3>
                    <p className="text-sm text-muted-foreground truncate">
                      {drug.inn}
                    </p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-normal"
                      >
                        {drug.form} {drug.dosage}
                      </Badge>
                      {drug.atcCode && (
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono text-muted-foreground"
                        >
                          {drug.atcCode}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Database className="w-3 h-3" />
                        локальний каталог
                      </Badge>
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Gauge className="w-3 h-3" />
                        confidence: {DEMO_LABEL}
                      </Badge>
                    </div>
                  </Link>
                </div>
                <ReportIssueButton
                  type="wrong_mapping"
                  context={`drug-result:${drug.id}:query:${debouncedQ || "empty"}`}
                  sourceSnapshot={{
                    id: drug.id,
                    brandName: drug.brandName,
                    inn: drug.inn,
                    atcCode: drug.atcCode,
                    source: drug.source,
                  }}
                  compact
                />
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
