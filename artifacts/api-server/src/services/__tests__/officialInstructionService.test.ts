import { describe, expect, it, vi } from "vitest";
import type { DrugInstructionSnapshot } from "../../knowledge/instructions/model";
import {
  getOfficialInstructionForProduct,
  hasOfficialInstructionSource,
  resolveOfficialInstructionSource,
  type OfficialInstructionQueryExecutor,
} from "../officialInstructionService";

const PRODUCT_ID = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const REGISTRATION = "UA/99999/01/01";
const SOURCE_URL =
  "https://www.drlz.com.ua/ibp/lz_www.nsf/id/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB/$file/UA999990101_ABCD.mht";

function executor(
  instructionUrl: string | null = SOURCE_URL,
): OfficialInstructionQueryExecutor {
  return {
    query: vi.fn(async () => ({
      rows: [
        {
          registry_id: PRODUCT_ID,
          registration_number: REGISTRATION,
          trade_name: "ТЕСТОВИЙ ПРЕПАРАТ",
          inn: "Test ingredient",
          active_ingredient: "Test ingredient 10 mg",
          form: "tablets",
          strength: "10 mg",
          applicant_name: "Applicant",
          applicant_country: "Ukraine",
          registration_start_date: "2025-01-01",
          registration_end_date: "unlimited",
          instruction_url: instructionUrl,
          manufacturer_name: "Manufacturer",
          manufacturer_country: "Ukraine",
        },
      ],
    })),
  };
}

function snapshot(
  overrides: Partial<DrugInstructionSnapshot> = {},
): DrugInstructionSnapshot {
  return {
    version: "1.0",
    registryProductId: PRODUCT_ID,
    registrationNumber: REGISTRATION,
    tradeName: "ТЕСТОВИЙ ПРЕПАРАТ",
    inn: "Test ingredient",
    activeIngredient: "Test ingredient 10 mg",
    dosageForm: "tablets",
    strength: "10 mg",
    manufacturer: "Manufacturer",
    manufacturerCountry: "Ukraine",
    registrationStartDate: "2025-01-01",
    registrationEndDate: "unlimited",
    status: "available",
    sections: {
      indications: "Official indications.",
      contraindications: "Official contraindications.",
      adverseReactions: "Official adverse reactions.",
      interactions: "Official interactions.",
      specialWarnings: "Official warnings.",
      pregnancyAndLactation: "Official pregnancy information.",
      administration: "Official administration.",
      overdose: "Official overdose information.",
      storage: "Official storage information.",
    },
    source: {
      url: SOURCE_URL,
      documentId: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      documentDate: null,
      checkedAt: "2026-07-23T00:00:00.000Z",
      documentHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      contentLength: 7,
      parserVersion: "ua-drlz-mht-v1",
      datasetTitle: "State Register of Medicines of Ukraine",
      datasetUrl:
        "https://data.gov.ua/dataset/fded13b8-4e2c-4c48-bf14-65d0e3106463",
      license: "Creative Commons Attribution 4.0",
    },
    provenance: {
      sourceAllowed: true,
      registrationMatched: true,
      contentLocationMatched: true,
      availableSectionCount: 9,
      coveragePct: 100,
    },
    warnings: [],
    ...overrides,
  };
}

describe("official DRLZ instruction service", () => {
  it("accepts only the bounded official DRLZ document URL contract", () => {
    expect(hasOfficialInstructionSource(SOURCE_URL)).toBe(true);
    expect(
      hasOfficialInstructionSource(
        "https://example.com/ibp/lz_www.nsf/id/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB/$file/UA999990101_ABCD.mht",
      ),
    ).toBe(false);
    expect(hasOfficialInstructionSource("https://www.drlz.com.ua/")).toBe(
      false,
    );
    expect(
      resolveOfficialInstructionSource(
        "https://www.drlz.com.ua/ibp/lz_www.nsf/id/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC/$file/UA999990101_ABCD.pdf",
        REGISTRATION,
      ),
    ).toEqual(expect.objectContaining({ status: "official_document" }));
    expect(
      resolveOfficialInstructionSource(SOURCE_URL, "UA/99998/01/01"),
    ).toEqual({ status: "invalid_source", documentUrl: null });
  });

  it("loads and validates the exact current registry product on demand", async () => {
    const queryExecutor = executor();
    const fetcher = vi.fn(
      async () =>
        new Response("fixture", {
          status: 200,
          headers: {
            "content-length": "7",
            "last-modified": "Thu, 23 Jul 2026 00:00:00 GMT",
          },
        }),
    );
    const parser = vi.fn(() => snapshot());

    const result = await getOfficialInstructionForProduct(PRODUCT_ID, {
      executor: queryExecutor,
      fetcher,
      parser,
    });

    expect(result?.registryProductId).toBe(PRODUCT_ID);
    expect(result?.registrationNumber).toBe(REGISTRATION);
    expect(fetcher).toHaveBeenCalledWith(
      SOURCE_URL,
      expect.objectContaining({ method: "GET", redirect: "error" }),
    );
    expect(parser).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        source: expect.objectContaining({
          registryProductId: PRODUCT_ID,
          registrationNumber: REGISTRATION,
          sourceUrl: SOURCE_URL,
        }),
      }),
    );
    const sql = String(
      (queryExecutor.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0],
    );
    expect(sql).toContain("p.registry_id = $1");
    expect(sql).toContain("p.current_status = 'current'");
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\b/iu);
  });

  it("fails closed before download when the exact row has no allowed URL", async () => {
    const fetcher = vi.fn();
    const result = await getOfficialInstructionForProduct(PRODUCT_ID, {
      executor: executor("https://example.com/not-official.mht"),
      fetcher: fetcher as typeof fetch,
      parser: vi.fn(),
    });
    expect(result).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a parsed document whose exact registration provenance fails", async () => {
    const result = await getOfficialInstructionForProduct(PRODUCT_ID, {
      executor: executor(),
      fetcher: async () => new Response("fixture", { status: 200 }),
      parser: () =>
        snapshot({
          provenance: {
            ...snapshot().provenance,
            registrationMatched: false,
          },
          status: "needs_review",
        }),
    });
    expect(result).toBeNull();
  });

  it("returns only a sanitized download failure code", async () => {
    await expect(
      getOfficialInstructionForProduct(PRODUCT_ID, {
        executor: executor(),
        fetcher: async () => {
          throw new Error("upstream failure with internal runtime detail");
        },
        parser: () => snapshot(),
      }),
    ).rejects.toThrow("official_instruction_download_failed");
  });
});
