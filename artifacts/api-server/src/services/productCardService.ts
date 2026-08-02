import type { z } from "zod";
import {
  GetProductCardResponse,
  SearchCatalogQueryParams,
  type RegistryProductResult,
} from "@workspace/api-zod";
import {
  summarizeProductSeriesRestrictions,
  type ProductSeriesRestrictionSummary,
} from "../knowledge/seriesRestrictions/summary";
import type { DrugInstructionSnapshot } from "../knowledge/instructions/model";
import { getOfficialInstructionForProduct } from "./officialInstructionService";
import {
  loadProfessionalProductProfile,
  type ProfessionalProductProfileLoadResult,
} from "./professionalProductProfileService";
import { searchCatalog } from "./catalogSearchService";

type ProductCardOutput = z.output<typeof GetProductCardResponse>;
type ProductCardFreshnessEntry = ProductCardOutput["freshness"][number];
type ProductCardCoverageSource =
  ProductCardOutput["coverage"]["sources"][number];

export type ProductCardResolution =
  | { status: "found"; product: RegistryProductResult }
  | { status: "not_found" }
  | { status: "unavailable" };

export interface ProductCardDependencies {
  resolveProductById(productId: string): Promise<ProductCardResolution>;
  loadProfessionalProfile(
    productId: string,
    registrationNumber: string,
  ): Promise<ProfessionalProductProfileLoadResult>;
  loadInstruction(productId: string): Promise<DrugInstructionSnapshot | null>;
  summarizeSeries(
    registrationNumber: string,
  ): ProductSeriesRestrictionSummary | Promise<ProductSeriesRestrictionSummary>;
}

export type ProductCardLoadResult =
  | { status: "ready"; card: ProductCardOutput }
  | { status: "not_found" }
  | { status: "unavailable" };

async function resolveProductById(
  productId: string,
): Promise<ProductCardResolution> {
  const input = SearchCatalogQueryParams.parse({
    q: "",
    productId,
    type: "registry_products",
    view: "grouped",
    page: 1,
    pageSize: 25,
  });
  const result = await searchCatalog(input);
  if (result.runtimeMode !== "db") return { status: "unavailable" };
  const product = result.registryProducts.items.find(
    (candidate) => candidate.id === productId,
  );
  return product ? { status: "found", product } : { status: "not_found" };
}

const defaultDependencies: ProductCardDependencies = {
  resolveProductById,
  loadProfessionalProfile: (productId, registrationNumber) =>
    loadProfessionalProductProfile(productId, registrationNumber),
  loadInstruction: getOfficialInstructionForProduct,
  summarizeSeries: summarizeProductSeriesRestrictions,
};

function dispensing(
  check: ProductCardOutput["dispensing"]["check"],
): ProductCardOutput["dispensing"] {
  if (!check) {
    return { status: "unknown", confidence: "unavailable", check: null };
  }
  const verified =
    check.matchStatus === "product_and_registration" &&
    check.source.freshness === "current" &&
    (check.status === "otc" || check.status === "prescription");
  return {
    status: check.status,
    confidence: verified ? "verified" : "requires_review",
    check,
  };
}

function sourceFreshness(
  key: ProductCardFreshnessEntry["key"],
  status: ProductCardFreshnessEntry["status"],
  checkedAt: Date | string | null,
  sourceUrl: string | null,
): ProductCardFreshnessEntry {
  return { key, status, checkedAt: checkedAt as Date | null, sourceUrl };
}

function freshness(
  product: RegistryProductResult,
  profile: Extract<
    ProfessionalProductProfileLoadResult,
    { status: "ready" }
  >["profile"],
  instruction: DrugInstructionSnapshot | null,
  instructionFailed: boolean,
  series: ProductSeriesRestrictionSummary | null,
): ProductCardOutput["freshness"] {
  return [
    sourceFreshness("registry", "unknown", null, "https://www.drlz.com.ua/"),
    sourceFreshness(
      "national_list",
      product.nationalListCheckedAt ? "current" : "unknown",
      product.nationalListCheckedAt,
      product.nationalListSource?.url ?? null,
    ),
    sourceFreshness(
      "dispensing_category",
      profile.dispensingCategory?.source.freshness ?? "unavailable",
      profile.dispensingCategory?.source.checkedAt ?? null,
      profile.dispensingCategory?.source.url ?? null,
    ),
    sourceFreshness(
      "instruction",
      instruction ? "current" : instructionFailed ? "unavailable" : "unknown",
      instruction?.source.checkedAt ?? null,
      instruction?.source.url ?? product.officialInstructionDocumentUrl ?? null,
    ),
    sourceFreshness(
      "reimbursement",
      profile.reimbursement?.source.freshness ?? "unavailable",
      profile.reimbursement?.source.checkedAt ?? null,
      profile.reimbursement?.source.url ?? null,
    ),
    sourceFreshness(
      "price",
      profile.price?.source.freshness ?? "unavailable",
      profile.price?.source.checkedAt ?? null,
      profile.price?.source.url ?? null,
    ),
    sourceFreshness("interactions", "unknown", null, null),
    sourceFreshness(
      "series_restrictions",
      series?.source.freshness ?? "unavailable",
      series?.source.generatedAt ?? null,
      series?.source.url ?? null,
    ),
  ];
}

