import { Router, type IRouter } from "express";
import {
  KnowledgeSearchQueryParams,
  KnowledgeSearchResponse,
  NormalizeDrugNameQueryParams,
  NormalizeDrugNameResponse,
  GetKnowledgeStatsResponse,
  GetDataQualityResponse,
  ListKnowledgeSourcesResponse,
  GetImportPreviewResponse,
  GetAtcInfoResponse,
  CompareDrugsBody,
  CompareDrugsResponse,
  GetKnowledgeRuntimeStatusResponse,
} from "@workspace/api-zod";
import {
  knowledgeSearch,
  getKnowledgeEngineStats,
  getAtcInfo,
  compareDrugs,
  validateKnowledge,
  listSources,
  parseImportCsv,
  analyzeImport,
  liveKnowledgeView,
  readDictionarySampleCsv,
  resolveRuntimeName,
  getKnowledgeRuntimeStatus,
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

router.get("/knowledge/normalize", async (req, res): Promise<void> => {
  const parsed = NormalizeDrugNameQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const resolved = await resolveRuntimeName(parsed.data.q);
  res.json(
    NormalizeDrugNameResponse.parse({
      query: parsed.data.q,
      matched: resolved.entry !== null,
      entry: resolved.entry,
      source: resolved.source,
      confidence: resolved.entry?.confidence ?? null,
      provenance: resolved.entry?.provenance ?? null,
      warnings: resolved.warnings,
    }),
  );
});

router.get("/knowledge/runtime/status", async (_req, res): Promise<void> => {
  res.json(GetKnowledgeRuntimeStatusResponse.parse(await getKnowledgeRuntimeStatus()));
});

router.get("/knowledge/stats", (_req, res): void => {
  res.json(GetKnowledgeStatsResponse.parse(getKnowledgeEngineStats()));
});

router.get("/knowledge/quality", (_req, res): void => {
  res.json(GetDataQualityResponse.parse(validateKnowledge()));
});

router.get("/knowledge/sources", (_req, res): void => {
  res.json(ListKnowledgeSourcesResponse.parse({ sources: listSources() }));
});

router.get("/knowledge/import/preview", (_req, res): void => {
  const { rows, errors } = parseImportCsv(readDictionarySampleCsv());
  const preview = analyzeImport(rows, liveKnowledgeView(), errors);
  res.json(GetImportPreviewResponse.parse(preview));
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
