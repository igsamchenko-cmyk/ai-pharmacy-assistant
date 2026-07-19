import React from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Factory, Trash2 } from "lucide-react";
import { drugRefHref, type DrugRef } from "@/hooks/use-favorites";

export function SavedDrugCard({
  drug,
  onRemove,
  removeLabel,
}: {
  drug: DrugRef;
  onRemove: (id: string) => void;
  removeLabel: string;
}) {
  return (
    <Card
      className="max-w-full overflow-hidden rounded-2xl transition-colors hover:border-primary/40"
      data-testid={"saved-drug-" + drug.id}
    >
      <CardContent className="min-w-0 p-0">
        <Link
          href={drugRefHref(drug)}
          className="flex min-w-0 items-start gap-3 p-4 active:bg-primary/5 sm:p-5"
          data-testid={"saved-drug-link-" + drug.id}
        >
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <h2 className="break-words text-lg font-bold leading-tight text-foreground">
                {drug.brandName}
              </h2>
              {drug.inn ? (
                <p className="mt-1 break-words text-sm text-primary">{drug.inn}</p>
              ) : null}
            </div>

            {drug.dosage || drug.form ? (
              <div className="flex min-w-0 flex-wrap gap-2">
                {drug.dosage ? (
                  <Badge className="max-w-full whitespace-normal">
                    {drug.dosage}
                  </Badge>
                ) : null}
                {drug.form ? (
                  <Badge
                    variant="secondary"
                    className="max-w-full whitespace-normal"
                  >
                    {drug.form}
                  </Badge>
                ) : null}
              </div>
            ) : null}

            {drug.manufacturer ? (
              <p className="flex min-w-0 items-start gap-2 text-xs text-muted-foreground">
                <Factory className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="break-words">{drug.manufacturer}</span>
              </p>
            ) : null}
            {drug.registration ? (
              <p className="break-words text-xs font-medium text-muted-foreground">
                {drug.registration}
              </p>
            ) : null}
          </div>
          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
        </Link>

        <div className="flex justify-end border-t px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="max-w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onRemove(drug.id)}
            aria-label={removeLabel + ": " + drug.brandName}
            data-testid={"remove-saved-drug-" + drug.id}
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{removeLabel}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
