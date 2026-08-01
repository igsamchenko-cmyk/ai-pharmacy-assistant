import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CatalogClientIndexProduct } from "@workspace/catalog-index";
import { uniqueInteractionOptions } from "@/components/registry-interaction-search-select";
import { addInteractionSelection } from "./interactions";

function product(index: number): CatalogClientIndexProduct {
  return {
    productId: index.toString(16).toUpperCase().padStart(32, "A").slice(-32),
    registration: `UA/${1000 + index}/01/01`,
    tradeName: `ПРЕПАРАТ ${index}`,
    inn: `Речовина ${index}`,
    form: "таблетки",
    strength: `${index} мг`,
  };
}

const pickerSource = readFileSync(
  fileURLToPath(
    new URL(
      "../components/registry-interaction-search-select.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);
const pageSource = readFileSync(
  fileURLToPath(new URL("./interactions.tsx", import.meta.url)),
  "utf8",
);

describe("registry interaction selection", () => {
  it("deduplicates exact productId and registration options", () => {
    const first = product(1);
    expect(uniqueInteractionOptions([first, first, product(2)])).toEqual([
      first,
      product(2),
    ]);
  });

  it("keeps at most five exact registry positions", () => {
    const selected = Array.from({ length: 5 }, (_, index) =>
      product(index + 1),
    );
    expect(addInteractionSelection(selected, product(6))).toEqual(selected);
    expect(addInteractionSelection(selected, selected[0])).toEqual(selected);
  });

  it("uses the local browser index while ready and server search only as fallback", () => {
    expect(pickerSource).toContain('clientCatalog.status === "ready"');
    expect(pickerSource).toContain(
      'clientCatalog.status === "error" && debouncedQuery.length > 0',
    );
    expect(pickerSource).toContain("clientCatalog.search(query.trim(), {");
    expect(pickerSource).toContain("limit: 25");
    expect(pickerSource).toContain('scope: "registry_products"');
    expect(pickerSource).toContain("enabled: fallbackEnabled");
  });

  it("keeps the registry results in document flow so parent overflow cannot clip them", () => {
    expect(pickerSource).toContain(
      'className="relative z-20 mt-1 max-h-80 w-full max-w-full overflow-y-auto shadow-xl"',
    );
    expect(pickerSource).not.toContain(
      'className="absolute z-20 mt-1 max-h-80',
    );
  });

  it("submits exact productId plus registration and renders every evidence state", () => {
    expect(pageSource).toContain("productId: product.productId");
    expect(pageSource).toContain("registrationNumber: product.registration");
    for (const status of [
      "verified_interaction",
      "same_ingredient",
      "insufficient_evidence",
      "incomplete_composition",
    ]) {
      expect(pageSource).toContain(status);
    }
    expect(pageSource).toContain("не робить висновок про сумісність");
  });

  it("checks official instructions in parallel without promoting signals", () => {
    expect(pageSource).toContain("useGetInteractionInstructionSignals");
    expect(pageSource).toContain("instructionSignals.mutate({ data })");
    expect(pageSource).toContain("Кандидат — не правило");
    expect(pageSource).toMatch(
      /Сила й\s+клінічна значущість тут не визначаються автоматично/u,
    );
    expect(pageSource).toContain("Це не підтверджує сумісність");
  });

  it("shows limited evidence coverage even when some rules are eligible", () => {
    expect(pageSource).toContain(
      "checkInteractions.data.coverage.runtimeEligibleRules <",
    );
    expect(pageSource).toContain("Доказове покриття взаємодій обмежене");
    expect(pageSource).toContain("checkInteractions.data.coverage.totalRules");
    expect(pageSource).not.toContain("runtimeEligibleRules === 0");
  });

  it("keeps the mobile layout bounded without horizontal scrolling", () => {
    expect(pageSource).toContain("overflow-x-hidden");
    expect(pickerSource).toContain("max-w-full");
    expect(pageSource).not.toContain("min-w-max");
  });
});
