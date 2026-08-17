import { describe, expect, it } from "vitest";
import {
  catalogRegistrationCertificate,
  catalogRegistrationStatus,
  type CatalogClientIndexProduct,
  type CatalogClientIndexSearchItem,
} from "@workspace/catalog-index";
import { groupCatalogVariants } from "./catalog-result-variants";

const TODAY = new Date("2026-08-17T00:00:00.000Z");

function item(
  registration: string,
  overrides: Partial<CatalogClientIndexProduct> = {},
  rank = 0,
): CatalogClientIndexSearchItem {
  return {
    product: {
      productId: registration
        .replace(/\D/gu, "")
        .padStart(32, "0")
        .slice(0, 32),
      registration,
      tradeName: "ОМЕПРАЗОЛ",
      inn: "Omeprazole",
      form: "капсули",
      strength: "",
      compositionKey: "",
      manufacturer: "Фармак",
      registrationValidity: "2030-01-01",
      ...overrides,
    },
    rank,
    matchedBy: "trade_exact",
  };
}

describe("groupCatalogVariants", () => {
  it("collapses the lines of one certificate into a single choice", () => {
    // UA/19799/01/01-03 is one Фармак omeprazole in three strengths, not
    // three products competing for the pharmacist's attention.
    const groups = groupCatalogVariants(
      [
        item("UA/19799/01/01", { strength: "10 мг" }),
        item("UA/19799/01/02", { strength: "20 мг" }),
        item("UA/19799/01/03", { strength: "40 мг" }),
      ],
      TODAY,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe("UA/19799");
    expect(groups[0]?.strengths).toEqual(["10 мг", "20 мг", "40 мг"]);
    expect(groups[0]?.lines).toHaveLength(3);
  });

  it("keeps different certificates and different manufacturers apart", () => {
    const groups = groupCatalogVariants(
      [
        item("UA/19799/01/01", { manufacturer: "Фармак" }),
        item("UA/9067/01/01", { manufacturer: "АСТРАФАРМ" }),
      ],
      TODAY,
    );
    expect(groups.map((group) => group.manufacturer)).toEqual([
      "АСТРАФАРМ",
      "Фармак",
    ]);
  });

  it("does not merge lines of one certificate that differ in form", () => {
    const groups = groupCatalogVariants(
      [
        item("UA/11146/01/01", { form: "капсули" }),
        item("UA/11146/01/02", { form: "порошок для розчину для ін'єкцій" }),
      ],
      TODAY,
    );
    expect(groups).toHaveLength(2);
  });

  it("sorts terminated registrations last without hiding them", () => {
    const groups = groupCatalogVariants(
      [
        item("UA/1/01/01", { registrationValidity: "2020-01-01" }),
        item("UA/2/01/01", { registrationValidity: "2030-01-01" }),
      ],
      TODAY,
    );
    expect(groups.map((group) => group.status)).toEqual([
      "active",
      "terminated",
    ]);
    expect(groups).toHaveLength(2);
  });

  it("treats a certificate as valid while any of its lines still is", () => {
    const groups = groupCatalogVariants(
      [
        item("UA/5/01/01", { registrationValidity: "2020-01-01" }),
        item("UA/5/01/02", { registrationValidity: "2030-01-01" }),
      ],
      TODAY,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.status).toBe("active");
  });
});

describe("catalogRegistrationStatus", () => {
  it("reads an explicit early termination and an elapsed end date", () => {
    expect(catalogRegistrationStatus("!", TODAY)).toBe("terminated");
    expect(catalogRegistrationStatus("2026-08-16", TODAY)).toBe("terminated");
    expect(catalogRegistrationStatus("2026-08-17", TODAY)).toBe("active");
  });

  it("never reads a missing or malformed date as active", () => {
    expect(catalogRegistrationStatus("", TODAY)).toBe("unknown");
    expect(catalogRegistrationStatus("безстроково", TODAY)).toBe("unknown");
  });
});

describe("catalogRegistrationCertificate", () => {
  it("extracts the certificate a package line belongs to", () => {
    expect(catalogRegistrationCertificate("UA/19799/01/03")).toBe("UA/19799");
    expect(catalogRegistrationCertificate("ua/9067/01/01")).toBe("UA/9067");
  });

  it("returns nothing for a number outside the canonical shape", () => {
    expect(catalogRegistrationCertificate("UA/19799")).toBe("");
    expect(catalogRegistrationCertificate("")).toBe("");
  });
});
