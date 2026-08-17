import {
  catalogRegistrationCertificate,
  catalogRegistrationStatus,
  type CatalogClientIndexProduct,
  type CatalogRegistrationStatus,
} from "@workspace/catalog-index";

/**
 * The minimum a row needs to be grouped: the position and its ordering weight.
 *
 * Deliberately narrower than `CatalogClientIndexSearchItem` so the analogs tab,
 * which classifies plain products rather than search hits, can group with the
 * same rules instead of growing a second near-copy of them.
 */
export interface CatalogVariantInput {
  product: CatalogClientIndexProduct;
  rank: number;
}

/**
 * One certificate's worth of results.
 *
 * The registry issues a single certificate per product and numbers each dosage
 * or package line under it — `UA/19799/01/01`, `/02`, `/03` are one Фармак
 * omeprazole in three strengths, not three products to choose between. Showing
 * them as separate rows is what makes a common-drug search unreadable, so they
 * collapse into one entry whose strengths are the actual choice.
 */
export interface CatalogVariantGroup {
  /** Certificate base (`UA/19799`), or the full number when unparseable. */
  key: string;
  /** A certificate belongs to one product, so every line shares this name. */
  tradeName: string;
  manufacturer: string;
  form: string;
  status: CatalogRegistrationStatus;
  /** Ordered lines of this certificate; the first is the default target. */
  lines: CatalogVariantInput[];
  /** Distinct strengths across the lines, in listing order. */
  strengths: string[];
  bestRank: number;
}

/**
 * A registration only merges with another when the certificate, the form and
 * the manufacturer all agree. Two lines of one certificate that differ in form
 * are genuinely different choices, so they stay apart.
 */
function variantKey(product: CatalogClientIndexProduct): string {
  const certificate = catalogRegistrationCertificate(product.registration);
  return [
    certificate || product.registration,
    product.form,
    product.manufacturer,
  ].join("\u0000");
}

/**
 * Terminated registrations stay visible — a pharmacist still has to identify an
 * old pack from the shelf — but never above a valid one. Unknown validity sorts
 * with active rather than being hidden, since absence of an end date is not
 * evidence of termination either way.
 */
function statusWeight(status: CatalogRegistrationStatus): number {
  return status === "terminated" ? 1 : 0;
}

export function groupCatalogVariants(
  items: readonly CatalogVariantInput[],
  now: Date,
): CatalogVariantGroup[] {
  const groups = new Map<string, CatalogVariantGroup>();
  for (const item of items) {
    const { product } = item;
    const key = variantKey(product);
    const status = catalogRegistrationStatus(product.registrationValidity, now);
    const existing = groups.get(key);
    if (existing) {
      existing.lines.push(item);
      if (product.strength && !existing.strengths.includes(product.strength)) {
        existing.strengths.push(product.strength);
      }
      // A certificate counts as valid while any of its lines still is.
      if (statusWeight(status) < statusWeight(existing.status)) {
        existing.status = status;
      }
      existing.bestRank = Math.min(existing.bestRank, item.rank);
      continue;
    }
    groups.set(key, {
      key:
        catalogRegistrationCertificate(product.registration) ||
        product.registration,
      tradeName: product.tradeName,
      manufacturer: product.manufacturer,
      form: product.form,
      status,
      lines: [item],
      strengths: product.strength ? [product.strength] : [],
      bestRank: item.rank,
    });
  }
  return [...groups.values()].sort(
    (left, right) =>
      statusWeight(left.status) - statusWeight(right.status) ||
      left.bestRank - right.bestRank ||
      left.manufacturer.localeCompare(right.manufacturer, "uk-UA") ||
      left.key.localeCompare(right.key, "uk-UA"),
  );
}

export const CATALOG_REGISTRATION_STATUS_LABELS: Record<
  CatalogRegistrationStatus,
  string
> = {
  active: "Чинна реєстрація",
  terminated: "Реєстрацію припинено",
  unknown: "Строк реєстрації не вказано",
};
