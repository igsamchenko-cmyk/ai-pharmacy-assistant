import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { searchRxNorm, __clearRxNormCache } from "../providers/rxnorm";
import { searchOpenFda, __clearOpenFdaCache } from "../providers/openfda";

function mockFetchSequence(
  responses: Array<{ ok?: boolean; status?: number; body: unknown }>,
) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.body,
    });
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("RxNorm provider", () => {
  beforeEach(() => __clearRxNormCache());
  afterEach(() => vi.unstubAllGlobals());

  it("returns normalized info and caches subsequent lookups", async () => {
    const fetchMock = mockFetchSequence([
      { body: { idGroup: { rxnormId: ["161"] } } },
      {
        body: {
          allRelatedGroup: {
            conceptGroup: [
              { tty: "IN", conceptProperties: [{ name: "acetaminophen" }] },
              { tty: "BN", conceptProperties: [{ name: "Tylenol" }] },
            ],
          },
        },
      },
    ]);

    const info = await searchRxNorm("acetaminophen");
    expect(info).toEqual({
      rxcui: "161",
      name: "acetaminophen",
      ingredients: ["acetaminophen"],
      brands: ["Tylenol"],
    });

    // Second call is served from cache — no extra fetches.
    const again = await searchRxNorm("Acetaminophen");
    expect(again).toEqual(info);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when no rxcui matches", async () => {
    mockFetchSequence([{ body: { idGroup: {} } }]);
    expect(await searchRxNorm("nonexistent")).toBeNull();
  });

  it("degrades to null on network failure instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    await expect(searchRxNorm("aspirin")).resolves.toBeNull();
  });
});

describe("openFDA provider", () => {
  beforeEach(() => __clearOpenFdaCache());
  afterEach(() => vi.unstubAllGlobals());

  it("maps a label result to normalized info", async () => {
    mockFetchSequence([
      {
        body: {
          results: [
            {
              openfda: {
                brand_name: ["Tylenol"],
                generic_name: ["ACETAMINOPHEN"],
                manufacturer_name: ["Acme"],
              },
              purpose: ["Pain reliever"],
              warnings: ["Liver warning"],
            },
          ],
        },
      },
    ]);

    expect(await searchOpenFda("acetaminophen")).toEqual({
      brandName: "Tylenol",
      genericName: "ACETAMINOPHEN",
      manufacturer: "Acme",
      purpose: "Pain reliever",
      warnings: "Liver warning",
    });
  });

  it("escapes quotes in the name so it cannot break out of the search phrase", async () => {
    const fetchMock = mockFetchSequence([
      { ok: false, status: 404, body: {} },
    ]);
    await searchOpenFda('acme" OR x:"y');
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    const decoded = decodeURIComponent(calledUrl);
    // Both user-supplied quotes must be escaped (\") so they cannot close the
    // search phrase early. (URLSearchParams encodes spaces as '+'.)
    expect(decoded).toContain('acme\\"');
    expect(decoded).toContain('x:\\"y');
  });

  it("returns null on a 404 miss", async () => {
    mockFetchSequence([{ ok: false, status: 404, body: {} }]);
    expect(await searchOpenFda("nothing")).toBeNull();
  });

  it("degrades to null on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    await expect(searchOpenFda("aspirin")).resolves.toBeNull();
  });
});
