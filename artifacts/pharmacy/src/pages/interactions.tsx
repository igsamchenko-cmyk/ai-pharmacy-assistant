import { useState } from "react";
import {
  useCheckInteractions,
  useCreateHistory,
  getListHistoryQueryKey,
} from "@workspace/api-client-react";
import {
  type Drug,
  type InteractionPairRiskLevel,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GlobalDisclaimer } from "@/components/disclaimer";
import { DrugSearchSelect } from "@/components/drug-search-select";
import { useQueryClient } from "@tanstack/react-query";
import { X, GitCompare, AlertTriangle, ShieldCheck } from "lucide-react";

export default function Interactions() {
  const [selectedDrugs, setSelectedDrugs] = useState<Drug[]>([]);
  const queryClient = useQueryClient();

  const checkInteractions = useCheckInteractions();
  const createHistory = useCreateHistory();

  const handleAdd = (drug: Drug) => {
    if (
      selectedDrugs.length < 5 &&
      !selectedDrugs.find((d) => d.id === drug.id)
    ) {
      setSelectedDrugs([...selectedDrugs, drug]);
    }
  };

  const handleRemove = (id: string) => {
    setSelectedDrugs(selectedDrugs.filter((d) => d.id !== id));
    checkInteractions.reset();
  };

  const handleCheck = () => {
    if (selectedDrugs.length < 2 || selectedDrugs.length > 5) return;

    checkInteractions.mutate(
      { data: { drugIds: selectedDrugs.map((d) => d.id) } },
      {
        onSuccess: () => {
          createHistory.mutate(
            {
              data: {
                type: "interaction",
                title:
                  "Перевірка взаємодій: " +
                  selectedDrugs.map((d) => d.brandName).join(", "),
                detail: `Перевірено ${selectedDrugs.length} препарати(ів)`,
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
        },
      },
    );
  };

  const riskColors: Record<InteractionPairRiskLevel, string> = {
    low: "bg-green-500/10 text-green-700 border-green-200",
    medium: "bg-amber-500/10 text-amber-700 border-amber-200",
    high: "bg-orange-500/10 text-orange-700 border-orange-200",
    critical: "bg-red-500/10 text-red-700 border-red-200",
  };

  const riskLabels: Record<InteractionPairRiskLevel, string> = {
    low: "Низький ризик",
    medium: "Середній ризик",
    high: "Високий ризик",
    critical: "Критичний ризик",
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <GitCompare className="w-6 h-6" />
          Взаємодії препаратів
        </h1>
        <p className="text-sm text-muted-foreground">
          Додайте від 2 до 5 препаратів для перевірки їх сумісності.
        </p>
      </div>

      <GlobalDisclaimer />

      <div className="space-y-4">
        <DrugSearchSelect
          onSelect={handleAdd}
          placeholder="Введіть назву препарату для додавання..."
          disabled={selectedDrugs.length >= 5}
          label="Пошук препарату для перевірки взаємодій"
          inputTestId="input-interaction-search"
          optionTestId={(drug) => `btn-add-drug-${drug.id}`}
        />

        {selectedDrugs.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {selectedDrugs.map((drug) => (
              <Badge
                key={drug.id}
                variant="secondary"
                className="px-3 py-1.5 text-sm flex items-center gap-2 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                {drug.brandName}
                <button
                  onClick={() => handleRemove(drug.id)}
                  className="hover:text-destructive transition-colors"
                  aria-label={`Прибрати ${drug.brandName}`}
                >
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
          {checkInteractions.isPending
            ? "Перевірка..."
            : "Перевірити взаємодії"}
        </Button>

        {checkInteractions.isError && (
          <div className="text-center py-4 px-4 text-sm text-destructive border border-destructive/30 rounded-lg">
            Не вдалося перевірити взаємодії. Спробуйте ще раз.
          </div>
        )}
      </div>

      {checkInteractions.data && (
        <div className="space-y-4 pt-6 animate-in slide-in-from-bottom-4 fade-in">
          <h2 className="text-xl font-bold flex items-center gap-2">
            Результати перевірки
          </h2>

          {checkInteractions.data.pairs.length === 0 ? (
            <Card className="bg-green-500/5 border-green-500/20">
              <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-3">
                <ShieldCheck className="w-12 h-12 text-green-500" />
                <div>
                  <p className="font-bold text-green-700">
                    Значущих взаємодій не виявлено
                  </p>
                  <p className="text-sm text-green-700/80 mt-1">
                    Препарати можна приймати разом, але завжди слідкуйте за
                    реакцією організму.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {checkInteractions.data.pairs.map((pair, idx) => (
                <Card key={idx} className="overflow-hidden">
                  <div className="p-4 border-b border-border bg-card/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="font-bold text-foreground">
                      {pair.drugAName}{" "}
                      <span className="text-muted-foreground mx-2">+</span>{" "}
                      {pair.drugBName}
                    </div>
                    <Badge
                      variant="outline"
                      className={`font-bold px-3 py-1 ${riskColors[pair.riskLevel]}`}
                    >
                      {riskLabels[pair.riskLevel]}
                    </Badge>
                  </div>
                  <CardContent className="p-4 space-y-4">
                    <div>
                      <p className="text-sm font-bold text-foreground mb-1">
                        Що відбувається:
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {pair.explanation}
                      </p>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="bg-accent/20 p-3 rounded-lg border border-accent/30">
                        <p className="text-xs font-bold text-accent-foreground mb-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Що перевірити:
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {pair.whatToCheck}
                        </p>
                      </div>
                      <div className="bg-destructive/5 p-3 rounded-lg border border-destructive/10">
                        <p className="text-xs font-bold text-destructive mb-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Коли до лікаря:
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {pair.whenToSeeDoctor}
                        </p>
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
