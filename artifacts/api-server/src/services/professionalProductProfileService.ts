import type { z } from "zod";
import {
  CheckProductDispensingCategoryResponse,
  GetProfessionalProductProfileResponse,
  SearchCatalogQueryParams,
  type RegistryProductResult,
} from "@workspace/api-zod";
import {
  checkDispensingCategory,
  type DispensingCategoryCheckResult,
} from "../knowledge/dispensingCategories/catalog";
import { buildInteractionFoundationAudit } from "../interactions/audit";
import {
  checkPriceCatalog,
  type PriceCatalogCheckResult,
} from "../knowledge/priceCatalog/catalog";
import {
  checkReimbursement,
  type ReimbursementCheckResult,
} from "../knowledge/reimbursement/catalog";
import { searchCatalog } from "./catalogSearchService";

type ProfessionalProductProfileOutput = z.output<
  typeof GetProfessionalProductProfileResponse
>;
type ProfessionalProfileSourceInput =
  ProfessionalProductProfileOutput["coverage"]["sources"][number];

export type ExactProductResolution =
  | { status: "found"; product: RegistryProductResult }
  | { status: "not_found" }
  | { status: "unavailable" };

export interface ProfessionalProductProfileDependencies {
  resolveExactProduct(
    productId: string,
    registrationNumber: string,
  ): Promise<ExactProductResolution>;
  checkDispensingCategory(
    productId: string,
    registrationNumber: string,
  ): DispensingCategoryCheckResult | Promise<DispensingCategoryCheckResult>;
  checkReimbursement(
    registrationNumber: string,
    selectedPackageKey?: string | null,
  ): ReimbursementCheckResult | Promise<ReimbursementCheckResult>;
  checkPriceCatalog(
    registrationNumber: string,
    selectedCatalogId?: string | null,
  ): PriceCatalogCheckResult | Promise<PriceCatalogCheckResult>;
}

export type ProfessionalProductProfileLoadResult =
  | { status: "ready"; profile: ProfessionalProductProfileOutput }
  | { status: "not_found" }
  | { status: "unavailable" };

const interactionAudit = buildInteractionFoundationAudit();

function bounded(value: string, limit: number): string {
  const normalized = value.trim();
  if (normalized.length <= limit) return normalized;
  return normalized.slice(0, Math.max(1, limit - 1)).trimEnd() + "…";
}

function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

function safeDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function requiredDate(value: string): Date {
  const date = safeDate(value);
  if (!date) throw new Error("Official source contains an invalid date");
  return date;
}

function reimbursementOutput(
  result: ReimbursementCheckResult,
): NonNullable<ProfessionalProductProfileOutput["reimbursement"]> {
  return {
    ...result,
    source: {
      ...result.source,
      checkedAt: requiredDate(result.source.checkedAt),
      releaseDate: requiredDate(result.source.releaseDate),
    },
  };
}

function priceOutput(
  result: PriceCatalogCheckResult,
): NonNullable<ProfessionalProductProfileOutput["price"]> {
  return {
    ...result,
    source: {
      ...result.source,
      checkedAt: requiredDate(result.source.checkedAt),
      releaseDate: requiredDate(result.source.releaseDate),
    },
  };
}

function source(
  input: ProfessionalProfileSourceInput,
): ProfessionalProfileSourceInput {
  return {
    ...input,
    label: bounded(input.label, 300),
    detail: bounded(input.detail, 1_000),
    sourceUrl: safeUrl(input.sourceUrl),
  };
}

async function resolveExactProduct(
  productId: string,
  registrationNumber: string,
): Promise<ExactProductResolution> {
  const input = SearchCatalogQueryParams.parse({
    q: registrationNumber,
    productId,
    type: "registry_products",
    view: "flat",
    page: 1,
    pageSize: 25,
  });
  const result = await searchCatalog(input);
  if (result.runtimeMode !== "db") return { status: "unavailable" };
  const product = result.registryProducts.items.find(
    (candidate) =>
      candidate.id === productId &&
      candidate.registration.number === registrationNumber,
  );
  return product ? { status: "found", product } : { status: "not_found" };
}

const defaultDependencies: ProfessionalProductProfileDependencies = {
  resolveExactProduct,
  checkDispensingCategory,
  checkReimbursement,
  checkPriceCatalog,
};

function registrySource(
  product: RegistryProductResult,
): ProfessionalProfileSourceInput {
  const active = product.registration.status === "active";
  return source({
    key: "registry",
    label: product.source.label,
    status: active ? "ready" : "attention",
    detail: active
      ? "Точну позицію " +
        product.registration.number +
        " знайдено в поточному реєстровому каталозі."
      : product.registration.status === "terminated"
        ? "Для позиції " +
          product.registration.number +
          " реєстрацію завершено. Потрібна ручна перевірка актуального запису ДРЛЗ."
        : "Для позиції " +
          product.registration.number +
          " немає надійно визначеного статусу реєстрації.",
    sourceUrl: null,
    checkedAt: null,
  });
}

