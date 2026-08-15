import React, { useEffect, useState } from "react";
import { Bookmark, Clock3, Heart, Search, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { SavedDrugCard } from "@/components/saved-drug-card";
import { Button } from "@/components/ui/button";
import {
  clearRecentlyViewed,
  removeRecentlyViewed,
  type DrugRef,
  useFavorites,
  useRecentlyViewed,
} from "@/hooks/use-favorites";
import { savedTabFromSearch, type SavedTab } from "@/lib/navigation-v3";

export function SavedList({
  items,
  emptyTab,
  onRemove,
}: {
  items: DrugRef[];
  emptyTab: SavedTab;
  onRemove: (id: string) => void;
}) {
  if (items.length) {
    return (
      <section className="grid min-w-0 gap-3" aria-label="Збережені препарати">
        {items.map((drug) => (
          <SavedDrugCard
            key={drug.id}
            drug={drug}
            onRemove={onRemove}
            removeLabel={
              emptyTab === "favorites"
                ? "Прибрати з обраного"
                : "Прибрати з історії"
            }
          />
        ))}
      </section>
    );
  }
  const favorites = emptyTab === "favorites";
  return (
    <section
      className="rounded-2xl border-2 border-dashed px-4 py-14 text-center"
      data-testid={
        favorites ? "favorites-empty-state" : "viewing-history-empty-state"
      }
    >
      {favorites ? (
        <Heart className="mx-auto h-12 w-12 text-muted-foreground/30" />
      ) : (
        <Clock3 className="mx-auto h-12 w-12 text-muted-foreground/30" />
      )}
      <h2 className="mt-4 text-lg font-bold">
        {favorites ? "Обране поки порожнє" : "Історія поки порожня"}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        {favorites
          ? "Відкрийте точну реєстрову позицію й натисніть «В обране»."
          : "Тут з’являться конкретні препарати, які ви відкриєте з пошуку."}
      </p>
      <Button asChild className="mt-5">
        <Link href="/?type=registry_products">
          <Search className="h-4 w-4" />
          Знайти препарат
        </Link>
      </Button>
    </section>
  );
}

export default function History() {
  const recent = useRecentlyViewed();
  const { favorites, removeFavorite, clearFavorites } = useFavorites();
  const [tab, setTab] = useState<SavedTab>(() =>
    savedTabFromSearch(
      typeof window === "undefined" ? "" : window.location.search,
    ),
  );

  useEffect(() => {
    const sync = () => setTab(savedTabFromSearch(window.location.search));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const selectTab = (next: SavedTab) => {
    const url = new URL(window.location.href);
    if (next === "history") url.searchParams.delete("tab");
    else url.searchParams.set("tab", "favorites");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    setTab(next);
  };
  const activeItems = tab === "favorites" ? favorites : recent;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 overflow-x-hidden pb-10">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-primary">
          <Bookmark className="h-6 w-6" />
          Збережене
        </h1>
        <p className="text-sm text-muted-foreground">
          Обрані й останні переглянуті реєстрові позиції в цьому браузері.
        </p>
      </header>

      <div
        className="grid grid-cols-2 rounded-2xl border bg-card p-1"
        role="tablist"
        aria-label="Розділи збереженого"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "history"}
          className={`min-h-11 rounded-xl px-3 font-semibold ${
            tab === "history" ? "bg-primary text-primary-foreground" : ""
          }`}
          onClick={() => selectTab("history")}
          data-testid="saved-tab-history"
        >
          Історія · {recent.length}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "favorites"}
          className={`min-h-11 rounded-xl px-3 font-semibold ${
            tab === "favorites" ? "bg-primary text-primary-foreground" : ""
          }`}
          onClick={() => selectTab("favorites")}
          data-testid="saved-tab-favorites"
        >
          Обране · {favorites.length}
        </button>
      </div>

      <section className="space-y-4" role="tabpanel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              {tab === "favorites" ? (
                <Heart className="h-5 w-5 fill-primary/15 text-primary" />
              ) : (
                <Clock3 className="h-5 w-5 text-primary" />
              )}
              {tab === "favorites" ? "Обране" : "Історія переглядів"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {tab === "favorites"
                ? "Збережені вручну препарати."
                : "Останні 20 відкритих препаратів."}
            </p>
          </div>
          {activeItems.length ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={
                tab === "favorites" ? clearFavorites : clearRecentlyViewed
              }
              data-testid={
                tab === "favorites"
                  ? "clear-favorites"
                  : "clear-viewing-history"
              }
            >
              <Trash2 className="h-4 w-4" />
              Очистити
            </Button>
          ) : null}
        </div>
        <SavedList
          items={activeItems}
          emptyTab={tab}
          onRemove={tab === "favorites" ? removeFavorite : removeRecentlyViewed}
        />
      </section>
    </main>
  );
}
