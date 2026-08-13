import { describe, expect, it } from "vitest";
import { searchOfficialInstructions } from "../instructionSearchService";

describe("official instruction search runtime safety", () => {
  it("yields to the server event loop while scanning the instruction corpus", async () => {
    let searchSettled = false;
    const search = searchOfficialInstructions({ q: "calcium" }).then(
      (result) => {
        searchSettled = true;
        return result;
      },
    );

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(searchSettled).toBe(false);
    const result = await search;
    expect(result.indexedInstructionCount).toBe(200);
  });
});
