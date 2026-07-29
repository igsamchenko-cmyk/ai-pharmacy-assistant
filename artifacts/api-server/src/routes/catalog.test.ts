import { describe, expect, it } from "vitest";
import {
  GetProfessionalProductProfileQueryParams,
  SearchCatalogQueryParams,
} from "@workspace/api-zod";
import { normalizeCatalogQueryParams } from "./catalog";

describe("catalog route query normalization", () => {
  it("coerces only supported grouped page-size values before generated validation", () => {
    const parsed = SearchCatalogQueryParams.safeParse(
      normalizeCatalogQueryParams({
        q: "Amlodipine",
        view: "grouped",
        groupPage: "2",
        groupPageSize: "10",
        tradePageSize: "25",
        variantPageSize: "10",
      }),
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({
      groupPage: 2,
      groupPageSize: 10,
      tradePageSize: 25,
      variantPageSize: 10,
    });
  });

  it("leaves unsupported or ambiguous page-size values for Zod to reject", () => {
    expect(
      SearchCatalogQueryParams.safeParse(
        normalizeCatalogQueryParams({ groupPageSize: "30" }),
      ).success,
    ).toBe(false);
    expect(
      SearchCatalogQueryParams.safeParse(
        normalizeCatalogQueryParams({ groupPageSize: ["10", "25"] }),
      ).success,
    ).toBe(false);
  });
});

describe("professional profile query contract", () => {
  it("accepts only an exact registry product identity", () => {
    expect(
      GetProfessionalProductProfileQueryParams.safeParse({
        productId: "0123456789ABCDEF0123456789ABCDEF",
        registrationNumber: "UA/12345/01/01",
      }).success,
    ).toBe(true);

    expect(
      GetProfessionalProductProfileQueryParams.safeParse({
        productId: "not-an-exact-id",
        registrationNumber: "UA/12345/01/01",
      }).success,
    ).toBe(false);

    expect(
      GetProfessionalProductProfileQueryParams.safeParse({
        productId: "0123456789ABCDEF0123456789ABCDEF",
        registrationNumber: "",
      }).success,
    ).toBe(false);
  });
});