function cardCoverage(
  profile: Extract<
    ProfessionalProductProfileLoadResult,
    { status: "ready" }
  >["profile"],
  instruction: DrugInstructionSnapshot | null,
  instructionFailed: boolean,
  series: ProductSeriesRestrictionSummary | null,
): ProductCardOutput["coverage"] {
  const sources = profile.coverage.sources.map(
    (item): ProductCardCoverageSource => {
      if (item.key === "instruction") {
        if (instruction) {
          return {
            ...item,
            status: "ready",
            detail:
              "Структуровану офіційну інструкцію завантажено для цієї точної реєстрової позиції.",
            sourceUrl: instruction.source.url,
            checkedAt: new Date(instruction.source.checkedAt),
          };
        }
        if (instructionFailed) {
          return {
            ...item,
            status: "unavailable",
            detail:
              "Офіційна інструкція тимчасово недоступна; картка не підміняє її згенерованим текстом.",
            checkedAt: null,
          };
        }
        return item;
      }
      if (item.key !== "series_restrictions") return item;
      if (!series) {
        return {
          ...item,
          status: "unavailable",
          detail: "Локальний знімок розпоряджень Держлікслужби недоступний.",
          checkedAt: null,
        };
      }
      const stale = series.source.freshness !== "current";
      return {
        ...item,
        status: stale
          ? "attention"
          : series.requiresSeriesCheck
            ? "requires_input"
            : "ready",
        detail: stale
          ? "Знімок розпоряджень потребує оновлення; перевірте офіційний реєстр вручну."
          : series.requiresSeriesCheck
            ? `Для реєстраційного номера є розпорядження щодо обігу серій (${series.eventCount}). Введіть точну серію.`
            : "У поточному знімку немає заборонних документів для цього реєстраційного номера.",
        sourceUrl: series.source.url,
        checkedAt: new Date(series.source.generatedAt),
      };
    },
  );
  return {
    connectedSources: sources.filter(
      (item) =>
        item.status !== "not_connected" && item.status !== "unavailable",
    ).length,
    totalSources: 8,
    complete: sources.every((item) => item.status === "ready"),
    sources,
  };
}

export async function loadProductCard(
  productId: string,
  dependencies: ProductCardDependencies = defaultDependencies,
): Promise<ProductCardLoadResult> {
  let resolution: ProductCardResolution;
  try {
    resolution = await dependencies.resolveProductById(productId);
  } catch {
    return { status: "unavailable" };
  }
  if (resolution.status !== "found") return resolution;
  if (resolution.product.id !== productId) return { status: "not_found" };

  const product = resolution.product;
  const [profileResult, instructionResult, seriesResult] = await Promise.all([
    Promise.resolve()
      .then(() =>
        dependencies.loadProfessionalProfile(
          productId,
          product.registration.number,
        ),
      )
      .catch(() => ({ status: "unavailable" as const })),
    Promise.resolve()
      .then(() => dependencies.loadInstruction(productId))
      .then((value) => ({ value, failed: false as const }))
      .catch(() => ({ value: null, failed: true as const })),
    Promise.resolve()
      .then(() => dependencies.summarizeSeries(product.registration.number))
      .then((value) => ({ value, failed: false as const }))
      .catch(() => ({ value: null, failed: true as const })),
  ]);
  if (profileResult.status !== "ready") return profileResult;
  if (
    profileResult.profile.product.id !== productId ||
    profileResult.profile.product.registration.number !==
      product.registration.number
  ) {
    return { status: "not_found" };
  }

  const loadedInstruction = instructionResult.value;
  const instructionBindingFailed = Boolean(
    loadedInstruction &&
    (loadedInstruction.registryProductId !== productId ||
      loadedInstruction.registrationNumber !== product.registration.number ||
      !loadedInstruction.provenance.sourceAllowed ||
      !loadedInstruction.provenance.registrationMatched ||
      !loadedInstruction.provenance.contentLocationMatched),
  );
  const instruction = instructionBindingFailed ? null : loadedInstruction;
  const instructionFailed =
    instructionResult.failed || instructionBindingFailed;
  const loadedSeries = seriesResult.value;
  const seriesBindingFailed = Boolean(
    loadedSeries &&
    loadedSeries.registrationNumber !== product.registration.number,
  );
  const series = seriesBindingFailed ? null : loadedSeries;
  const declaredInstructionStatus =
    product.instructionSourceStatus ??
    (product.instructionAvailable ? "structured" : "not_published");
  const instructionSourceStatus = instruction
    ? "structured"
    : instructionFailed || declaredInstructionStatus === "structured"
      ? "temporarily_unavailable"
      : declaredInstructionStatus;
  const warnings = new Set(profileResult.profile.warnings);
  if (instructionFailed) warnings.add("instruction_source_unavailable");
  if (seriesResult.failed || seriesBindingFailed) {
    warnings.add("series_restrictions_unavailable");
  }
  if (series?.requiresSeriesCheck) warnings.add("series_check_required");
  if (series && series.source.freshness !== "current") {
    warnings.add("series_restrictions_stale");
  }

  return {
    status: "ready",
    card: GetProductCardResponse.parse({
      version: "1.0",
      identity: product,
      dispensing: dispensing(profileResult.profile.dispensingCategory),
      economics: {
        nationalList: {
          status: product.nationalListStatus,
          release: product.nationalListRelease,
          matchReason: product.nationalListMatchReason,
          section: product.nationalListSection,
          source: product.nationalListSource,
          checkedAt: product.nationalListCheckedAt,
        },
        reimbursement: profileResult.profile.reimbursement,
        price: profileResult.profile.price,
      },
      seriesStatus: series,
      instruction: {
        available: Boolean(instruction),
        sourceStatus: instructionSourceStatus,
        sections: instruction?.sections ?? null,
        source: instruction?.source ?? null,
        provenance: instruction?.provenance ?? null,
        warnings: instruction?.warnings ?? [],
      },
      freshness: freshness(
        product,
        profileResult.profile,
        instruction,
        instructionFailed,
        series,
      ),
      coverage: cardCoverage(
        profileResult.profile,
        instruction,
        instructionFailed,
        series,
      ),
      warnings: [...warnings],
    }),
  };
}
