import { useState } from "react";
import {
  useSearchDrugs,
  getSearchDrugsQueryKey,
  type Drug,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Search } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

interface DrugSearchSelectProps {
  onSelect: (drug: Drug) => void;
  placeholder?: string;
  disabled?: boolean;
  inputTestId?: string;
  optionTestId?: (drug: Drug) => string;
  label?: string;
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
  const debouncedQ = useDebounce(q, 300);

  const {
    data: results,
    isLoading,
    isError,
  } = useSearchDrugs(
    { q: debouncedQ },
    {
      query: {
        enabled: !!debouncedQ,
        queryKey: getSearchDrugsQueryKey({ q: debouncedQ }),
      },
    },
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

      {debouncedQ && (
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
            ) : results?.length ? (
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
