import { useEffect, useState } from "react";
import {
  getListHistoryQueryKey,
  useCreateAiSummary,
  useCreateHistory,
  type AiSummary,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  HeartPulse,
  Info,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { GlobalDisclaimer } from "@/components/disclaimer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  loadSessionAiSummary,
  readSessionAiSummary,
} from "@/lib/ai-summary-session-cache";

function SummaryContent({ summary }: { summary: AiSummary }) {
  if (summary.blocked) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-5 w-5" />
        <AlertTitle>Запит заблоковано</AlertTitle>
        <AlertDescription>{summary.blockedMessage}</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="space-y-4">
      {summary.isFallback ? (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <Info className="h-4 w-4" />
          <AlertTitle>Резервна довідка</AlertTitle>
          <AlertDescription>
            AI-провайдер не налаштований; показано fallback із сервера.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {summary.whatItIs ? (
          <Card>
            <CardContent className="space-y-2 p-4">
              <h3 className="flex items-center gap-2 font-bold text-primary">
                <Info className="h-4 w-4" /> Що це
              </h3>
              <p className="whitespace-pre-line text-sm leading-7 text-muted-foreground">
                {summary.whatItIs}
              </p>
            </CardContent>
          </Card>
        ) : null}
        {summary.whatFor ? (
          <Card>
            <CardContent className="space-y-2 p-4">
              <h3 className="flex items-center gap-2 font-bold text-primary">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Для чого
              </h3>
              <p className="whitespace-pre-line text-sm leading-7 text-muted-foreground">
                {summary.whatFor}
              </p>
            </CardContent>
          </Card>
        ) : null}
        {summary.mainRisks ? (
          <Card className="border-destructive/25 bg-destructive/5">
            <CardContent className="space-y-2 p-4">
              <h3 className="flex items-center gap-2 font-bold text-destructive">
                <AlertTriangle className="h-4 w-4" /> Основні ризики
              </h3>
              <p className="whitespace-pre-line text-sm leading-7">
                {summary.mainRisks}
              </p>
            </CardContent>
          </Card>
        ) : null}
        {summary.pharmacistChecklist ? (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="space-y-2 p-4">
              <h3 className="flex items-center gap-2 font-bold">
                <ShieldAlert className="h-4 w-4 text-primary" /> Що перевірити
              </h3>
              <p className="whitespace-pre-line text-sm leading-7 text-muted-foreground">
                {summary.pharmacistChecklist}
              </p>
            </CardContent>
          </Card>
        ) : null}
        {summary.patientExplanation ? (
          <Card className="lg:col-span-2">
            <CardContent className="space-y-2 p-4">
              <h3 className="flex items-center gap-2 font-bold">
                <HeartPulse className="h-4 w-4 text-pink-500" /> Як пояснити
                пацієнту
              </h3>
              <p className="whitespace-pre-line border-l-2 border-primary/30 pl-3 text-sm italic leading-7 text-muted-foreground">
                {summary.patientExplanation}
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
      <p className="rounded-xl bg-muted/40 p-4 text-center text-xs italic text-muted-foreground">
        {summary.disclaimer}
      </p>
    </div>
  );
}

export function ProductAiSummary({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const queryClient = useQueryClient();
  const createAiSummary = useCreateAiSummary();
  const createHistory = useCreateHistory();
  const [summary, setSummary] = useState<AiSummary | null>(() =>
    readSessionAiSummary(productId),
  );
  const [error, setError] = useState(false);

  useEffect(() => {
    if (summary) return;
    let active = true;
    const cached = readSessionAiSummary(productId);
    void loadSessionAiSummary(productId, () =>
      createAiSummary.mutateAsync({ data: { drugId: productId } }),
    )
      .then((result) => {
        if (!active) return;
        setSummary(result);
        setError(false);
        if (!cached) {
          createHistory.mutate(
            {
              data: {
                type: "ai",
                title: result.drugName || productName,
                detail: "Розгорнута довідка по точній реєстровій позиції",
              },
            },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({
                  queryKey: getListHistoryQueryKey(),
                });
              },
            },
          );
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [
    createAiSummary,
    createHistory,
    productId,
    productName,
    queryClient,
    summary,
  ]);

  return (
    <section
      className="space-y-4 rounded-2xl border border-primary/25 bg-primary/[0.03] p-4 sm:p-5"
      data-testid="product-ai-summary"
    >
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <Sparkles className="h-5 w-5 text-primary" />
        Розгорнута AI-довідка
      </h2>
      {!summary && !error ? (
        <div
          className="space-y-3"
          role="status"
          aria-label="Формуємо AI-довідку"
        >
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Не вдалося сформувати довідку</AlertTitle>
          <AlertDescription>
            Закрийте секцію та відкрийте її повторно, щоб спробувати ще раз.
          </AlertDescription>
        </Alert>
      ) : null}
      {summary ? <SummaryContent summary={summary} /> : null}
      <GlobalDisclaimer />
    </section>
  );
}
