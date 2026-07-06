import { Router, type IRouter } from "express";
import { buildDiagnosticsPanelData } from "../diagnostics";
import { requireRole } from "../auth";

const router: IRouter = Router();
router.use(requireRole("reviewer"));

router.get("/diagnostics", async (req, res): Promise<void> => {
  res.json(await buildDiagnosticsPanelData(process.env, req));
});

export default router;

