import { useMemo, useState } from "react";
import { normalizeCatalogIndexText } from "@workspace/catalog-index";
import {
  useSearchDrugs,
  getSearchDrugsQueryKey,
  type Drug,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Search } from "lucide-react";

interface DrugSearchSelectProps {
  onSelect: (drug: Drug) => void;
  placeholder?: string;
  disabled?: boolean;
  inputTestId?: string;
  optionTestId?: (drug: Drug) => string;
  label?: string;
}

export function filterDrugSearchOptions(
  drugs: readonly Drug[],
  query: string,
  limit = 20,
): Drug[] {
  const queryKey = normalizeCatalogIndexText(query);
  if (!queryKey) return [];
  return drugs
    .map((drug) => {
      const brandKey = normalizeCatalogIndexText(drug.brandName);
      const innKey = normalizeCatalogIndexText(drug.inn);
      const searchableKey = normalizeCatalogIndexText(
        [
          drug.brandName,
          drug.inn,
          drug.atcCode ?? "",
          drug.form,
          drug.dosage,
          drug.pharmacologicalGroup,
        ].join(" "),
      );
      const rank =
        brandKey === queryKey
          ? 0
          : brandKey.startsWith(queryKey)
            ? 1
            : innKey === queryKey
              ? 2
              : innKey.startsWith(queryKey)
                ? 3
                : searchableKey.includes(queryKey)
                  ? 4
                  : null;
      return rank === null ? null : { drug, rank };
    })
    .filter((item): item is { drug: Drug; rank: number } => item !== null)
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.drug.brandName.localeCompare(right.drug.brandName, "uk-UA"),
    )
    .slice(0, Math.max(1, limit))
    .map((item) => item.drug);
}

/**
 * Debounced type-ahead that searches the catalog and calls `onSelect` with the
 * chosen drug. Shared by the interaction checker and AI reference pages.
 */
export function DrugSearchSelect({
  onSelect,
  placeholder = "Введіть назву препарату...",
  disabled = false,
  inputTestId,
  optionTestId,
  label = "Пошук препарату",
}: DrugSearchSelectProps) {
  const [q, setQ] = useState("");

  const {
    data: allDrugs,
    isLoading,
    isError,
  } = useSearchDrugs(
    { q: "" },
    {
      query: {
        queryKey: getSearchDrugsQueryKey({ q: "" }),
        staleTime: 24 * 60 * 60 * 1_000,
        gcTime: 60 * 60 * 1_000,
        refetchOnWindowFocus: false,
      },
    },
  );
  const results = useMemo(
    () => filterDrugSearchOptions(allDrugs ?? [], q),
    [allDrugs, q],
  );

  const handleSelect = (drug: Drug) => {
    onSelect(drug);
    setQ("");
  };

  return (
    <div className="relative">
      <label className="relative block">
        <span className="sr-only">{label}</span>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder={placeholder}
          className="pl-9 bg-card"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={disabled}
          aria-label={label}
          data-testid={inputTestId}
        />
      </label>

      {q.trim() && (
        <Card className="absolute z-10 w-full mt-1 shadow-lg border-primary/20 max-h-60 overflow-y-auto">
          <CardContent className="p-2 space-y-1">
            {isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Пошук...
              </div>
            ) : isError ? (
              <div className="p-4 text-center text-sm text-destructive">
                Помилка пошуку. Спробуйте ще раз.
              </div>
            ) : results.length ? (
              results.map((drug) => (
                <button
                  key={drug.id}
                  type="button"
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-accent focus-visible:bg-accent focus-visible:outline-none text-sm font-medium transition-colors"
                  onClick={() => handleSelect(drug)}
                  data-testid={optionTestId?.(drug)}
                >
                  {drug.brandName}
                  <span className="text-muted-foreground font-normal ml-2">
                    {drug.form}
                  </span>
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Нічого не знайдено
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
