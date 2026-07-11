import { describe, expect, it } from "vitest";
import { parseRegistryImportFlags } from "../ingestion";

describe("registry import CLI flags", () => {
  it("selects an approved-only mappings commit with products disabled", () => {
    expect(
      parseRegistryImportFlags([
        "--download",
        "--mappings-only",
        "--only-approved-mappings",
        "--commit",
        "--require-db",
        "--mapping-chunk-size=100",
      ]),
    ).toMatchObject({
      commit: true,
      requireDb: true,
      products: false,
      mappings: true,
      onlyApprovedMappings: true,
      mappingChunkSize: 100,
    });
  });

  it("accepts the documented only-approved alias", () => {
    expect(
      parseRegistryImportFlags([
        "--mappings-only",
        "--only-approved",
        "--commit",
        "--require-db",
      ]).onlyApprovedMappings,
    ).toBe(true);
  });

  it("keeps products-only independent from mappings", () => {
    expect(
      parseRegistryImportFlags(["--products-only", "--commit", "--require-db"]),
    ).toMatchObject({
      products: true,
      mappings: false,
      onlyApprovedMappings: false,
    });
  });

  it.each([
    [["--products-only", "--mappings-only"], /either --products-only/],
    [["--products", "--mappings-only"], /either --products/],
    [["--products-only", "--only-approved"], /cannot be combined/],
    [
      ["--products", "--only-approved", "--commit", "--require-db"],
      /must use either --products-only or --mappings-only/,
    ],
    [["--mappings-only", "--commit"], /requires --require-db/],
    [
      ["--mappings-only", "--commit", "--require-db"],
      /requires --only-approved/,
    ],
    [["--force"], /does not support --force/],
    [["--mapping-chunk-size=0"], /positive integer/],
  ])("rejects unsafe or conflicting flags", (argv, message) => {
    expect(() => parseRegistryImportFlags(argv)).toThrow(message);
  });
});
