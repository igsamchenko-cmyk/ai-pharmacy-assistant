import {
  useGetDrugAnalogs,
  getGetDrugAnalogsQueryKey,
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ChevronRight, Pill } from "lucide-react";
import { type Drug } from "@workspace/api-client-react";

export default function Analogs() {
  const { id } = useParams();
  const {
    data: result,
    isLoading,
    isError,
  } = useGetDrugAnalogs(id || "", {
    query: { enabled: !!id, queryKey: getGetDrugAnalogsQueryKey(id || "") },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (isError || !result) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive font-medium">
          Не вдалося завантажити аналоги.
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

  const renderDrugList = (drugs: Drug[]) => {
    if (drugs.length === 0) {
      return (
        <p className="text-sm text-muted-foreground italic px-2">
          Варіантів у цій групі не знайдено.
        </p>
      );
    }
    return (
      <div className="space-y-3">
        {drugs.map((drug) => (
          <Link key={drug.id} href={`/drug/${drug.id}`}>
            <Card className="hover:border-primary/40 transition-colors group">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-foreground truncate">
                    {drug.brandName}
                  </h4>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground truncate">
                      {drug.inn}
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-[10px] py-0 font-normal"
                    >
                      {drug.form}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="text-[10px] py-0 font-normal"
                    >
                      {drug.dosage}
                    </Badge>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in pb-10">
      <div>
        <Link
          href={`/drug/${id}`}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm font-medium transition-colors mb-4 inline-flex"
        >
          <ArrowLeft className="w-4 h-4" />
          До препарату
        </Link>

        <h1 className="text-2xl font-bold text-foreground">
          Варіанти з тим самим МНН
        </h1>
        <div className="mt-4 p-4 bg-accent/20 border border-accent/30 rounded-xl flex items-center gap-3">
          <Pill className="w-6 h-6 text-primary shrink-0" />
          <div>
            <p className="font-bold text-foreground">{result.base.brandName}</p>
            <p className="text-sm text-muted-foreground">
              {result.base.inn} • {result.base.form} {result.base.dosage}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
          Точний збіг параметрів
          <span className="text-xs font-normal text-muted-foreground ml-2">
            (однакові МНН, повна форма та дозування)
          </span>
        </h2>
        {renderDrugList(result.full)}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
          Варіанти з відмінностями
          <span className="text-xs font-normal text-muted-foreground ml-2">
            (те саме МНН, але інша форма або дозування)
          </span>
        </h2>
        {renderDrugList(result.partial)}
      </div>

      <div className="mt-8 text-xs text-muted-foreground bg-muted/30 p-4 rounded-lg italic text-center">
        {result.disclaimer}
      </div>
    </div>
  );
}
