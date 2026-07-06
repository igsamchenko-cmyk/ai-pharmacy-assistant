import { Router, type IRouter } from "express";
import {
  CheckInteractionsBody,
  CheckInteractionsResponse,
} from "@workspace/api-zod";
import { checkInteractions } from "../services/interactionService";
import { requireRole } from "../auth";

const router: IRouter = Router();
router.use(requireRole("user"));

router.post("/interactions/check", async (req, res): Promise<void> => {
  const parsed = CheckInteractionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.drugIds.length < 2) {
    res
      .status(400)
      .json({ error: "Оберіть щонайменше 2 препарати для перевірки" });
    return;
  }
  if (parsed.data.drugIds.length > 5) {
    res
      .status(400)
      .json({ error: "Можна перевірити не більше 5 препаратів одночасно" });
    return;
  }
  const result = checkInteractions(parsed.data.drugIds);
  res.json(CheckInteractionsResponse.parse(result));
});

export default router;
