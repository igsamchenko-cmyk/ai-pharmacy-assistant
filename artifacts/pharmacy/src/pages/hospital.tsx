import { useState } from "react";
import {
  useSearchDrugs,
  getSearchDrugsQueryKey,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GroupBadge } from "@/components/drug-badges";
import { useFavorites } from "@/hooks/use-favorites";
import { useDebounce } from "@/hooks/use-debounce";
import { Search, Stethoscope, Star, ChevronRight } from "lucide-react";

/**
 * Hospital quick mode: a stripped-down, large-touch-target lookup for use at
 * the point of care. Type a name, tap a result to open full details. Favourites
 * surface first so common drugs are one tap away.
 */
export default function Hospital() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 250);
  const { favorites, isFavorite, toggleFavorite } = useFavorites();

  const {
    data: results,
    isLoading,
    isError,
  } = useSearchDrugs(
    { q: debouncedQ },
    {
      query: {
        enabled: !!debouncedQ,
        queryKey: getSearchDrugsQueryKey({ q: debouncedQ }),
      },
    },
  );

  const showFavorites = !debouncedQ && favorites.length > 0;

  return (
    <div className="space-y-5 animate-in fade-in pb-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <Stethoscope className="w-6 h-6" />
          Швидкий режим
        </h1>
        <p className="text-sm text-muted-foreground">
          Швидкий пошук препарату біля пацієнта. Великі кнопки, мінімум зайвого.
        </p>
      </div>

      <label className="relative block">
        <span className="sr-only">Пошук препарату</span>
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
        <Input
          autoFocus
          placeholder="Назва препарату або МНН..."
          className="pl-12 h-14 text-lg bg-card"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="input-hospital-search"
        />
      </label>

      {showFavorites && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
            Обране
          </h2>
          <div className="space-y-2">
            {favorites.map((f) => (
              <Link key={f.id} href={`/drug/${f.id}`}>
                <Card className="hover:border-primary/50 active:scale-[0.99] transition-all cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-lg text-foreground truncate">
                        {f.brandName}
                      </div>
                      <div className="text-sm text-primary truncate">
                        {f.inn}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {debouncedQ && (
        <section className="space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
            </div>
          ) : isError ? (
            <div className="text-center py-8 text-destructive">
              Помилка пошуку. Спробуйте ще раз.
            </div>
          ) : results?.length ? (
            <div className="space-y-2">
              {results.map((drug) => (
                <Card
                  key={drug.id}
                  className="hover:border-primary/50 transition-all"
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <Link
                      href={`/drug/${drug.id}`}
                      className="flex-1 min-w-0 active:scale-[0.99] transition-transform"
                      data-testid={`hospital-result-${drug.id}`}
                    >
                      <div className="font-bold text-lg text-foreground truncate">
                        {drug.brandName}
                      </div>
                      <div className="text-sm text-primary truncate mb-1">
                        {drug.inn} · {drug.form}
                      </div>
                      <GroupBadge group={drug.pharmacologicalGroup} />
                    </Link>
                    <button
                      onClick={() =>
                        toggleFavorite({
                          id: drug.id,
                          brandName: drug.brandName,
                          inn: drug.inn,
                        })
                      }
                      className="p-2 rounded-full hover:bg-accent shrink-0"
                      aria-label={
                        isFavorite(drug.id)
                          ? "Прибрати з обраного"
                          : "Додати в обране"
                      }
                      data-testid={`btn-fav-${drug.id}`}
                    >
                      <Star
                        className={`w-6 h-6 ${
                          isFavorite(drug.id)
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground"
                        }`}
                      />
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Нічого не знайдено
            </div>
          )}
        </section>
      )}
    </div>
  );
}
