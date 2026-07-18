import { createHash } from "node:crypto";
import type {
  CatalogSearchResponse,
  RegistryProductResult,
} from "@workspace/api-zod";
import { normalize } from "../lib/text";

export const GROUPED_CATALOG_ROW_LIMIT = 2_000;

type GroupedCatalog = NonNullable<CatalogSearchResponse["registryGroups"]>;
type GroupingSummary = GroupedCatalog["summary"];
type CompositionType = "monotherapy" | "combination" | "unknown";

export interface CatalogGroupingInput {
  q: string;
  tradeName?: string;
  manufacturer?: string;
  form?: string;
  strength?: string;
  registrationStatus?: "active" | "terminated" | "unknown";
  compositionType: "all" | CompositionType;
  mappingStatus: "all" | "approved" | "unmapped";
  nationalListStatus: "all" | "exact" | "ingredient_only" | "uncertain" | "not_listed";
  groupPage: number;
  groupPageSize: 10 | 25;
  tradePage: number;
  tradePageSize: 10 | 25;
  variantPage: number;
  variantPageSize: 10 | 25;
  groupKey?: string;
  tradeNameKey?: string;
}

interface CompositionDescriptor {
  key: string;
  displayName: string;
  type: CompositionType;
  officialComposition: string;
}

function stableKey(prefix: string, parts: readonly string[]): string {
  const payload = parts.map((part) => `${Buffer.byteLength(part, "utf8")}:${part}`).join("|");
  return `${prefix}_${createHash("sha256").update(payload).digest("hex").slice(0, 24)}`;
}

function normalizedText(value: string | null | undefined): string {
  return normalize(value ?? "");
}

function compositionDescriptor(product: RegistryProductResult): CompositionDescriptor {
  const official = product.inn.trim() || product.activeIngredient.trim();
  if (!official) {
    return {
      key: stableKey("composition_unknown", [product.id]),
      displayName: "Composition requires clarification",
      type: "unknown",
      officialComposition: product.activeIngredient.trim(),
    };
  }

  const components = official
    .split(/\s*(?:\+|;|(?<!\d),(?!\s*\d)|\/(?!\s*\d)|\b(?:and|with)\b|(?<!\p{L})(?:\u0442\u0430|\u0456)(?!\p{L}))\s*/iu)
    .filter(Boolean);
  const canonical = [...new Map(
    components.map((component) => [normalizedText(component), component] as const),
  ).entries()]
    .filter(([key]) => Boolean(key))
    .sort(([a], [b]) => a.localeCompare(b));

  if (!canonical.length) {
    return {
      key: stableKey("composition_unknown", [product.id]),
      displayName: "Composition requires clarification",
      type: "unknown",
      officialComposition: official,
    };
  }

  return {
    key: stableKey("composition", canonical.map(([key]) => key)),
    displayName: canonical.map(([, label]) => label).join(" + "),
    type: canonical.length === 1 ? "monotherapy" : "combination",
    officialComposition: official,
  };
}

function manufacturerKeys(product: RegistryProductResult): string[] {
  return product.manufacturers
    .map((item) => normalizedText(`${item.name}|${item.country ?? ""}`))
    .filter(Boolean)
    .sort();
}

export function registryVariantKey(product: RegistryProductResult): string {
  const composition = compositionDescriptor(product);
  const strength = normalizedText(product.strength ?? "");
  return stableKey("variant", [
    normalizedText(product.tradeName),
    composition.key,
    normalizedText(product.dosageForm),
    strength || `strength-unknown:${product.id}`,
    manufacturerKeys(product).join("+"),
    normalizedText(product.registration.number) || `registration-unknown:${product.id}`,
  ]);
}

function collapseExactDuplicates(products: readonly RegistryProductResult[]): RegistryProductResult[] {
  const byKey = new Map<string, RegistryProductResult>();
  for (const product of products) {
    const key = registryVariantKey(product);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...product });
      continue;
    }
    byKey.set(key, {
      ...existing,
      sourceRecordCount: existing.sourceRecordCount + product.sourceRecordCount,
    });
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, product]) => product);
}

function positionCount(products: readonly RegistryProductResult[]): number {
  return products.reduce((sum, item) => sum + item.sourceRecordCount, 0);
}

function summary(products: readonly RegistryProductResult[]): GroupingSummary {
  const compositionTypes = products.map((product) => compositionDescriptor(product).type);
  return {
    totalRegistryPositions: positionCount(products),
    uniqueTradeNames: new Set(products.map((item) => normalizedText(item.tradeName))).size,
    uniqueStrengths: new Set(products.map((item) => normalizedText(item.strength)).filter(Boolean)).size,
    uniqueDosageForms: new Set(products.map((item) => normalizedText(item.dosageForm)).filter(Boolean)).size,
    uniqueManufacturers: new Set(products.flatMap(manufacturerKeys)).size,
    monotherapyCount: products.reduce(
      (sum, item, index) => sum + (compositionTypes[index] === "monotherapy" ? item.sourceRecordCount : 0),
      0,
    ),
    combinationCount: products.reduce(
      (sum, item, index) => sum + (compositionTypes[index] === "combination" ? item.sourceRecordCount : 0),
      0,
    ),
    unknownCompositionCount: products.reduce(
      (sum, item, index) => sum + (compositionTypes[index] === "unknown" ? item.sourceRecordCount : 0),
      0,
    ),
    approvedMappedCount: products.reduce(
      (sum, item) => sum + (item.mappingStatus === "approved" ? item.sourceRecordCount : 0),
      0,
    ),
    unmappedCount: products.reduce(
      (sum, item) => sum + (item.mappingStatus === "approved" ? 0 : item.sourceRecordCount),
      0,
    ),
  };
}

