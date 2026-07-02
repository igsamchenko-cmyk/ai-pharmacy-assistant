import { useGetDrug, getGetDrugQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles,
  GitCompare,
  ArrowLeft,
  Pill,
  AlertTriangle,
  Info,
  BookOpen,
  Star,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { DEMO_LABEL } from "@/lib/constants";
import { useFavorites, recordRecentlyViewed } from "@/hooks/use-favorites";

export default function DrugDetail() {
  const { id } = useParams();
  const { isFavorite, toggleFavorite } = useFavorites();
  const {
    data: drug,
    isLoading,
    isError,
  } = useGetDrug(id || "", {
    query: { enabled: !!id, queryKey: getGetDrugQueryKey(id || "") },
  });

  useEffect(() => {
    if (drug) {
      recordRecentlyViewed({
        id: drug.id,
        brandName: drug.brandName,
        inn: drug.inn,
      });
    }
  }, [drug]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (isError || !drug) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive font-medium">
          Препарат не знайдено або сталася помилка.
        </p>
        <Link
          href="/search"
          className="text-primary hover:underline mt-4 inline-block"
        >
          Повернутися до пошуку
        </Link>
      </div>
    );
  }

  const sections = [
    {
      title: "Показання",
      content: drug.indications,
      icon: BookOpen,
      color: "text-blue-500",
    },
    {
      title: "Протипоказання",
      content: drug.contraindications,
      icon: AlertTriangle,
      color: "text-destructive",
    },
    {
      title: "Побічні дії",
      content: drug.sideEffects,
      icon: Info,
      color: "text-orange-500",
    },
    {
      title: "Особливі вказівки",
      content: drug.warnings,
      icon: AlertTriangle,
      color: "text-amber-500",
    },
    {
      title: "Зберігання",
      content: drug.storage,
      icon: Info,
      color: "text-muted-foreground",
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in pb-10">
      <div className="flex items-center gap-2 mb-2">
        <Link
          href="/search"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад
        </Link>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex items-start justify-between gap-4">
            <h1
              className="text-3xl font-bold text-foreground leading-tight"
              data-testid="text-drug-name"
            >
              {drug.brandName}
            </h1>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() =>
                  toggleFavorite({
                    id: drug.id,
                    brandName: drug.brandName,
                    inn: drug.inn,
                  })
                }
                className="p-2 rounded-full hover:bg-accent transition-colors"
                aria-label={
                  isFavorite(drug.id)
                    ? "Прибрати з обраного"
                    : "Додати в обране"
                }
                data-testid="btn-toggle-favorite"
              >
                <Star
                  className={`w-6 h-6 ${
                    isFavorite(drug.id)
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground"
                  }`}
                />
              </button>
              <Badge
                variant="outline"
                className="uppercase text-[10px] shrink-0"
              >
                {DEMO_LABEL}
              </Badge>
            </div>
          </div>
          <p className="text-lg text-primary font-medium mt-1">
            МНН / діюча речовина: {drug.inn}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge
            variant="secondary"
            className="text-sm font-medium bg-secondary/60 text-secondary-foreground"
          >
            {drug.form}
          </Badge>
          <Badge
            variant="secondary"
            className="text-sm font-medium bg-secondary/60 text-secondary-foreground"
          >
            {drug.dosage}
          </Badge>
          {drug.atcCode && (
            <Badge
              variant="outline"
              className="text-sm font-mono border-border text-muted-foreground"
              title="ATC Code"
            >
              {drug.atcCode}
            </Badge>
          )}
        </div>

        <p className="text-sm font-medium px-3 py-2 bg-accent/20 rounded-md text-accent-foreground border border-accent/20 inline-block">
          {drug.pharmacologicalGroup}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link href={`/analogs/${drug.id}`} className="flex-1">
            <Button
              className="w-full flex items-center gap-2 font-semibold"
              size="lg"
              data-testid="btn-analogs"
            >
              <GitCompare className="w-5 h-5" />
              Знайти аналоги
            </Button>
          </Link>
          <Link href={`/ai?drugId=${drug.id}`} className="flex-1">
            <Button
              variant="outline"
              className="w-full flex items-center gap-2 border-primary/20 text-primary hover:bg-primary/5 font-semibold"
              size="lg"
              data-testid="btn-ai"
            >
              <Sparkles className="w-5 h-5" />
              AI-довідка
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 mt-8">
        {sections.map((section, idx) => (
          <div key={idx} className="space-y-2">
            <h3 className="font-bold flex items-center gap-2 text-foreground/90">
              <section.icon className={`w-4 h-4 ${section.color}`} />
              {section.title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed pl-6 whitespace-pre-wrap">
              {section.content}
            </p>
            {idx < sections.length - 1 && <Separator className="mt-4" />}
          </div>
        ))}
      </div>

      <div className="text-xs text-muted-foreground/60 text-center pt-8">
        Джерело: {drug.source}
      </div>
    </div>
  );
}
