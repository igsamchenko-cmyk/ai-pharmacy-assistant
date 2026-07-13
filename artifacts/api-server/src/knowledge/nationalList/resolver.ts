import {
  NATIONAL_LIST_RESOLVER_VERSION,
  type NationalListEntry,
  type NationalListMatch,
} from "./model";
import {
  extractNationalListStrengths,
  inferNationalListRoutes,
  ingredientSignature,
  normalizeNationalListText,
} from "./parser";

export interface NationalListProductInput {
  registryId: string;
  inn: string;
  activeIngredient: string;
  dosageForm: string;
  strength?: string | null;
}

type FieldMatch = NationalListMatch["formMatch"];

function fieldMatch(
  constraints: readonly string[],
  value: string,
): FieldMatch {
  if (!constraints.length) return "not_applicable";
  const normalized = normalizeNationalListText(value);
  if (!normalized) return "unknown";
  const formKeys = (candidate: string): Set<string> => {
    const target = normalizeNationalListText(candidate);
    const keys = new Set([target]);
    if (/таблет|tablet/u.test(target)) keys.add("tablet");
    if (/капсул|capsul/u.test(target)) keys.add("capsule");
    if (/тверда пероральна|solid oral/u.test(target) || keys.has("tablet") || keys.has("capsule")) {
      keys.add("solid_oral");
    }
    if (/розчин|solution/u.test(target)) keys.add("solution");
    if (/суспен|suspens/u.test(target)) keys.add("suspension");
    if (/порош|powder|ліофіл/u.test(target)) keys.add("powder");
    if (/крем|cream/u.test(target)) keys.add("cream");
    if (/мазь|ointment/u.test(target)) keys.add("ointment");
    if (/супозитор|suppos/u.test(target)) keys.add("suppository");
    return keys;
  };
  const productKeys = formKeys(normalized);
  return constraints.some((constraint) => {
    const target = normalizeNationalListText(constraint);
    if (target === normalized || target.includes(normalized) || normalized.includes(target)) return true;
    const targetKeys = formKeys(target);
    return [...targetKeys].some((key) => productKeys.has(key));
  })
    ? "match"
    : "mismatch";
}

function routeMatch(entry: NationalListEntry, product: NationalListProductInput): FieldMatch {
  if (!entry.routes.length) return "not_applicable";
  const productRoutes = inferNationalListRoutes(product.dosageForm);
  if (!productRoutes.length) return "unknown";
  return productRoutes.some((route) => entry.routes.includes(route)) ? "match" : "mismatch";
}

function strengthMatch(entry: NationalListEntry, product: NationalListProductInput): FieldMatch {
  if (!entry.strengths.length) return "not_applicable";
  const strengths = extractNationalListStrengths(
    [product.strength, product.activeIngredient, product.dosageForm]
      .filter(Boolean)
      .join(" "),
  );
  if (!strengths.length) return "unknown";
  return strengths.some((strength) => entry.strengths.includes(strength))
    ? "match"
    : "mismatch";
}

function baseMatch(
  status: NationalListMatch["status"],
  reason: string,
): NationalListMatch {
  return {
    status,
    entryStableKey: null,
    reason,
    ingredientMatch: status === "not_applicable" ? "not_applicable" : "unknown",
    formMatch: "not_applicable",
    routeMatch: "not_applicable",
    strengthMatch: "not_applicable",
    resolverVersion: NATIONAL_LIST_RESOLVER_VERSION,
  };
}

export function resolveNationalListMatch(
  product: NationalListProductInput,
  entries: readonly NationalListEntry[],
  options: { activeRelease: boolean },
): NationalListMatch {
  if (!options.activeRelease) {
    return baseMatch("not_applicable", "No active National Medicines List release is configured.");
  }
  const sourceComposition = product.inn.trim();
  const signature = ingredientSignature(sourceComposition);
  if (!signature) {
    return baseMatch("uncertain", "The registry composition could not be normalized reliably.");
  }
  const candidates = entries
    .filter((entry) => entry.compositionSignature === signature)
    .sort((a, b) => a.stableKey.localeCompare(b.stableKey));
  if (!candidates.length) {
    const components = signature.split("+");
    const listedComponents = new Set(entries.flatMap((entry) =>
      entry.compositionSignature.split("+")));
    if (components.length > 1 && components.every((component) => listedComponents.has(component))) {
      return {
        ...baseMatch(
          "uncertain",
          "The individual ingredients are listed, but this fixed combination is not listed as such.",
        ),
        ingredientMatch: "mismatch",
      };
    }
    return {
      ...baseMatch("not_listed", "No matching INN or fixed combination exists in the active release."),
      ingredientMatch: "mismatch",
    };
  }

  const evaluated = candidates.map((entry) => ({
    entry,
    form: fieldMatch(entry.dosageForms, product.dosageForm),
    route: routeMatch(entry, product),
    strength: strengthMatch(entry, product),
  }));
  const exact = evaluated.filter(({ form, route, strength }) =>
    [form, route, strength].every((value) =>
      value === "match" || value === "not_applicable"));
  if (exact.length === 1) {
    const match = exact[0];
    return {
      status: "exact",
      entryStableKey: match.entry.stableKey,
      reason: "INN/composition and every applicable form, route, and strength constraint match.",
      ingredientMatch: "match",
      formMatch: match.form,
      routeMatch: match.route,
      strengthMatch: match.strength,
      resolverVersion: NATIONAL_LIST_RESOLVER_VERSION,
    };
  }
  if (exact.length > 1) {
    return {
      ...baseMatch("uncertain", "More than one national-list position matches the product exactly."),
      ingredientMatch: "match",
    };
  }
  const closest = evaluated[0];
  return {
    status: "ingredient_only",
    entryStableKey: closest.entry.stableKey,
    reason: "The INN/composition is listed, but product form, route, or strength is not confirmed.",
    ingredientMatch: "match",
    formMatch: closest.form,
    routeMatch: closest.route,
    strengthMatch: closest.strength,
    resolverVersion: NATIONAL_LIST_RESOLVER_VERSION,
  };
}