function mappingStatus(products: readonly RegistryProductResult[]) {
  const statuses = new Set(products.map((item) => item.mappingStatus));
  if (statuses.size > 1) return "mixed" as const;
  if (statuses.has("approved")) return "approved" as const;
  if (statuses.has("ambiguous")) return "ambiguous" as const;
  return "unmapped" as const;
}

function page<T>(items: readonly T[], pageNumber: number, pageSize: number) {
  const total = items.length;
  const totalPages = total ? Math.ceil(total / pageSize) : 0;
  const start = (pageNumber - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page: pageNumber,
    pageSize,
    totalPages,
    hasNext: pageNumber < totalPages,
  };
}

function filterGroupedProducts(
  products: readonly RegistryProductResult[],
  input: CatalogGroupingInput,
): RegistryProductResult[] {
  return products.filter((product) => {
    const composition = compositionDescriptor(product);
    if (input.compositionType !== "all" && composition.type !== input.compositionType) return false;
    if (input.mappingStatus === "approved" && product.mappingStatus !== "approved") return false;
    if (input.mappingStatus === "unmapped" && product.mappingStatus === "approved") return false;
    if (input.nationalListStatus !== "all" && product.nationalListStatus !== input.nationalListStatus) return false;
    return true;
  });
}

export function groupRegistryProducts(
  products: readonly RegistryProductResult[],
  input: CatalogGroupingInput,
  bounded = true,
): GroupedCatalog {
  const filtered = filterGroupedProducts(products, input);
  const groups = new Map<string, {
    descriptor: CompositionDescriptor;
    products: RegistryProductResult[];
  }>();

  for (const product of filtered) {
    const descriptor = compositionDescriptor(product);
    const current = groups.get(descriptor.key) ?? { descriptor, products: [] };
    current.products.push(product);
    groups.set(descriptor.key, current);
  }

  const groupItems = [...groups.values()]
    .sort((a, b) => {
      const typeOrder = { monotherapy: 0, combination: 1, unknown: 2 } as const;
      return typeOrder[a.descriptor.type] - typeOrder[b.descriptor.type] ||
        a.descriptor.displayName.localeCompare(b.descriptor.displayName);
    });
  const groupPage = page(groupItems, input.groupPage, input.groupPageSize);

  const renderedGroups = groupPage.items.map(({ descriptor, products: groupProducts }) => {
    const tradeMap = new Map<string, RegistryProductResult[]>();
    for (const product of groupProducts) {
      const key = stableKey("trade", [descriptor.key, normalizedText(product.tradeName)]);
      const current = tradeMap.get(key) ?? [];
      current.push(product);
      tradeMap.set(key, current);
    }
    const normalizedQuery = normalizedText(input.q);
    const trades = [...tradeMap.entries()].sort(([, a], [, b]) => {
      const aExact = normalizedQuery === normalizedText(a[0].tradeName);
      const bExact = normalizedQuery === normalizedText(b[0].tradeName);
      return Number(bExact) - Number(aExact) ||
        a[0].tradeName.localeCompare(b[0].tradeName);
    });
    const tradePageNumber = input.groupKey === descriptor.key ? input.tradePage : 1;
    const tradePage = page(trades, tradePageNumber, input.tradePageSize);
    const tradeItems = tradePage.items.map(([key, tradeProducts]) => {
      const collapsed = collapseExactDuplicates(tradeProducts);
      const exactTradeInInitialResponse =
        !input.groupKey &&
        !input.tradeNameKey &&
        Boolean(normalizedQuery) &&
        normalizedQuery === normalizedText(tradeProducts[0].tradeName);
      const variants =
        exactTradeInInitialResponse ||
        (input.groupKey === descriptor.key && input.tradeNameKey === key)
        ? (() => {
            const variantPage = page(collapsed, input.variantPage, input.variantPageSize);
            return {
              ...variantPage,
              pageSize: input.variantPageSize,
              totalRegistryPositions: positionCount(tradeProducts),
            };
          })()
        : null;
      return {
        key,
        tradeName: tradeProducts[0].tradeName,
        normalizedTradeName: normalizedText(tradeProducts[0].tradeName),
        summary: summary(tradeProducts),
        forms: [...new Set(tradeProducts.map((item) => item.dosageForm).filter(Boolean))].sort().slice(0, 25),
        strengths: [...new Set(tradeProducts.map((item) => item.strength).filter((item): item is string => Boolean(item)))].sort().slice(0, 25),
        manufacturers: [...new Set(tradeProducts.flatMap((item) => item.manufacturers.map((manufacturer) => manufacturer.name)).filter(Boolean))].sort().slice(0, 25),
        variants,
      };
    });

    return {
      key: descriptor.key,
      displayName: descriptor.displayName,
      officialCompositions: [...new Set(groupProducts.map((item) => item.inn || item.activeIngredient).filter(Boolean))].slice(0, 20),
      compositionType: descriptor.type,
      mappingStatus: mappingStatus(groupProducts),
      summary: summary(groupProducts),
      source: groupProducts[0].source,
      tradeNames: {
        ...tradePage,
        pageSize: input.tradePageSize,
        items: tradeItems,
      },
    };
  });

  return {
    summary: summary(filtered),
    groups: {
      ...groupPage,
      pageSize: input.groupPageSize,
      items: renderedGroups,
    },
    appliedFilters: {
      query: input.q,
      tradeName: input.tradeName?.trim() || null,
      manufacturer: input.manufacturer?.trim() || null,
      form: input.form?.trim() || null,
      strength: input.strength?.trim() || null,
      compositionType: input.compositionType,
      mappingStatus: input.mappingStatus,
      nationalListStatus: input.nationalListStatus,
      registrationStatus: input.registrationStatus ?? null,
    },
    bounded,
  };
}
