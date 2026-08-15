import React from "react";
import { Clock3, Heart } from "lucide-react";
import { Link } from "wouter";
import {
  drugRefHref,
  useFavorites,
  useRecentlyViewed,
} from "@/hooks/use-favorites";
import {
  buildQuickProductChips,
  quickProductChipLabel,
} from "@/lib/quick-product-chips";

export function QuickProductChips() {
  const { favorites } = useFavorites();
  const recent = useRecentlyViewed();
  const chips = buildQuickProductChips(favorites, recent);
  if (!chips.length) return null;
  const favoriteIds = new Set(favorites.map((drug) => drug.id));

  return (
    <div
      className="mt-2 flex items-center gap-2 overflow-x-auto pb-1"
      aria-label="Швидко відкрити збережені картки"
      data-testid="quick-product-chips"
    >
      <span className="shrink-0 text-xs text-muted-foreground">Швидко:</span>
      {chips.map((drug) => {
        const favorite = favoriteIds.has(drug.id);
        const Icon = favorite ? Heart : Clock3;
        return (
          <Link
            key={drug.id}
            href={drugRefHref(drug)}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
            data-testid="quick-product-chip"
          >
            <Icon
              className={
                favorite
                  ? "h-3.5 w-3.5 fill-primary/20 text-primary"
                  : "h-3.5 w-3.5 text-muted-foreground"
              }
            />
            {quickProductChipLabel(drug)}
          </Link>
        );
      })}
    </div>
  );
}
