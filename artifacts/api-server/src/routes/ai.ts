import { Router, type IRouter } from "express";
import {
  CreateAiSummaryBody,
  CreateAiSummaryResponse,
} from "@workspace/api-zod";
import { generateSummary } from "../services/aiService";

const router: IRouter = Router();

router.post("/ai/summary", async (req, res): Promise<void> => {
  const parsed = CreateAiSummaryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await generateSummary({
    drugId: parsed.data.drugId,
    query: parsed.data.query,
  });
  res.json(CreateAiSummaryResponse.parse(result));
});

export default router;
