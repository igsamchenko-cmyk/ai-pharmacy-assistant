import {
  useGetBetaDashboardStatus,
  useGetDrugStats,
  useListDataSources,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Columns3,
  Database,
  FlaskConical,
  GitCompare,
  Pill,
  PlayCircle,
  Search,
  ServerCog,
  ShieldCheck,
  Star,
  Stethoscope,
  XCircle,
  Clock,
} from "lucide-react";
import { GlobalDisclaimer } from "@/components/disclaimer";
import { Skeleton } from "@/components/ui/skeleton";
import { DEMO_LABEL } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { useFavorites, useRecentlyViewed } from "@/hooks/use-favorites";
import { roleLabel, useAuth } from "@/lib/auth";
import {
  COMPARE_EXAMPLES,
  INTERACTION_EXAMPLES,
  SEARCH_EXAMPLES,
  buildRuntimeSummary,
  containsSecretMarkers,
  visibleDashboardCards,
  type DashboardCard,
  type OnlineRouteId,
  type QuickExample,
} from "@/lib/online-dashboard";

const CARD_ICONS: Record<OnlineRouteId, typeof Search> = {
  home: Pill,
  search: Search,
  interactions: GitCompare,
  compare: Columns3,
  hospital: Stethoscope,
  "beta-dashboard": FlaskConical,
  "data-quality": Database,
  review: ClipboardList,
  about: ServerCog,
};

function boolLabel(value: boolean | null): string {
  if (value === null) return "unknown";
  return value ? "yes" : "no";
}

function StatusIcon({ value }: { value: boolean | null }) {
  if (value === null) return <AlertTriangle className="w-4 h-4 text-amber-600" />;
  return value ? (
    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
  ) : (
    <XCircle className="w-4 h-4 text-amber-600" />
  );
}

function DashboardCardLink({ card }: { card: DashboardCard }) {
  const Icon = CARD_ICONS[card.id];
  return (
    <Link
      href={card.href}
      data-testid={`dashboard-card-${card.id}`}
      className={card.prominent ? "md:col-span-2" : undefined}
    >
      <Card className={`h-full cursor-pointer transition-colors active:scale-[0.98] ${card.prominent ? "border-primary/50 bg-primary/5 hover:border-primary" : "hover:border-primary/50"}`}>
        <CardHeader className="p-4 pb-2">
          <div className="flex items-start justify-between gap-3">
            <Icon className="w-8 h-8 text-primary" />
            {card.prominent && <Badge variant="secondary">online smoke</Badge>}
          </div>
          <CardTitle className="text-base leading-tight">{card.title}</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <CardDescription className="text-xs leading-relaxed">
            {card.description}
          </CardDescription>
        </CardContent>
      </Card>
    </Link>
  );
}

