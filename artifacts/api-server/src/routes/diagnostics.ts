import { Router, type IRouter } from "express";
import { buildDiagnosticsPanelData } from "../diagnostics";

const router: IRouter = Router();

router.get("/diagnostics", async (_req, res): Promise<void> => {
  res.json(await buildDiagnosticsPanelData());
});

export default router;

