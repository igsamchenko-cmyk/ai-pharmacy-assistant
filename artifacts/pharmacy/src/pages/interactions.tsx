import { useState } from "react";
import { useSearchDrugs, getSearchDrugsQueryKey, useCheckInteractions, useCreateHistory, getListHistoryQueryKey } from "@workspace/api-client-react";
import { type Drug, type InteractionResult, type InteractionPairRiskLevel } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GlobalDisclaimer } from "@/components/disclaimer";
import { useDebounce } from "@/hooks/use-debounce";
import { useQueryClient } from "@tanstack/react-query";
import { X, Search, GitCompare, AlertTriangle, ShieldCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Interactions() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300);
  const [selectedDrugs, setSelectedDrugs] = useState<Drug[]>([]);
  const queryClient = useQueryClient();

  const { data: searchResults, isLoading: isSearching } = useSearchDrugs(
    { q: debouncedQ },
    { query: { enabled: !!debouncedQ, queryKey: getSearchDrugsQueryKey({ q: debouncedQ }) } }
  );

  const checkInteractions = useCheckInteractions();
  const createHistory = useCreateHistory();

  const handleAdd = (drug: Drug) => {
    if (selectedDrugs.length < 5 && !selectedDrugs.find(d => d.id === drug.id)) {
      setSelectedDrugs([...selectedDrugs, drug]);
      setQ("");
    }
  };

  const handleRemove = (id: string) => {
    setSelectedDrugs(selectedDrugs.filter(d => d.id !== id));
    checkInteractions.reset();
  };

  const handleCheck = () => {
    if (selectedDrugs.length < 2 || selectedDrugs.length > 5) return;
    
    checkInteractions.mutate(
      { data: { drugIds: selectedDrugs.map(d => d.id) } },
      {
        onSuccess: () => {
          createHistory.mutate({
            data: {
              type: "interaction",
              title: "Перевірка взаємодій: " + selectedDrugs.map(d => d.brandName).join(", "),
              detail: `Перевірено ${selectedDrugs.length} препарати(ів)`
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

  const riskColors: Record<InteractionPairRiskLevel, string> = {
    low: "bg-green-500/10 text-green-700 border-green-200",
    medium: "bg-amber-500/10 text-amber-700 border-amber-200",
    high: "bg-orange-500/10 text-orange-700 border-orange-200",
    critical: "bg-red-500/10 text-red-700 border-red-200"
  };

  const riskLabels: Record<InteractionPairRiskLevel, string> = {
    low: "Низький ризик",
    medium: "Середній ризик",
    high: "Високий ризик",
    critical: "Критичний ризик"
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <GitCompare className="w-6 h-6" />
          Взаємодії препаратів
        </h1>
        <p className="text-sm text-muted-foreground">Додайте від 2 до 5 препаратів для перевірки їх сумісності.</p>
      </div>

      <GlobalDisclaimer />

      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input 
            placeholder="Введіть назву препарату для додавання..." 
            className="pl-9 bg-card"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={selectedDrugs.length >= 5}
            data-testid="input-interaction-search"
          />
        </div>

        {debouncedQ && (
          <Card className="absolute z-10 w-full max-w-3xl mt-1 shadow-lg border-primary/20 max-h-60 overflow-y-auto">
            <CardContent className="p-2 space-y-1">
              {isSearching ? (
                <div className="p-4 flex justify-center"><Skeleton className="h-6 w-1/2" /></div>
              ) : searchResults?.length ? (
                searchResults.map(drug => (
                  <button 
                    key={drug.id} 
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-accent text-sm font-medium transition-colors"
                    onClick={() => handleAdd(drug)}
                    data-testid={`btn-add-drug-${drug.id}`}
                  >
                    {drug.brandName} <span className="text-muted-foreground font-normal ml-2">{drug.form}</span>
                  </button>
                ))
              ) : (
                <div className="p-4 text-center text-sm text-muted-foreground">Нічого не знайдено</div>
              )}
            </CardContent>
          </Card>
        )}

        {selectedDrugs.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {selectedDrugs.map(drug => (
              <Badge key={drug.id} variant="secondary" className="px-3 py-1.5 text-sm flex items-center gap-2 bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                {drug.brandName}
                <button onClick={() => handleRemove(drug.id)} className="hover:text-destructive transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <Button 
          className="w-full font-bold h-12" 
          disabled={selectedDrugs.length < 2 || checkInteractions.isPending}
          onClick={handleCheck}
          data-testid="btn-check-interactions"
        >
          {checkInteractions.isPending ? "Перевірка..." : "Перевірити взаємодії"}
        </Button>
      </div>

      {checkInteractions.data && (
        <div className="space-y-4 pt-6 animate-in slide-in-from-bottom-4 fade-in">
          <h2 className="text-xl font-bold flex items-center gap-2">Результати перевірки</h2>
          
          {checkInteractions.data.pairs.length === 0 ? (
            <Card className="bg-green-500/5 border-green-500/20">
              <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-3">
                <ShieldCheck className="w-12 h-12 text-green-500" />
                <div>
                  <p className="font-bold text-green-700">Значущих взаємодій не виявлено</p>
                  <p className="text-sm text-green-700/80 mt-1">Препарати можна приймати разом, але завжди слідкуйте за реакцією організму.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {checkInteractions.data.pairs.map((pair, idx) => (
                <Card key={idx} className="overflow-hidden">
                  <div className="p-4 border-b border-border bg-card/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="font-bold text-foreground">
                      {pair.drugAName} <span className="text-muted-foreground mx-2">+</span> {pair.drugBName}
                    </div>
                    <Badge variant="outline" className={`font-bold px-3 py-1 ${riskColors[pair.riskLevel]}`}>
                      {riskLabels[pair.riskLevel]}
                    </Badge>
                  </div>
                  <CardContent className="p-4 space-y-4">
                    <div>
                      <p className="text-sm font-bold text-foreground mb-1">Що відбувається:</p>
                      <p className="text-sm text-muted-foreground">{pair.explanation}</p>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="bg-accent/20 p-3 rounded-lg border border-accent/30">
                        <p className="text-xs font-bold text-accent-foreground mb-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Що перевірити:
                        </p>
                        <p className="text-sm text-muted-foreground">{pair.whatToCheck}</p>
                      </div>
                      <div className="bg-destructive/5 p-3 rounded-lg border border-destructive/10">
                        <p className="text-xs font-bold text-destructive mb-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Коли до лікаря:
                        </p>
                        <p className="text-sm text-muted-foreground">{pair.whenToSeeDoctor}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
