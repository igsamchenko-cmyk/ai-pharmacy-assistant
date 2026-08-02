import React from "react";
import { Link } from "wouter";
import { Heart, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SavedDrugCard } from "@/components/saved-drug-card";
import { type DrugRef, useFavorites } from "@/hooks/use-favorites";

export function FavoritesContent({
  favorites,
  onRemove,
  onClear,
}: {
  favorites: DrugRef[];
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 overflow-x-hidden pb-10">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-primary">
            <Heart className="h-6 w-6 fill-primary/15" />
            Обране
          </h1>
          <p className="text-sm text-muted-foreground">
            Збережені препарати доступні лише у цьому браузері.
          </p>
        </div>
        {favorites.length ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-w-full text-destructive"
            onClick={onClear}
            data-testid="clear-favorites"
          >
            <Trash2 className="h-4 w-4" />
            Очистити
          </Button>
        ) : null}
      </header>

      {favorites.length ? (
        <section
          className="grid min-w-0 gap-3"
          aria-label="Збережені препарати"
        >
          {favorites.map((drug) => (
            <SavedDrugCard
              key={drug.id}
              drug={drug}
              onRemove={onRemove}
              removeLabel="Прибрати з обраного"
            />
          ))}
        </section>
      ) : (
        <section
          className="rounded-2xl border-2 border-dashed px-4 py-14 text-center"
          data-testid="favorites-empty-state"
        >
          <Heart className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h2 className="mt-4 text-lg font-bold">Обране поки порожнє</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Відкрийте конкретний препарат і натисніть «В обране».
          </p>
          <Button asChild className="mt-5">
            <Link href="/search?type=registry_products">
              <Search className="h-4 w-4" />
              Знайти препарат
            </Link>
          </Button>
        </section>
      )}
    </div>
  );
}

export default function Favorites() {
  const { favorites, removeFavorite, clearFavorites } = useFavorites();
  return (
    <FavoritesContent
      favorites={favorites}
      onRemove={removeFavorite}
      onClear={clearFavorites}
    />
  );
}
