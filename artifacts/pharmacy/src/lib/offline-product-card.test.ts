import { describe, expect, it } from "vitest";
import { normalizeOfflineProductIdentity } from "./offline-product-card";

describe("normalizeOfflineProductIdentity", () => {
  it("keeps only bounded, display-safe registry identity fields", () => {
    const identity = normalizeOfflineProductIdentity({
      productId: " drug-1 ",
      registration: " UA/1234/01/01 ",
      tradeName: " Креон\n10000 ",
      inn: " Pancreatin ",
      form: " capsules ",
      strength: " 150 mg ",
      savedAt: "2026-08-14T10:00:00.000Z",
    });

    expect(identity).toMatchObject({
      productId: "drug-1",
      registration: "UA/1234/01/01",
      tradeName: "Креон 10000",
      inn: "Pancreatin",
      form: "capsules",
      strength: "150 mg",
    });
  });

  it("rejects identities that cannot identify a registry position", () => {
    expect(
      normalizeOfflineProductIdentity({
        productId: "",
        registration: "UA/1",
        tradeName: "Креон",
        inn: "",
        form: "",
        strength: "",
      }),
    ).toBeNull();
  });
});
