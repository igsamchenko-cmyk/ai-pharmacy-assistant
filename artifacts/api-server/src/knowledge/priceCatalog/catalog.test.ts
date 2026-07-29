import { describe, expect, it } from "vitest";
import { checkPriceCatalog } from "./catalog";

const CHECKED_AT = new Date("2026-07-29T00:00:00.000Z");

describe("MOH National Price Catalog", () => {
  it("returns the exact maximum retail price for a unique package", () => {
    const result = checkPriceCatalog("UA/18965/01/01", undefined, {
      now: CHECKED_AT,
    });

    expect(result).toMatchObject({
      status: "priced",
      selected: {
        catalogId: "UA-000000000-000009205-000017279",
        maximumRetailPriceUah: "1182.597",
      },
      source: { recordCount: 11_060, freshness: "current" },
    });
  });

  it("requires the exact package before returning a price", () => {
    const ambiguous = checkPriceCatalog("UA/6658/01/01", undefined, {
      now: CHECKED_AT,
    });

    expect(ambiguous.status).toBe("requires_package");
    expect(ambiguous.selected).toBeNull();
    expect(ambiguous.candidates.length).toBeGreaterThan(1);

    const selected = checkPriceCatalog(
      "UA/6658/01/01",
      "UA-000000000-000006210-000056093",
      { now: CHECKED_AT },
    );
    expect(selected.status).toBe("priced");
    expect(selected.selected).toMatchObject({
      catalogId: "UA-000000000-000006210-000056093",
      maximumRetailPriceUah: "858.394",
    });
  });

  it("keeps absence from the catalog explicit and non-conclusive", () => {
    const result = checkPriceCatalog("UA/999999/99/99", undefined, {
      now: CHECKED_AT,
    });

    expect(result.status).toBe("not_in_catalog");
    expect(result.summary).toContain("не є доказом");
    expect(result.selected).toBeNull();
  });
});
