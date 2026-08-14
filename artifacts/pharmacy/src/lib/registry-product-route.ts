export interface RegistryProductRouteTarget {
  id: string;
  registration: { number: string };
}

export const REGISTRY_PRODUCT_ID_PATTERN = /^[A-F0-9]{32}$/u;
export const REGISTRATION_NUMBER_PATTERN = /^UA\/\d+\/\d+\/\d+$/u;

export function registryProductDetailHref(
  product: RegistryProductRouteTarget,
): string {
  return `/products/${encodeURIComponent(product.id)}?registration=${encodeURIComponent(product.registration.number)}`;
}

export function registrationFromSearch(search: string): string {
  const registration =
    new URLSearchParams(search).get("registration")?.trim() ?? "";
  return REGISTRATION_NUMBER_PATTERN.test(registration) ? registration : "";
}

export function correctedQueryFromSearch(search: string): string {
  const corrected =
    new URLSearchParams(search).get("correctedQuery")?.trim() ?? "";
  if (
    !corrected ||
    corrected.length > 120 ||
    /[\u0000-\u001f\u007f]/u.test(corrected)
  ) {
    return "";
  }
  return corrected.replace(/\s+/gu, " ");
}
