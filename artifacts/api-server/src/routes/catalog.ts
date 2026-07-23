import { Router, type IRouter } from "express";
import {
  GetCatalogClientIndexResponse,
  GetDrugInstructionParams,
  GetDrugInstructionResponse,
  SearchCatalogQueryParams,
  SearchCatalogResponse,
} from "@workspace/api-zod";
import { requireRole } from "../auth";
import { getOfficialInstructionForProduct } from "../services/officialInstructionService";
import { loadCatalogClientIndex } from "../services/catalogClientIndexService";
import { searchCatalog } from "../services/catalogSearchService";

const PAGE_SIZE_QUERY_KEYS = [
  "groupPageSize",
  "tradePageSize",
  "variantPageSize",
] as const;

export function normalizeCatalogQueryParams(
  query: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...query };
  for (const key of PAGE_SIZE_QUERY_KEYS) {
    const value = normalized[key];
    if (value === "10" || value === "25") normalized[key] = Number(value);
  }
  return normalized;
}
const router: IRouter = Router();
router.use(requireRole("user"));

router.get("/catalog/client-index", async (req, res): Promise<void> => {
  try {
    const result = await loadCatalogClientIndex(req.get("if-none-match"));
    res.set({
      "Cache-Control": "private, max-age=0, must-revalidate",
      ETag: `"${result.status === "ready" ? result.payload.snapshotHash : result.snapshotHash}"`,
      "X-Catalog-Product-Count": String(
        result.status === "ready"
          ? result.payload.productCount
          : result.productCount,
      ),
    });
    if (result.status === "not_modified") {
      res.status(304).end();
      return;
    }
    res.set("X-Catalog-Index-Bytes", String(result.wireBytes));
    res.json(GetCatalogClientIndexResponse.parse(result.payload));
  } catch {
    res.status(503).json({
      error: "Complete local catalog index is temporarily unavailable",
    });
  }
});

router.get("/catalog/search", async (req, res): Promise<void> => {
  const parsed = SearchCatalogQueryParams.safeParse(
    normalizeCatalogQueryParams(req.query as Record<string, unknown>),
  );
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid catalog search parameters" });
    return;
  }

  const result = await searchCatalog(parsed.data);
  res.json(SearchCatalogResponse.parse(result));
});

router.get(
  "/catalog/products/:productId/instruction",
  async (req, res): Promise<void> => {
    const parsed = GetDrugInstructionParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid product identifier" });
      return;
    }

    try {
      const instruction = await getOfficialInstructionForProduct(
        parsed.data.productId,
      );
      if (!instruction) {
        res
          .status(404)
          .json({ error: "Official instruction is not available" });
        return;
      }
      res.json(GetDrugInstructionResponse.parse(instruction));
    } catch {
      res.status(503).json({
        error: "Official instruction is temporarily unavailable",
      });
    }
  },
);

export default router;
