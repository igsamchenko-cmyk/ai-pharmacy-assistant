import { Router, type IRouter, type Response } from "express";
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
  ListReviewQueueQueryParams,
  ListReviewQueueResponse,
  GetReviewStatsResponse,
  ApproveReviewItemParams,
  ApproveReviewItemBody,
  ApproveReviewItemResponse,
  RejectReviewItemParams,
  RejectReviewItemBody,
  RejectReviewItemResponse,
  MarkReviewItemNeedsReviewParams,
  MarkReviewItemNeedsReviewBody,
  MarkReviewItemNeedsReviewResponse,
} from "@workspace/api-zod";
import {
  knowledgeSearch,
  getKnowledgeEngineStats,
  getAtcInfo,
  compareDrugs,

  listSources,
  parseImportCsv,
  analyzeImport,
  liveKnowledgeView,
  readDictionarySampleCsv,
  resolveRuntimeName,
  getKnowledgeRuntimeStatus,
  listReviewQueue,
  getReviewStats,
  applyReviewAction,
  ReviewItemNotFoundError,
  ReviewWorkflowUnavailableError,
  REVIEW_WORKFLOW_UNAVAILABLE_WARNING,
} from "../knowledge";
import { requireRole } from "../auth";
import { buildDataQualityApiReport } from "../knowledge/qualityReport";

const router: IRouter = Router();
function parseBody<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { message: string } } }, body: unknown) {
  return schema.safeParse(body ?? {});
}

function handleReviewError(error: unknown, res: Response): void {
  if (error instanceof ReviewItemNotFoundError) {
    res.status(404).json({ error: "Review item not found" });
    return;
  }
  if (error instanceof ReviewWorkflowUnavailableError) {
    res.status(503).json({ error: REVIEW_WORKFLOW_UNAVAILABLE_WARNING });
    return;
  }
  throw error;
}

router.get("/knowledge/search", requireRole("user"), async (req, res): Promise<void> => {
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

router.get("/knowledge/normalize", requireRole("user"), async (req, res): Promise<void> => {
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

router.get("/knowledge/runtime/status", requireRole("reviewer"), async (_req, res): Promise<void> => {
  res.json(GetKnowledgeRuntimeStatusResponse.parse(await getKnowledgeRuntimeStatus()));
});

router.get("/knowledge/stats", requireRole("user"), (_req, res): void => {
  res.json(GetKnowledgeStatsResponse.parse(getKnowledgeEngineStats()));
});

router.get("/knowledge/quality", requireRole("reviewer"), async (_req, res): Promise<void> => {
  res.json(GetDataQualityResponse.parse(await buildDataQualityApiReport()));
});

router.get("/knowledge/sources", requireRole("reviewer"), (_req, res): void => {
  res.json(ListKnowledgeSourcesResponse.parse({ sources: listSources() }));
});

router.get("/knowledge/import/preview", requireRole("reviewer"), (_req, res): void => {
  const { rows, errors } = parseImportCsv(readDictionarySampleCsv());
  const preview = analyzeImport(rows, liveKnowledgeView(), errors);
  res.json(GetImportPreviewResponse.parse(preview));
});


router.get("/knowledge/review/queue", requireRole("reviewer"), async (req, res): Promise<void> => {
  const parsed = ListReviewQueueQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(ListReviewQueueResponse.parse(await listReviewQueue(parsed.data)));
});

router.get("/knowledge/review/stats", requireRole("reviewer"), async (_req, res): Promise<void> => {
  res.json(GetReviewStatsResponse.parse(await getReviewStats()));
});

router.post("/knowledge/review/:id/approve", requireRole("admin"), async (req, res): Promise<void> => {
  const params = ApproveReviewItemParams.safeParse(req.params);
  const body = parseBody(ApproveReviewItemBody, req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const result = await applyReviewAction(
      params.data.id,
      "approved",
      "approved",
      body.data,
    );
    res.json(ApproveReviewItemResponse.parse(result));
  } catch (error) {
    handleReviewError(error, res);
  }
});

router.post("/knowledge/review/:id/reject", requireRole("admin"), async (req, res): Promise<void> => {
  const params = RejectReviewItemParams.safeParse(req.params);
  const body = parseBody(RejectReviewItemBody, req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const result = await applyReviewAction(
      params.data.id,
      "rejected",
      "rejected",
      body.data,
    );
    res.json(RejectReviewItemResponse.parse(result));
  } catch (error) {
    handleReviewError(error, res);
  }
});

router.post("/knowledge/review/:id/needs-review", requireRole("reviewer"), async (req, res): Promise<void> => {
  const params = MarkReviewItemNeedsReviewParams.safeParse(req.params);
  const body = parseBody(MarkReviewItemNeedsReviewBody, req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const result = await applyReviewAction(
      params.data.id,
      "needs_review",
      "marked_needs_review",
      body.data,
    );
    res.json(MarkReviewItemNeedsReviewResponse.parse(result));
  } catch (error) {
    handleReviewError(error, res);
  }
});
router.get("/atc/:code", requireRole("user"), (req, res): void => {
  const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const info = getAtcInfo(code);
  if (!info) {
    res.status(404).json({ error: "Невідомий ATC-код" });
    return;
  }
  res.json(GetAtcInfoResponse.parse(info));
});

router.post("/compare", requireRole("user"), (req, res): void => {
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
