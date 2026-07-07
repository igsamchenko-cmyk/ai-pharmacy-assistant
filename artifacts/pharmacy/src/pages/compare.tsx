import { useState } from "react";
import {
  useCompareDrugs,
  useCreateHistory,
  getListHistoryQueryKey,
  type Drug,
  type CompareResult,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GlobalDisclaimer } from "@/components/disclaimer";
import { DrugSearchSelect } from "@/components/drug-search-select";
import { RiskBadge } from "@/components/drug-badges";
import { useQueryClient } from "@tanstack/react-query";
import { X, Columns3, ShieldCheck } from "lucide-react";

function exampleFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("example");
  return value ? decodeURIComponent(value) : null;
}
export default function Compare() {
  const [selectedDrugs, setSelectedDrugs] = useState<Drug[]>([]);
  const [result, setResult] = useState<CompareResult | null>(null);
  const queryClient = useQueryClient();
  const example = exampleFromUrl();

  const compareDrugs = useCompareDrugs();
  const createHistory = useCreateHistory();

  const handleAdd = (drug: Drug) => {
    if (selectedDrugs.length < 5 && !selectedDrugs.find((d) => d.id === drug.id)) {
      setSelectedDrugs([...selectedDrugs, drug]);
      setResult(null);
    }
  };

  const handleRemove = (id: string) => {
    setSelectedDrugs(selectedDrugs.filter((d) => d.id !== id));
    setResult(null);
  };

  const handleCompare = () => {
    if (selectedDrugs.length < 2 || selectedDrugs.length > 5) return;

    compareDrugs.mutate(
      { data: { drugIds: selectedDrugs.map((d) => d.id) } },
      {
        onSuccess: (data) => {
          setResult(data);
          createHistory.mutate(
            {
              data: {
                type: "interaction",
                title:
                  "Порівняння: " +
                  selectedDrugs.map((d) => d.brandName).join(", "),
                detail: `Порівняно ${selectedDrugs.length} препарати(ів)`,
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

  return (
    <div className="space-y-6 animate-in fade-in pb-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <Columns3 className="w-6 h-6" />
          Порівняння препаратів
        </h1>
        <p className="text-sm text-muted-foreground">
          Додайте від 2 до 5 препаратів, щоб порівняти їх склад, показання та
          сумісність поруч.
        </p>
      </div>

      <GlobalDisclaimer />

      {example && selectedDrugs.length === 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 text-sm space-y-1">
            <p className="font-semibold text-foreground">Приклад для порівняння: {example}</p>
            <p className="text-muted-foreground">
              Додайте ці препарати через пошук нижче, щоб порівняти їх у static fallback каталозі.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <DrugSearchSelect
          onSelect={handleAdd}
          placeholder="Введіть назву препарату для порівняння..."
          disabled={selectedDrugs.length >= 5}
          label="Пошук препарату для порівняння"
          inputTestId="input-compare-search"
          optionTestId={(drug) => `btn-add-compare-${drug.id}`}
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
          disabled={selectedDrugs.length < 2 || compareDrugs.isPending}
          onClick={handleCompare}
          data-testid="btn-compare"
        >
          {compareDrugs.isPending ? "Порівняння..." : "Порівняти"}
        </Button>

        {selectedDrugs.length === 0 && !result && (
          <Card className="bg-card/50 border-dashed">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Натисніть приклад на головній сторінці або додайте 2 препарати. Порівняння доступне без PostgreSQL через static fallback.
            </CardContent>
          </Card>
        )}

        {compareDrugs.isError && (
          <div className="text-center py-4 px-4 text-sm text-destructive border border-destructive/30 rounded-lg">
            Не вдалося порівняти препарати. Спробуйте ще раз.
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-6 pt-4 animate-in slide-in-from-bottom-4 fade-in">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-card">
                  <th className="text-left p-3 font-semibold text-muted-foreground sticky left-0 bg-card min-w-[120px]">
                    Характеристика
                  </th>
                  {result.drugs.map((cd) => (
                    <th
                      key={cd.drug.id}
                      className="text-left p-3 font-bold text-foreground min-w-[180px] align-top"
                    >
                      <div>{cd.drug.brandName}</div>
                      <div className="text-xs font-normal text-primary mt-0.5">
                        {cd.drug.inn}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, ri) => (
                  <tr
                    key={ri}
                    className={ri % 2 === 0 ? "bg-background" : "bg-card/40"}
                  >
                    <td className="p-3 font-semibold text-muted-foreground align-top sticky left-0 bg-inherit">
                      {row.label}
                    </td>
                    {row.values.map((v, vi) => (
                      <td
                        key={vi}
                        className="p-3 text-foreground/90 align-top whitespace-pre-wrap"
                      >
                        {v ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold">Взаємодії між обраними</h2>
            {result.interactions.pairs.length === 0 ? (
              <Card className="bg-green-500/5 border-green-500/20">
                <CardContent className="p-6 flex items-center gap-3">
                  <ShieldCheck className="w-8 h-8 text-green-500 shrink-0" />
                  <p className="font-medium text-green-700 dark:text-green-400">
                    Значущих взаємодій між обраними препаратами не виявлено.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {result.interactions.pairs.map((pair, idx) => (
                  <Card key={idx} className="overflow-hidden">
                    <div className="p-4 border-b border-border bg-card/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="font-bold text-foreground">
                        {pair.drugAName}
                        <span className="text-muted-foreground mx-2">+</span>
                        {pair.drugBName}
                      </div>
                      <RiskBadge level={pair.riskLevel} />
                    </div>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">
                        {pair.explanation}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
