import { Router, type IRouter } from "express";
import {
  SearchDrugsQueryParams,
  SearchDrugsResponse,
  GetDrugStatsResponse,
  GetDrugParams,
  GetDrugResponse,
  GetDrugAnalogsParams,
  GetDrugAnalogsResponse,
} from "@workspace/api-zod";
import { searchDrugs, getDrugById, getStats } from "../services/drugService";
import { findAnalogs } from "../services/analogService";
import { requireRole } from "../auth";

const router: IRouter = Router();
router.use(requireRole("user"));

router.get("/drugs", async (req, res): Promise<void> => {
  const parsed = SearchDrugsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const results = searchDrugs(parsed.data.q ?? "", parsed.data.field ?? "all");
  res.json(SearchDrugsResponse.parse(results));
});

router.get("/drugs/stats", async (_req, res): Promise<void> => {
  res.json(GetDrugStatsResponse.parse(getStats()));
});

router.get("/drugs/:id", async (req, res): Promise<void> => {
  const params = GetDrugParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const drug = getDrugById(params.data.id);
  if (!drug) {
    res.status(404).json({ error: "Препарат не знайдено" });
    return;
  }
  res.json(GetDrugResponse.parse(drug));
});

router.get("/drugs/:id/analogs", async (req, res): Promise<void> => {
  const params = GetDrugAnalogsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = findAnalogs(params.data.id);
  if (!result) {
    res.status(404).json({ error: "Препарат не знайдено" });
    return;
  }
  res.json(GetDrugAnalogsResponse.parse(result));
});

export default router;
