import React from "react";
import { Link } from "wouter";
import {
  ChevronRight,
  Clock,
  Columns3,
  GitCompare,
  Heart,
  Scan,
  Search,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  drugRefHref,
  type DrugRef,
  useFavorites,
  useRecentlyViewed,
} from "@/hooks/use-favorites";

interface QuickAction {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

export const QUICK_ACCESS_ACTIONS: QuickAction[] = [
  {
    href: "/search",
    icon: Search,
    title: "Знайти препарат",
    description: "Миттєвий пошук у каталозі",
  },
  {
    href: "/interactions",
    icon: GitCompare,
    title: "Перевірити взаємодії",
    description: "Обрати від 2 до 5 позицій",
  },
  {
    href: "/compare",
    icon: Columns3,
    title: "Порівняти препарати",
    description: "Зіставити дві точні позиції",
  },
  {
    href: "/scan",
    icon: Scan,
    title: "Сканувати упаковку",
    description: "Розпізнати препарат із фото",
  },
];

function DrugCard({ drug }: { drug: DrugRef }) {
  return (
    <Link
      href={drugRefHref(drug)}
      className="group block min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid={`quick-access-drug-${drug.id}`}
    >
      <Card className="h-full min-w-0 overflow-hidden border-border/80 motion-safe:transition-colors group-hover:border-primary/50 motion-reduce:transition-none">
        <CardContent className="flex min-w-0 items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="break-words text-base font-bold leading-tight text-foreground">
              {drug.brandName}
            </p>
            {drug.inn ? (
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {drug.inn}
              </p>
            ) : null}
            <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
              {drug.dosage ? (
                <Badge variant="secondary">{drug.dosage}</Badge>
              ) : null}
              {drug.form ? (
                <Badge
                  className="max-w-full whitespace-normal break-words text-left"
                  variant="outline"
                >
                  {drug.form}
                </Badge>
              ) : null}
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground motion-safe:transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </CardContent>
      </Card>
    </Link>
  );
}

export function QuickAccessContent({
  favorites,
  recent,
}: {
  favorites: DrugRef[];
  recent: DrugRef[];
}) {
  const favoriteIds = new Set(favorites.map((drug) => drug.id));
  const uniqueRecent = recent
    .filter((drug) => !favoriteIds.has(drug.id))
    .slice(0, 6);

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden pb-10">
      <header className="min-w-0 space-y-1">
        <h1 className="flex items-center gap-2 break-words text-2xl font-bold text-primary">
          <Zap className="h-6 w-6 shrink-0" />
          Швидкий доступ
        </h1>
        <p className="break-words text-sm text-muted-foreground">
          Обране, недавні препарати та основні дії — без повторного пошуку.
        </p>
      </header>

      <section
        aria-labelledby="quick-actions-heading"
        className="min-w-0 space-y-3"
      >
        <h2 id="quick-actions-heading" className="text-lg font-semibold">
          Що потрібно зробити?
        </h2>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          {QUICK_ACCESS_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group min-w-0 rounded-2xl border bg-card p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors hover:border-primary/50 motion-reduce:transition-none"
              data-testid={`quick-action-${action.href.slice(1)}`}
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="rounded-xl bg-primary/10 p-2 text-primary">
                  <action.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-semibold text-foreground">
                    {action.title}
                  </span>
                  <span className="mt-0.5 block break-words text-sm text-muted-foreground">
                    {action.description}
                  </span>
                </span>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground motion-safe:transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {favorites.length > 0 ? (
        <section
          aria-labelledby="quick-favorites-heading"
          className="min-w-0 space-y-3"
        >
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h2
              id="quick-favorites-heading"
              className="flex min-w-0 items-center gap-2 text-lg font-semibold"
            >
              <Heart className="h-5 w-5 shrink-0 text-primary" />
              Обране
            </h2>
            <Link
              href="/favorites"
              className="shrink-0 text-sm font-medium text-primary hover:underline"
            >
              Усі
            </Link>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            {favorites.slice(0, 6).map((drug) => (
              <DrugCard key={drug.id} drug={drug} />
            ))}
          </div>
        </section>
      ) : null}

      {uniqueRecent.length > 0 ? (
        <section
          aria-labelledby="quick-recent-heading"
          className="min-w-0 space-y-3"
        >
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h2
              id="quick-recent-heading"
              className="flex min-w-0 items-center gap-2 text-lg font-semibold"
            >
              <Clock className="h-5 w-5 shrink-0 text-primary" />
              Недавно переглянуті
            </h2>
            <Link
              href="/history"
              className="shrink-0 text-sm font-medium text-primary hover:underline"
            >
              Усі
            </Link>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            {uniqueRecent.map((drug) => (
              <DrugCard key={drug.id} drug={drug} />
            ))}
          </div>
        </section>
      ) : null}

      {favorites.length === 0 && uniqueRecent.length === 0 ? (
        <section
          className="min-w-0 rounded-2xl border border-dashed bg-card/50 p-6 text-center"
          data-testid="quick-access-empty"
        >
          <Search className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">Тут з’являться ваші препарати</h2>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            Відкрийте препарат або додайте його в обране, щоб повернутися до
            нього одним дотиком.
          </p>
          <Link
            href="/search"
            className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
          >
            Перейти до пошуку
          </Link>
        </section>
      ) : null}
    </div>
  );
}

export default function QuickAccess() {
  const { favorites } = useFavorites();
  const recent = useRecentlyViewed();
  return <QuickAccessContent favorites={favorites} recent={recent} />;
}