function nationalListSource(
  product: RegistryProductResult,
): ProfessionalProfileSourceInput {
  const exact = product.nationalListStatus === "exact";
  const unavailable = product.nationalListStatus === "not_applicable";
  return source({
    key: "national_list",
    label: product.nationalListSource?.title ?? "Національний перелік",
    status: exact ? "ready" : unavailable ? "unavailable" : "attention",
    detail: product.nationalListMatchReason,
    sourceUrl: product.nationalListSource?.url ?? null,
    checkedAt: safeDate(product.nationalListCheckedAt),
  });
}

function instructionSource(
  product: RegistryProductResult,
): ProfessionalProfileSourceInput {
  const status =
    product.instructionSourceStatus ??
    (product.instructionAvailable ? "structured" : "not_published");
  const details = {
    structured:
      "Структурована офіційна інструкція прив'язана до цієї точної реєстрової позиції.",
    official_document:
      "Офіційний документ ДРЛЗ доступний, але структуровані розділи ще не підготовлені.",
    invalid_source:
      "Посилання на документ не пройшло точну перевірку джерела або реєстраційного номера.",
    not_published:
      "Для цієї точної позиції структурована офіційна інструкція поки недоступна.",
  } as const;
  return source({
    key: "instruction",
    label: "Офіційна інструкція ДРЛЗ",
    status: status === "structured" ? "ready" : "attention",
    detail: details[status],
    sourceUrl: product.officialInstructionDocumentUrl ?? null,
    checkedAt: null,
  });
}

function dispensingSource(
  result: ProfessionalProductProfileOutput["dispensingCategory"],
): ProfessionalProfileSourceInput {
  if (!result) {
    return source({
      key: "dispensing_category",
      label: "Умови відпуску ДРЛЗ",
      status: "unavailable",
      detail:
        "Перевірений локальний знімок Rx/OTC недоступний. Категорію відпуску потрібно звірити вручну.",
      sourceUrl: null,
      checkedAt: null,
    });
  }
  const exact =
    result.matchStatus === "product_and_registration" &&
    result.source.freshness === "current";
  const conclusive =
    result.status === "otc" || result.status === "prescription";
  return source({
    key: "dispensing_category",
    label: result.source.title,
    status: exact && conclusive ? "ready" : "attention",
    detail: result.summary,
    sourceUrl: result.source.url,
    checkedAt: result.source.checkedAt,
  });
}

function reimbursementSource(
  result: ProfessionalProductProfileOutput["reimbursement"],
): ProfessionalProfileSourceInput {
  if (!result) {
    return source({
      key: "reimbursement",
      label: "Реімбурсація «Доступні ліки»",
      status: "unavailable",
      detail:
        "Перевірений локальний знімок НСЗУ недоступний. Не робіть висновок про участь препарату в програмі.",
      sourceUrl: null,
      checkedAt: null,
    });
  }
  const current = result.source.freshness === "current";
  return source({
    key: "reimbursement",
    label: "Реімбурсація «Доступні ліки»",
    status: current
      ? result.status === "requires_package"
        ? "requires_input"
        : "ready"
      : "attention",
    detail: result.summary,
    sourceUrl: result.source.url,
    checkedAt: safeDate(result.source.checkedAt),
  });
}

function priceSource(
  result: ProfessionalProductProfileOutput["price"],
  reimbursement: ProfessionalProductProfileOutput["reimbursement"],
): ProfessionalProfileSourceInput {
  if (!result) {
    return source({
      key: "price",
      label: "Національний каталог цін",
      status: "unavailable",
      detail:
        "Перевірений локальний знімок Національного каталогу цін недоступний. Ціновий висновок неможливий.",
      sourceUrl: null,
      checkedAt: null,
    });
  }
  if (
    reimbursement?.status === "listed" &&
    reimbursement.selected &&
    reimbursement.source.freshness === "current"
  ) {
    return source({
      key: "price",
      label: "Національний каталог цін",
      status: "ready",
      detail:
        "Не застосовується до обраної реімбурсованої упаковки: для неї використовуйте суму доплати з чинного переліку НСЗУ.",
      sourceUrl: result.source.url,
      checkedAt: safeDate(result.source.checkedAt),
    });
  }
  const current = result.source.freshness === "current";
  return source({
    key: "price",
    label: "Національний каталог цін",
    status: current
      ? result.status === "requires_package"
        ? "requires_input"
        : "ready"
      : "attention",
    detail: result.summary,
    sourceUrl: result.source.url,
    checkedAt: safeDate(result.source.checkedAt),
  });
}