function ExampleGroup({ title, examples }: { title: string; examples: QuickExample[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
        {title}
      </h3>
      <div className="flex flex-wrap gap-2">
        {examples.map((example) => (
          <Link key={example.label} href={example.href} data-testid={`example-${example.kind}-${example.label}`}>
            <Badge
              variant="outline"
              className="px-3 py-1.5 text-sm bg-card hover:bg-accent cursor-pointer transition-colors"
            >
              {example.label}
            </Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const auth = useAuth();
  const { data: stats, isLoading, isError } = useGetDrugStats();
  const betaStatus = useGetBetaDashboardStatus();
  const sourcesStatus = useListDataSources();
  const { favorites } = useFavorites();
  const recentlyViewed = useRecentlyViewed();

  const runtimeSummary = buildRuntimeSummary({
    status: betaStatus.data,
    sources: sourcesStatus.data,
    role: auth.session?.role,
    isLocalBeta: auth.isLocalBeta,
  });
  const visibleCards = visibleDashboardCards(auth.session?.role);
  const safeRuntimeText = JSON.stringify(runtimeSummary);
  const runtimeDataSafe = !containsSecretMarkers(safeRuntimeText);

  const runtimeRows = [
    { label: "Runtime mode", value: runtimeSummary.runtimeMode, boolean: null },
    { label: "PostgreSQL", value: `configured ${boolLabel(runtimeSummary.postgresqlConfigured)}`, boolean: runtimeSummary.postgresqlConfigured },
    { label: "Gemini", value: `configured ${boolLabel(runtimeSummary.geminiConfigured)}`, boolean: runtimeSummary.geminiConfigured },
    { label: "OpenAI", value: `enabled ${boolLabel(runtimeSummary.openAiEnabled)}`, boolean: runtimeSummary.openAiEnabled },
    { label: "Auth mode", value: runtimeSummary.authMode, boolean: null },
    { label: "Current role", value: roleLabel(runtimeSummary.currentRole), boolean: null },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary">
              FarmAssist
            </h1>
            <p className="text-muted-foreground text-lg">
              Онлайн-панель для швидкого beta smoke після входу.
            </p>
          </div>
          <Badge
            variant="outline"
            className="text-xs uppercase bg-accent/50 text-accent-foreground border-accent"
          >
            {DEMO_LABEL}
          </Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link href="/beta-dashboard" data-testid="link-open-beta-dashboard">
            <Button className="w-full h-12 gap-2 text-base font-semibold">
              <FlaskConical className="w-5 h-5" />
              Відкрити панель тестування
            </Button>
          </Link>
          <Link href="/beta-dashboard" data-testid="link-run-full-beta-check">
            <Button variant="outline" className="w-full h-12 gap-2 text-base font-semibold">
              <PlayCircle className="w-5 h-5" />
              Run full beta check
            </Button>
          </Link>
        </div>
      </section>

      <GlobalDisclaimer />

      <section className="grid gap-4 md:grid-cols-2">
        {visibleCards.map((card) => (
          <DashboardCardLink key={card.href} card={card} />
        ))}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Швидкі тестові приклади</h2>
          <p className="text-sm text-muted-foreground">
            Натисніть приклад, щоб перевірити роботу пошуку або відкрити відповідний workflow.
          </p>
        </div>
        <Card>
          <CardContent className="p-4 space-y-4">
            <ExampleGroup title="Search examples" examples={SEARCH_EXAMPLES} />
            <ExampleGroup title="Interaction examples" examples={INTERACTION_EXAMPLES} />
            <ExampleGroup title="Compare examples" examples={COMPARE_EXAMPLES} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Runtime status</h2>
          <p className="text-sm text-muted-foreground">
            Показано лише безпечні статуси без значень env або секретів.
          </p>
        </div>
        <Card data-testid="runtime-status-card">
          <CardContent className="p-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {runtimeRows.map((row) => (
                <div key={row.label} className="rounded-lg bg-muted/50 p-3 min-w-0">
                  <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                    <StatusIcon value={row.boolean} />
                    {row.label}
                  </div>
                  <div className="mt-1 font-semibold text-foreground break-words">
                    {row.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {runtimeSummary.dbWarning && (
                <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800" data-testid="warning-db-absent">
                  {runtimeSummary.dbWarning}
                </div>
              )}
              {runtimeSummary.geminiWarning && (
                <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800" data-testid="warning-gemini-absent">
                  {runtimeSummary.geminiWarning}
                </div>
              )}
              {!runtimeDataSafe && (
                <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  Runtime status hidden because unsafe diagnostic markers were detected.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4 pt-2">
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
              Не вдалося завантажити статистику. PostgreSQL не є обов’язковим: пошук може працювати через static fallback.
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

      {favorites.length > 0 && (
        <section className="space-y-3 pt-2">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
            Обране
          </h2>
          <div className="space-y-2">
            {favorites.slice(0, 5).map((f) => (
              <Link key={f.id} href={`/drug/${f.id}`}>
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
              <Link key={r.id} href={`/drug/${r.id}`}>
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
    </div>
  );
}
