import {
  useGetDrugStats,
  getGetDrugStatsQueryKey,
  useSearchCatalog,
  getSearchCatalogQueryKey,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link } from "wouter";
import {
  Search,
  GitCompare,
  Columns3,
  Stethoscope,
  ClipboardCheck,
  Clock,
  Pill,
  Star,
  ChevronRight,
  Database,
} from "lucide-react";
import { GlobalDisclaimer } from "@/components/disclaimer";
import { Skeleton } from "@/components/ui/skeleton";
import { DEMO_LABEL } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  drugRefHref,
  useFavorites,
  useRecentlyViewed,
} from "@/hooks/use-favorites";

export const REGISTRY_CATALOG_HREF = "/search?type=registry_products";

export default function Home() {
  const { data: stats, isLoading, isError } = useGetDrugStats();
  const { data: catalogSummary } = useSearchCatalog(
    { q: "", type: "registry_products", page: 1, pageSize: 25 },
    {
      query: {
        queryKey: getSearchCatalogQueryKey({
          q: "",
          type: "registry_products",
          page: 1,
          pageSize: 25,
        }),
        staleTime: 60_000,
      },
    },
  );
  const { favorites } = useFavorites();
  const recentlyViewed = useRecentlyViewed();

  const menuItems = [
    {
      href: "/dispense",
      icon: ClipboardCheck,
      title: "Відпуск за 30 секунд",
      desc: "Єдиний профіль точної реєстрової позиції",
    },
    {
      href: "/search",
      icon: Search,
      title: "Пошук",
      desc: "Знайти препарат за назвою чи МНН",
    },
    {
      href: "/interactions",
      icon: GitCompare,
      title: "Взаємодії",
      desc: "Перевірити сумісність ліків",
    },
    {
      href: "/compare",
      icon: Columns3,
      title: "Порівняння",
      desc: "Зіставити препарати поруч",
    },
    {
      href: "/hospital",
      icon: Stethoscope,
      title: "Швидкий доступ",
      desc: "Обране, історія та основні дії",
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            FarmAssist
          </h1>
          <Badge
            variant="outline"
            className="text-xs uppercase bg-accent/50 text-accent-foreground border-accent"
          >
            {DEMO_LABEL}
          </Badge>
        </div>
        <p className="text-muted-foreground text-lg">
          Швидкий довідник фармацевта. Точно та надійно.
        </p>
      </section>

      <GlobalDisclaimer />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {menuItems.map((item, i) => (
          <Link
            key={item.href}
            href={item.href}
            data-testid={`menu-item-${item.href.replace("/", "")}`}
          >
            <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer active:scale-[0.98] duration-200">
              <CardHeader className="p-4 pb-2">
                <item.icon className="w-8 h-8 text-primary mb-2" />
                <CardTitle className="text-base">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <CardDescription className="text-xs">
                  {item.desc}
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <Button
        asChild
        variant="outline"
        className="min-h-12 h-auto w-full justify-start whitespace-normal px-4 py-3 text-left"
      >
        <Link href={REGISTRY_CATALOG_HREF} data-testid="link-registry-catalog">
          <Database className="h-5 w-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 break-words">
            Каталог препаратів
            {catalogSummary?.catalogTotal
              ? ` - ${catalogSummary.catalogTotal.toLocaleString("uk-UA")} позицій`
              : " - відкрити"}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </Link>
      </Button>

      {favorites.length > 0 && (
        <section className="space-y-3 pt-2">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
            Обране
          </h2>
          <div className="space-y-2">
            {favorites.slice(0, 5).map((f) => (
              <Link key={f.id} href={drugRefHref(f)}>
                <Card className="hover:border-primary/50 active:scale-[0.99] transition-all cursor-pointer">
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground truncate">
                        {f.brandName}
                      </div>
                      <div className="text-xs text-primary truncate">
                        {f.inn}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {recentlyViewed.length > 0 && (
        <section className="space-y-3 pt-2">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-muted-foreground" />
            Нещодавно переглянуті
          </h2>
          <div className="flex flex-wrap gap-2">
            {recentlyViewed.map((r) => (
              <Link key={r.id} href={drugRefHref(r)}>
                <Badge
                  variant="secondary"
                  className="px-3 py-1.5 text-sm bg-secondary/60 text-secondary-foreground hover:bg-secondary transition-colors cursor-pointer"
                >
                  {r.brandName}
                </Badge>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4 pt-4">
        <p className="text-xs text-muted-foreground">
          Основні групи нижче належать локальному довіднику та не є повним
          державним реєстром. Повний каталог доступний у вкладці «Пошук».
        </p>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Pill className="w-5 h-5 text-muted-foreground" />
          База препаратів
        </h2>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : isError || !stats ? (
          <Card className="bg-destructive/5 border-destructive/20">
            <CardContent className="p-4 text-sm text-destructive">
              Не вдалося завантажити статистику.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-primary/5 border-primary/10">
                <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                  <span className="text-3xl font-bold text-primary">
                    {stats.totalDrugs}
                  </span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-1">
                    Препаратів
                  </span>
                </CardContent>
              </Card>
              <Card className="bg-secondary/50 border-secondary">
                <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                  <span className="text-3xl font-bold text-foreground">
                    {stats.totalGroups}
                  </span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-1">
                    Груп
                  </span>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">
                  Основні групи
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <ul className="space-y-2">
                  {stats.groups.map((g, idx) => (
                    <li
                      key={idx}
                      className="flex justify-between items-center text-sm"
                    >
                      <span className="truncate pr-4 text-foreground/80 font-medium">
                        {g.group}
                      </span>
                      <span className="bg-accent/50 text-accent-foreground px-2 py-0.5 rounded-md text-xs font-bold">
                        {g.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}
      </section>
    </div>
  );
}
