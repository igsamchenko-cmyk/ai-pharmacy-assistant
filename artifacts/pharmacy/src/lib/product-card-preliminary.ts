import type { CatalogClientIndexProduct } from "@workspace/catalog-index";
import {
  normalizeOfflineProductIdentity,
  type OfflineProductIdentity,
} from "@/lib/offline-product-card";

export function catalogProductToPreliminaryIdentity(
  product: CatalogClientIndexProduct,
): OfflineProductIdentity | null {
  return normalizeOfflineProductIdentity({
    productId: product.productId,
    registration: product.registration,
    tradeName: product.tradeName,
    inn: product.inn,
    form: product.form,
    strength: product.strength,
  });
}

export type ProductCardPresentation<TServerCard> =
  | { source: "server"; card: TServerCard }
  | { source: "preliminary"; identity: OfflineProductIdentity }
  | { source: "loading" }
  | { source: "missing" };

export function selectProductCardPresentation<TServerCard>(options: {
  serverCard?: TServerCard | null;
  preliminary?: OfflineProductIdentity | null;
  loading: boolean;
}): ProductCardPresentation<TServerCard> {
  if (options.serverCard) return { source: "server", card: options.serverCard };
  if (options.loading && options.preliminary) {
    return { source: "preliminary", identity: options.preliminary };
  }
  return { source: options.loading ? "loading" : "missing" };
}
