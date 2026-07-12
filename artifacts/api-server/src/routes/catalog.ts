import { Router, type IRouter } from "express";
import {
  SearchCatalogQueryParams,
  SearchCatalogResponse,
} from "@workspace/api-zod";
import { requireRole } from "../auth";
import { searchCatalog } from "../services/catalogSearchService";

const router: IRouter = Router();
router.use(requireRole("user"));

router.get("/catalog/search", async (req, res): Promise<void> => {
  const parsed = SearchCatalogQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid catalog search parameters" });
    return;
  }

  const result = await searchCatalog(parsed.data);
  res.json(SearchCatalogResponse.parse(result));
});

export default router;
