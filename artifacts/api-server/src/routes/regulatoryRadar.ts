import { Router, type IRouter } from "express";
import { GetRegulatoryRadarResponse } from "@workspace/api-zod";
import { requireRole } from "../auth";
import { loadRegulatoryRadar } from "../services/regulatoryRadarService";

const router: IRouter = Router();
router.use(requireRole("user"));

router.get("/regulatory-radar", (_req, res): void => {
  try {
    const payload = GetRegulatoryRadarResponse.parse(loadRegulatoryRadar());
    res.set(
      "Cache-Control",
      "private, max-age=120, stale-while-revalidate=180",
    );
    res.json(payload);
  } catch {
    res.status(503).json({
      error: "Verified regulatory source snapshots are unavailable",
    });
  }
});

export default router;
