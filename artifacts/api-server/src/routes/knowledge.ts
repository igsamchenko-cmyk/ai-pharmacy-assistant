import { Router, type IRouter } from "express";
import {
  KnowledgeSearchQueryParams,
  KnowledgeSearchResponse,
  NormalizeDrugNameQueryParams,
  NormalizeDrugNameResponse,
  GetKnowledgeStatsResponse,
  GetAtcInfoResponse,
  CompareDrugsBody,
  CompareDrugsResponse,
} from "@workspace/api-zod";
import {
  knowledgeSearch,
  normalizeQuery,
  getKnowledgeEngineStats,
  getAtcInfo,
  compareDrugs,
} from "../knowledge";

const router: IRouter = Router();

router.get("/knowledge/search", async (req, res): Promise<void> => {
  const parsed = KnowledgeSearchQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await knowledgeSearch(parsed.data.q, {
    skipExternal: parsed.data.skipExternal,
  });
  res.json(KnowledgeSearchResponse.parse(result));
});

router.get("/knowledge/normalize", (req, res): void => {
  const parsed = NormalizeDrugNameQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const entry = normalizeQuery(parsed.data.q);
  res.json(
    NormalizeDrugNameResponse.parse({
      query: parsed.data.q,
      matched: entry !== null,
      entry,
    }),
  );
});

router.get("/knowledge/stats", (_req, res): void => {
  res.json(GetKnowledgeStatsResponse.parse(getKnowledgeEngineStats()));
});

router.get("/atc/:code", (req, res): void => {
  const info = getAtcInfo(req.params.code);
  if (!info) {
    res.status(404).json({ error: "Невідомий ATC-код" });
    return;
  }
  res.json(GetAtcInfoResponse.parse(info));
});

router.post("/compare", (req, res): void => {
  const parsed = CompareDrugsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.drugIds.length < 2) {
    res.status(400).json({ error: "Оберіть щонайменше 2 препарати для порівняння" });
    return;
  }
  if (parsed.data.drugIds.length > 5) {
    res.status(400).json({ error: "Можна порівняти не більше 5 препаратів одночасно" });
    return;
  }
  res.json(CompareDrugsResponse.parse(compareDrugs(parsed.data.drugIds)));
});

export default router;
