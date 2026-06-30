import { useState, useEffect } from "react";
import { useCreateAiSummary, useSearchDrugs, getSearchDrugsQueryKey, useCreateHistory, getListHistoryQueryKey } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GlobalDisclaimer } from "@/components/disclaimer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Search, Info, AlertTriangle, ShieldAlert, HeartPulse, CheckCircle2 } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

export default function AiReference() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const initialDrugId = searchParams.get("drugId");

  const [mode, setMode] = useState<"search" | "query">(initialDrugId ? "search" : "query");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300);
  const [customQuery, setCustomQuery] = useState("");
  const [selectedDrug, setSelectedDrug] = useState<{id: string, name: string} | null>(null);

  const queryClient = useQueryClient();
  const createAiSummary = useCreateAiSummary();
  const createHistory = useCreateHistory();

  const { data: searchResults, isLoading: isSearching } = useSearchDrugs(
    { q: debouncedQ },
    { query: { enabled: !!debouncedQ && mode === "search", queryKey: getSearchDrugsQueryKey({ q: debouncedQ }) } }
  );

  useEffect(() => {
    if (initialDrugId && !createAiSummary.data && !createAiSummary.isPending) {
      handleGenerate(initialDrugId, undefined);
    }
  }, [initialDrugId]);

  const handleGenerate = (drugId?: string, textQuery?: string) => {
    createAiSummary.mutate(
      { data: { drugId, query: textQuery } },
      {
        onSuccess: (data) => {
          createHistory.mutate({
            data: {
              type: "ai",
              title: data.drugName || "AI-запит",
              detail: textQuery ? `Запит: ${textQuery}` : "Довідка по препарату"
            }
          }, {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListHistoryQueryKey() });
            }
          });
        }
      }
    );
  };

  const onSubmit = () => {
    if (mode === "search" && selectedDrug) {
      handleGenerate(selectedDrug.id);
    } else if (mode === "query" && customQuery.trim()) {
      handleGenerate(undefined, customQuery.trim());
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <Sparkles className="w-6 h-6" />
          AI-довідка
        </h1>
        <p className="text-sm text-muted-foreground">Швидкий аналіз препарату або відповідь на запитання фармацевта.</p>
      </div>

      {!createAiSummary.data && (
        <Card className="bg-card">
          <CardContent className="p-4 space-y-4">
            <div className="flex bg-accent/20 p-1 rounded-lg">
              <button 
                className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors ${mode === "query" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setMode("query")}
              >
                Вільний запит
              </button>
              <button 
                className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors ${mode === "search" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setMode("search")}
              >
                Обрати препарат
              </button>
            </div>

            {mode === "search" ? (
              <div className="space-y-2 relative">
                {selectedDrug ? (
                  <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-between">
                    <span className="font-bold text-primary">{selectedDrug.name}</span>
                    <button onClick={() => setSelectedDrug(null)} className="text-sm text-muted-foreground hover:text-destructive">Змінити</button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                      <Input 
                        placeholder="Введіть назву препарату..." 
                        className="pl-9 bg-background"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                      />
                    </div>
                    {debouncedQ && (
                      <Card className="absolute z-10 w-full mt-1 shadow-lg border-primary/20 max-h-60 overflow-y-auto">
                        <CardContent className="p-2 space-y-1">
                          {isSearching ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">Пошук...</div>
                          ) : searchResults?.length ? (
                            searchResults.map(drug => (
                              <button 
                                key={drug.id} 
                                className="w-full text-left px-3 py-2 rounded-md hover:bg-accent text-sm font-medium transition-colors"
                                onClick={() => setSelectedDrug({ id: drug.id, name: drug.brandName })}
                              >
                                {drug.brandName}
                              </button>
                            ))
                          ) : (
                            <div className="p-4 text-center text-sm text-muted-foreground">Нічого не знайдено</div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </div>
            ) : (
              <Textarea 
                placeholder="Опишіть ситуацію (наприклад: 'Чи можна поєднувати ібупрофен та парацетамол дорослому?')" 
                className="min-h-[100px] resize-none bg-background"
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
              />
            )}

            <Button 
              className="w-full font-bold h-12" 
              onClick={onSubmit}
              disabled={createAiSummary.isPending || (mode === "search" && !selectedDrug) || (mode === "query" && !customQuery.trim())}
              data-testid="btn-generate-ai"
            >
              {createAiSummary.isPending ? "Аналізуємо..." : "Сформувати довідку"}
            </Button>
          </CardContent>
        </Card>
      )}

      {createAiSummary.isPending && !createAiSummary.data && (
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-32 bg-muted rounded-xl w-full"></div>
          <div className="h-32 bg-muted rounded-xl w-full"></div>
        </div>
      )}

      {createAiSummary.data && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 fade-in">
          {createAiSummary.data.isFallback && (
            <Alert className="bg-accent/30 border-accent text-accent-foreground">
              <Info className="h-4 w-4" />
              <AlertTitle>Демо-режим</AlertTitle>
              <AlertDescription>AI-асистент не налаштований. Використовуються демонстраційні дані.</AlertDescription>
            </Alert>
          )}

          {createAiSummary.data.blocked ? (
            <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
              <ShieldAlert className="h-5 w-5" />
              <AlertTitle className="text-lg font-bold">Запит заблоковано</AlertTitle>
              <AlertDescription className="text-base mt-2">
                {createAiSummary.data.blockedMessage}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-foreground">{createAiSummary.data.drugName || "Результат аналізу"}</h2>
                <Button variant="ghost" size="sm" onClick={() => createAiSummary.reset()}>Новий запит</Button>
              </div>

              <div className="grid gap-4">
                {createAiSummary.data.whatItIs && (
                  <Card className="border-primary/10 shadow-sm">
                    <CardContent className="p-4 space-y-2">
                      <h3 className="font-bold text-primary flex items-center gap-2">
                        <Info className="w-4 h-4" /> Що це
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{createAiSummary.data.whatItIs}</p>
                    </CardContent>
                  </Card>
                )}

                {createAiSummary.data.whatFor && (
                  <Card className="border-primary/10 shadow-sm">
                    <CardContent className="p-4 space-y-2">
                      <h3 className="font-bold text-primary flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500" /> Для чого
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{createAiSummary.data.whatFor}</p>
                    </CardContent>
                  </Card>
                )}

                {createAiSummary.data.mainRisks && (
                  <Card className="border-destructive/20 shadow-sm bg-destructive/5">
                    <CardContent className="p-4 space-y-2">
                      <h3 className="font-bold text-destructive flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" /> Основні ризики
                      </h3>
                      <p className="text-sm text-destructive/90 leading-relaxed">{createAiSummary.data.mainRisks}</p>
                    </CardContent>
                  </Card>
                )}

                <div className="grid sm:grid-cols-2 gap-4">
                  {createAiSummary.data.pharmacistChecklist && (
                    <Card className="border-accent shadow-sm bg-accent/10">
                      <CardContent className="p-4 space-y-2">
                        <h3 className="font-bold text-accent-foreground flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4" /> Що перевірити
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{createAiSummary.data.pharmacistChecklist}</p>
                      </CardContent>
                    </Card>
                  )}

                  {createAiSummary.data.patientExplanation && (
                    <Card className="border-secondary shadow-sm bg-secondary/20">
                      <CardContent className="p-4 space-y-2">
                        <h3 className="font-bold text-foreground flex items-center gap-2">
                          <HeartPulse className="w-4 h-4 text-pink-500" /> Як пояснити пацієнту
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed italic border-l-2 border-primary/30 pl-3">{createAiSummary.data.patientExplanation}</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
              
              <div className="bg-muted/40 p-4 rounded-xl text-xs text-muted-foreground italic text-center mt-6">
                {createAiSummary.data.disclaimer}
              </div>
            </div>
          )}
        </div>
      )}
      <GlobalDisclaimer />
    </div>
  );
}
