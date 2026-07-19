import React from "react";
import { Columns3 } from "lucide-react";
import type { RegistryProductResult } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import {
  comparisonProductFromRegistry,
  useProductComparison,
} from "@/hooks/use-product-comparison";

interface ProductCompareButtonProps {
  product: RegistryProductResult;
  conciseForm: string;
  size?: "sm" | "lg";
  className?: string;
  testId?: string;
}

export function ProductCompareButton({
  product,
  conciseForm,
  size = "sm",
  className,
  testId = `compare-action-${product.id}`,
}: ProductCompareButtonProps) {
  const { addProduct, isFull, isSelected } = useProductComparison();
  const selected = isSelected(product.id);

  if (isFull && !selected) {
    return (
      <Button
        type="button"
        size={size}
        variant="outline"
        className={className}
        disabled
        data-testid={testId}
        title="У порівнянні вже є два препарати"
      >
        <Columns3 className="h-4 w-4 shrink-0" />
        Максимум 2
      </Button>
    );
  }

  return (
    <Button asChild size={size} variant="outline" className={className}>
      <a
        href="/compare"
        data-testid={testId}
        aria-label={selected ? `Відкрити порівняння з ${product.tradeName}` : `Додати ${product.tradeName} до порівняння`}
        onClick={() => {
          if (!selected) {
            addProduct(comparisonProductFromRegistry(product, conciseForm));
          }
        }}
      >
        <Columns3 className="h-4 w-4 shrink-0" />
        {selected ? "У порівнянні" : "Порівняти"}
      </a>
    </Button>
  );
}