export interface ProfessionalProfilePackageSelection {
  reimbursementPackageKey?: string | null;
  priceCatalogId?: string | null;
}
export async function loadProfessionalProductProfile(
  productId: string,
  registrationNumber: string,
  dependencies: ProfessionalProductProfileDependencies = defaultDependencies,
  selection: ProfessionalProfilePackageSelection = {},
): Promise<ProfessionalProductProfileLoadResult> {
  let resolution: ExactProductResolution;
  try {
    resolution = await dependencies.resolveExactProduct(
      productId,
      registrationNumber,
    );
  } catch {
    return { status: "unavailable" };
  }
  if (resolution.status !== "found") return resolution;
  const product = resolution.product;
  if (
    product.id !== productId ||
    product.registration.number !== registrationNumber
  ) {
    return { status: "not_found" };
  }

  let dispensingCategory: ProfessionalProductProfileOutput["dispensingCategory"];
  try {
    const rawDispensingCategory = await dependencies.checkDispensingCategory(
      productId,
      registrationNumber,
    );
    dispensingCategory = CheckProductDispensingCategoryResponse.parse(
      rawDispensingCategory,
    );
  } catch {
    dispensingCategory = null;
  }

  let reimbursement: ProfessionalProductProfileOutput["reimbursement"];
  try {
    reimbursement = reimbursementOutput(
      await dependencies.checkReimbursement(
        registrationNumber,
        selection.reimbursementPackageKey,
      ),
    );
  } catch {
    reimbursement = null;
  }

  let price: ProfessionalProductProfileOutput["price"];
  try {
    price = priceOutput(
      await dependencies.checkPriceCatalog(
        registrationNumber,
        selection.priceCatalogId,
      ),
    );
  } catch {
    price = null;
  }

  const sources: ProfessionalProfileSourceInput[] = [
    registrySource(product),
    nationalListSource(product),
    dispensingSource(dispensingCategory),
    instructionSource(product),
    reimbursementSource(reimbursement),
    priceSource(price, reimbursement),
    source({
      key: "interactions",
      label: "Перевірені взаємодії",
      status: "requires_input",
      detail:
        "Потрібно вибрати інші препарати пацієнта. Runtime дозволяє " +
        interactionAudit.runtimeEligibleCount +
        " з " +
        interactionAudit.totalRules +
        " реєстрових правил; відсутність точного правила не означає безпечність комбінації.",
      sourceUrl: null,
      checkedAt: null,
    }),
    source({
      key: "series_restrictions",
      label: "Заборони та поновлення серій",
      status: "requires_input",
      detail:
        "Для точної перевірки потрібно ввести серію з упаковки. Відсутність введеної серії не означає відсутність заборони.",
      sourceUrl: "https://pub-mex.dls.gov.ua/QLA/DocList.aspx",
      checkedAt: null,
    }),
  ];
  const connectedSources = sources.filter(
    (item) => item.status !== "not_connected" && item.status !== "unavailable",
  ).length;
  const warnings = new Set<string>();
  if (!reimbursement) {
    warnings.add("reimbursement_source_unavailable");
  } else {
    if (reimbursement.status === "requires_package") {
      warnings.add("reimbursement_package_required");
    }
    if (reimbursement.source.freshness !== "current") {
      warnings.add("reimbursement_source_stale");
    }
    if (reimbursement.source.warnings.length) {
      warnings.add("reimbursement_source_count_mismatch");
    }
  }
  if (!price) {
    warnings.add("price_source_unavailable");
  } else {
    if (price.status === "requires_package") {
      warnings.add("price_package_required");
    }
    if (
      price.status === "not_in_catalog" &&
      !(
        reimbursement?.status === "listed" &&
        reimbursement.selected &&
        reimbursement.source.freshness === "current"
      )
    ) {
      warnings.add("price_not_in_catalog");
    }
    if (price.source.freshness !== "current") {
      warnings.add("price_source_stale");
    }
  }
  if (product.registration.status !== "active") {
    warnings.add("registration_not_active");
  }
  if (product.nationalListStatus !== "exact") {
    warnings.add("national_list_not_exact");
  }
  if (!dispensingCategory) {
    warnings.add("dispensing_category_unavailable");
  } else if (
    dispensingCategory.matchStatus !== "product_and_registration" ||
    dispensingCategory.source.freshness !== "current" ||
    (dispensingCategory.status !== "otc" &&
      dispensingCategory.status !== "prescription")
  ) {
    warnings.add("dispensing_category_needs_review");
  }
  const instructionStatus =
    product.instructionSourceStatus ??
    (product.instructionAvailable ? "structured" : "not_published");
  if (instructionStatus !== "structured") {
    warnings.add("instruction_not_structured");
  }

  return {
    status: "ready",
    profile: GetProfessionalProductProfileResponse.parse({
      version: "1.0",
      product,
      dispensingCategory,
      reimbursement,
      price,
      coverage: {
        connectedSources,
        totalSources: 8,
        complete: sources.every((item) => item.status === "ready"),
        sources,
      },
      warnings: [...warnings],
    }),
  };
}
