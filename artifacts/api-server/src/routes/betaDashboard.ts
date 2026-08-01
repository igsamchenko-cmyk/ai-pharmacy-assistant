import { Router, type IRouter } from "express";
import {
  GetBetaDashboardStatusResponse,
  RunBetaDashboardCheckBody,
  RunBetaDashboardCheckResponse,
} from "@workspace/api-zod";
import {
  buildBetaDashboardStatus,
  runBetaDashboardCheck,
} from "../beta/dashboard";
import { requireRole } from "../auth";

const router: IRouter = Router();
router.use(requireRole("reviewer"));

router.get("/beta/dashboard/status", async (_req, res): Promise<void> => {
  const status = await buildBetaDashboardStatus();
  res.json(GetBetaDashboardStatusResponse.parse(status));
});

router.post("/beta/dashboard/run", async (req, res): Promise<void> => {
  const parsed = RunBetaDashboardCheckBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await runBetaDashboardCheck(parsed.data.checkType);
  res.json(RunBetaDashboardCheckResponse.parse(result));
});

export default router;
