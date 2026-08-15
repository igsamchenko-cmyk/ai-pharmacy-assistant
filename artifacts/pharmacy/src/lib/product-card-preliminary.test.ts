import { describe, expect, it } from "vitest";
import type { CatalogClientIndexProduct } from "@workspace/catalog-index";
import {
  catalogProductToPreliminaryIdentity,
  selectProductCardPresentation,
} from "./product-card-preliminary";

const catalogProduct: CatalogClientIndexProduct = {
  productId: "A".repeat(32),
  registration: "UA/10001/01/01",
  tradeName: "Попередня назва",
  inn: "Панкреатин",
  form: "капсули",
  strength: "10000 ОД",
};

describe("preliminary ProductCard presentation", () => {
  it("renders the exact six-field index identity while the network is pending", () => {
    const identity = catalogProductToPreliminaryIdentity(catalogProduct);
    expect(
      selectProductCardPresentation({
        serverCard: null,
        preliminary: identity,
        loading: true,
      }),
    ).toMatchObject({ source: "preliminary", identity });
  });

  it("fully replaces preliminary data with the server object without merging", () => {
    const identity = catalogProductToPreliminaryIdentity(catalogProduct);
    const serverCard = {
      identity: { tradeName: "Серверна назва" },
      warnings: ["server-only"],
    };
    const presentation = selectProductCardPresentation({
      serverCard,
      preliminary: identity,
      loading: false,
    });
    expect(presentation).toEqual({ source: "server", card: serverCard });
    expect(JSON.stringify(presentation)).not.toContain("Попередня назва");
  });
});
