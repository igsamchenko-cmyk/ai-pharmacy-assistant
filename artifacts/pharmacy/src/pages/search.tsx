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
import { Search as SearchIcon, Pill, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useDebounce } from "@/hooks/use-debounce";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300);
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

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-primary">Пошук препарату</h1>
        <p className="text-sm text-muted-foreground">
          Знайдіть потрібний препарат у демо-базі.
        </p>
      </div>

      <div className="flex gap-2 flex-col sm:flex-row">
        <label className="relative flex-1 block">
          <span className="sr-only">Пошук препарату за назвою або МНН</span>
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Введіть назву або МНН..."
            className="pl-9 bg-card"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Пошук препарату за назвою або МНН"
            data-testid="input-search-q"
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

      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))
        ) : isError ? (
          <div className="text-center py-12 px-4 text-destructive border-2 border-dashed border-destructive/30 rounded-xl">
            <p>
              Не вдалося виконати пошук. Перевірте зʼєднання і спробуйте ще раз.
            </p>
          </div>
        ) : !results?.length && debouncedQ ? (
          <div className="text-center py-12 px-4 text-muted-foreground border-2 border-dashed border-border rounded-xl">
            <SearchIcon className="w-8 h-8 mx-auto mb-3 opacity-20" />
            <p>Нічого не знайдено за запитом "{debouncedQ}"</p>
          </div>
        ) : !results?.length && !debouncedQ ? (
          <div className="text-center py-12 px-4 text-muted-foreground">
            <p className="text-sm">Почніть вводити текст для пошуку.</p>
          </div>
        ) : (
          results?.map((drug, i) => (
            <Link
              key={drug.id}
              href={`/drug/${drug.id}`}
              data-testid={`link-drug-${drug.id}`}
            >
              <Card
                className="hover:border-primary/40 transition-colors animate-in slide-in-from-bottom-2 fade-in"
                style={{
                  animationFillMode: "both",
                  animationDelay: `${i * 50}ms`,
                }}
              >
                <CardContent className="p-4 flex gap-4">
                  <div className="bg-accent/30 p-3 rounded-lg flex items-center justify-center shrink-0">
                    <Pill className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
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
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
