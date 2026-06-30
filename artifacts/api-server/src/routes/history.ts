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
} from "../services/historyService";

const router: IRouter = Router();

router.get("/history", async (_req, res): Promise<void> => {
  const rows = await listHistory();
  res.json(ListHistoryResponse.parse(rows));
});

router.post("/history", async (req, res): Promise<void> => {
  const parsed = CreateHistoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const row = await createHistory({
    type: parsed.data.type,
    title: parsed.data.title,
    detail: parsed.data.detail,
  });
  res.status(201).json(CreateHistoryResponse.parse(row));
});

router.delete("/history", async (_req, res): Promise<void> => {
  await clearHistory();
  res.sendStatus(204);
});

router.delete("/history/:id", async (req, res): Promise<void> => {
  const params = DeleteHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deleted = await deleteHistory(params.data.id);
  if (!deleted) {
    res.status(404).json({ error: "Запис не знайдено" });
    return;
  }
  res.sendStatus(204);
});

export default router;
