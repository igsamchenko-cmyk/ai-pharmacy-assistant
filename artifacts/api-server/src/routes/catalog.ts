import { Router, type IRouter } from "express";
import {
  CheckProductDispensingCategoryQueryParams,
  CheckProductDispensingCategoryResponse,
  CheckProductSeriesRestrictionsQueryParams,
  CheckProductSeriesRestrictionsResponse,
  GetCatalogClientIndexResponse,
  GetDrugInstructionParams,
  GetDrugInstructionResponse,
  GetProfessionalProductProfileQueryParams,
  GetProfessionalProductProfileResponse,
  SearchCatalogQueryParams,
  SearchCatalogResponse,
} from "@workspace/api-zod";
import { checkDispensingCategory } from "../knowledge/dispensingCategories/catalog";
import { requireRole } from "../auth";
import { getOfficialInstructionForProduct } from "../services/officialInstructionService";
import { loadCatalogClientIndex } from "../services/catalogClientIndexService";
import { searchCatalog } from "../services/catalogSearchService";
import { loadProfessionalProductProfile } from "../services/professionalProductProfileService";
import { checkSeriesRestrictions } from "../knowledge/seriesRestrictions/catalog";

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

router.get("/catalog/professional-profile", async (req, res): Promise<void> => {
  const parsed = GetProfessionalProductProfileQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid product identifier or registration number",
    });
    return;
  }

  const result = await loadProfessionalProductProfile(
    parsed.data.productId,
    parsed.data.registrationNumber,
    undefined,
    {
      reimbursementPackageKey: parsed.data.reimbursementPackageKey,
      priceCatalogId: parsed.data.priceCatalogId,
    },
  );
  if (result.status === "not_found") {
    res.status(404).json({ error: "Exact registry product was not found" });
    return;
  }
  if (result.status === "unavailable") {
    res.status(503).json({
      error: "Exact production registry profile is unavailable",
    });
    return;
  }

  res.json(GetProfessionalProductProfileResponse.parse(result.profile));
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

router.get("/catalog/dispensing-category", async (req, res): Promise<void> => {
  const parsed = CheckProductDispensingCategoryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid product or registration number",
    });
    return;
  }

  try {
    const result = checkDispensingCategory(
      parsed.data.productId,
      parsed.data.registrationNumber,
    );
    res.json(CheckProductDispensingCategoryResponse.parse(result));
  } catch {
    res.status(503).json({
      error: "Verified DRLZ dispensing-category snapshot is unavailable",
    });
  }
});

router.get("/catalog/series-restrictions", async (req, res): Promise<void> => {
  const parsed = CheckProductSeriesRestrictionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid product, registration number or series",
    });
    return;
  }

  try {
    const result = checkSeriesRestrictions(
      parsed.data.productId,
      parsed.data.registrationNumber,
      parsed.data.series,
    );
    res.json(CheckProductSeriesRestrictionsResponse.parse(result));
  } catch {
    res.status(503).json({
      error: "Verified DLS quality-document snapshot is unavailable",
    });
  }
});

export default router;
