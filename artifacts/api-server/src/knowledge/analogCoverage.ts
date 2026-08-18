import {
  catalogInnSpecificity,
  normalizeCatalogIndexText,
} from "@workspace/catalog-index";

/**
 * How the analogs tab will resolve a given registry position.
 *
 * Mirrors the decision the client makes in `analogs-tab.tsx`, so the report
 * measures what the pharmacist will actually see rather than a proxy for it.
 */
export type AnalogResolution =
  | "inn"
  | "composition"
  | "inn_class"
  | "unresolved";

export interface AnalogCoverageRow {
  registrationNumber: string;
  tradeName: string;
  inn: string;
  activeIngredient: string;
  atcCode: string;
}

/**
 * An INN string that claims to name one substance but behaves like a label.
 *
 * "Comb drug" was found by hand; the next one will not be. A real substance
 * concentrates in one therapeutic subgroup, so an INN spread thin across many
 * unrelated ATC level-3 groups is evidence the string is not an identity. This
 * is reported, never acted on automatically: collapsing a real INN group would
 * hide genuine analogs, and that trade is not one a heuristic should make.
 */
export interface SuspectedPlaceholder {
  inn: string;
  productCount: number;
  distinctAtcSubgroups: number;
  sampleAtcSubgroups: string[];
  sampleTradeNames: string[];
}

export interface AnalogCoverageReport {
  version: "1.0";
  totals: {
    products: number;
    withCompositionKey: number;
  };
  resolution: Record<AnalogResolution, number>;
  /** Positions that show no analog list at all, and why. */
  unresolvedSample: {
    registrationNumber: string;
    tradeName: string;
    inn: string;
  }[];
  suspectedPlaceholders: SuspectedPlaceholder[];
}

/** ATC therapeutic subgroup: `N02BE01` -> `N02B`. */
export function atcSubgroup(atcCode: string): string {
  const value = atcCode.trim().toUpperCase();
  return /^[A-Z]\d{2}[A-Z]/u.test(value) ? value.slice(0, 4) : "";
}

export function resolveAnalogMode(
  row: AnalogCoverageRow,
  compositionKey: string,
): AnalogResolution {
  const inn = row.inn.trim() || row.activeIngredient.trim();
  const specificity = catalogInnSpecificity(inn);
  if (specificity === "specific") return "inn";
  if (compositionKey) return "composition";
  return specificity === "partial_combination" ? "inn_class" : "unresolved";
}

export interface AnalogCoverageOptions {
  /** Minimum group size before ATC spread is meaningful. */
  minProducts?: number;
  /** Minimum distinct ATC subgroups to call a group therapeutically incoherent. */
  minAtcSubgroups?: number;
  sampleSize?: number;
}

export function buildAnalogCoverageReport(
  rows: readonly AnalogCoverageRow[],
  compositionByRegistration: ReadonlyMap<string, string>,
  options: AnalogCoverageOptions = {},
): AnalogCoverageReport {
  const minProducts = options.minProducts ?? 12;
  const minAtcSubgroups = options.minAtcSubgroups ?? 6;
  const sampleSize = options.sampleSize ?? 20;

  const resolution: Record<AnalogResolution, number> = {
    inn: 0,
    composition: 0,
    inn_class: 0,
    unresolved: 0,
  };
  const unresolvedSample: AnalogCoverageReport["unresolvedSample"] = [];
  const specificGroups = new Map<
    string,
    { inn: string; products: number; atc: Set<string>; names: string[] }
  >();
  let withCompositionKey = 0;

  for (const row of rows) {
    const compositionKey =
      compositionByRegistration.get(row.registrationNumber.trim()) ?? "";
    if (compositionKey) withCompositionKey += 1;
    const mode = resolveAnalogMode(row, compositionKey);
    resolution[mode] += 1;

    if (mode === "unresolved" && unresolvedSample.length < sampleSize) {
      unresolvedSample.push({
        registrationNumber: row.registrationNumber,
        tradeName: row.tradeName,
        inn: row.inn.trim() || row.activeIngredient.trim(),
      });
    }

    if (mode !== "inn") continue;
    const inn = row.inn.trim() || row.activeIngredient.trim();
    const key = normalizeCatalogIndexText(inn);
    if (!key) continue;
    const group = specificGroups.get(key) ?? {
      inn,
      products: 0,
      atc: new Set<string>(),
      names: [],
    };
    group.products += 1;
    const subgroup = atcSubgroup(row.atcCode);
    if (subgroup) group.atc.add(subgroup);
    if (group.names.length < 5) group.names.push(row.tradeName);
    specificGroups.set(key, group);
  }

  const suspectedPlaceholders = [...specificGroups.values()]
    .filter(
      (group) =>
        group.products >= minProducts && group.atc.size >= minAtcSubgroups,
    )
    .map((group) => ({
      inn: group.inn,
      productCount: group.products,
      distinctAtcSubgroups: group.atc.size,
      sampleAtcSubgroups: [...group.atc].sort().slice(0, 8),
      sampleTradeNames: group.names,
    }))
    .sort(
      (left, right) =>
        right.distinctAtcSubgroups - left.distinctAtcSubgroups ||
        right.productCount - left.productCount,
    );

  return {
    version: "1.0",
    totals: { products: rows.length, withCompositionKey },
    resolution,
    unresolvedSample,
    suspectedPlaceholders,
  };
}
