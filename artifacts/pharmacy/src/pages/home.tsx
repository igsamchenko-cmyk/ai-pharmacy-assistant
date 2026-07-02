import {
  useGetDrugStats,
  getGetDrugStatsQueryKey,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link } from "wouter";
import { Search, GitCompare, Sparkles, Scan, Clock, Pill } from "lucide-react";
import { GlobalDisclaimer } from "@/components/disclaimer";
import { Skeleton } from "@/components/ui/skeleton";
import { DEMO_LABEL } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const { data: stats, isLoading, isError } = useGetDrugStats();

  const menuItems = [
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
      href: "/ai",
      icon: Sparkles,
      title: "AI-довідка",
      desc: "Швидка інформація про препарат",
    },
    {
      href: "/scan",
      icon: Scan,
      title: "Скан упаковки",
      desc: "Розпізнати препарат по фото",
    },
    {
      href: "/history",
      icon: Clock,
      title: "Історія",
      desc: "Останні запити та пошуки",
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

      <section className="space-y-4 pt-4">
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
