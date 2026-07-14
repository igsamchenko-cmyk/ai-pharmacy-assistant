import { Router, type IRouter } from "express";
import {
  GetDrugInstructionParams,
  GetDrugInstructionResponse,
  SearchCatalogQueryParams,
  SearchCatalogResponse,
} from "@workspace/api-zod";
import { requireRole } from "../auth";
import { getInstructionForProduct } from "../knowledge/instructions/catalog";
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

router.get("/catalog/products/:productId/instruction", (req, res): void => {
  const parsed = GetDrugInstructionParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid product identifier" });
    return;
  }

  const instruction = getInstructionForProduct(parsed.data.productId);
  if (!instruction) {
    res.status(404).json({ error: "Official instruction is not available" });
    return;
  }

  res.json(GetDrugInstructionResponse.parse(instruction));
});

export default router;
