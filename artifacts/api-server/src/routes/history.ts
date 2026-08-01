import { Router, type IRouter } from "express";
import {
  CreateHistoryBody,
  CreateHistoryResponse,
  ListHistoryResponse,
  DeleteHistoryParams,
} from "@workspace/api-zod";
import {
  listHistory,
  createHistory,
  deleteHistory,
  clearHistory,
  HistoryUnavailableError,
} from "../services/historyService";
import { requireRole } from "../auth";

const router: IRouter = Router();
router.use(requireRole("reviewer"));

router.get("/history", async (_req, res): Promise<void> => {
  try {
    const rows = await listHistory();
    res.json(ListHistoryResponse.parse(rows));
  } catch (error) {
    if (error instanceof HistoryUnavailableError) {
      res.status(503).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.post("/history", async (req, res): Promise<void> => {
  const parsed = CreateHistoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const row = await createHistory({
      type: parsed.data.type,
      title: parsed.data.title,
      detail: parsed.data.detail,
    });
    res.status(201).json(CreateHistoryResponse.parse(row));
  } catch (error) {
    if (error instanceof HistoryUnavailableError) {
      res.status(503).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.delete("/history", async (_req, res): Promise<void> => {
  try {
    await clearHistory();
    res.sendStatus(204);
  } catch (error) {
    if (error instanceof HistoryUnavailableError) {
      res.status(503).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.delete("/history/:id", async (req, res): Promise<void> => {
  const params = DeleteHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const deleted = await deleteHistory(params.data.id);
    if (!deleted) {
    res.status(404).json({ error: "Запис не знайдено" });
      return;
    }
    res.sendStatus(204);
  } catch (error) {
    if (error instanceof HistoryUnavailableError) {
      res.status(503).json({ error: error.message });
      return;
    }
    throw error;
  }
});

export default router;
