import { Router, type IRouter } from "express";
import {
  GetRegulatoryRadarResponse,
  RefreshRegulatoryRadarResponse,
  SearchRegulatoryEventsQueryParams,
  SearchRegulatoryEventsResponse,
} from "@workspace/api-zod";
import { requireReferenceAccess } from "../auth";
import {
  loadRegulatoryRadar,
  searchRegulatoryEvents,
} from "../services/regulatoryRadarService";
import { refreshRegulatoryRadarIfDue } from "../services/regulatoryRadarRefreshService";

const router: IRouter = Router();
router.use(requireReferenceAccess);

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

router.get("/regulatory-radar/events", (req, res): void => {
  const parsed = SearchRegulatoryEventsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid regulatory event search parameters" });
    return;
  }

  try {
    const payload = SearchRegulatoryEventsResponse.parse(
      searchRegulatoryEvents(parsed.data),
    );
    res.set("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
    res.json(payload);
  } catch {
    res.status(503).json({
      error: "Verified DLS disposition journal is unavailable",
    });
  }
});

router.post("/regulatory-radar/refresh", async (req, res): Promise<void> => {
  try {
    const result = RefreshRegulatoryRadarResponse.parse(
      await refreshRegulatoryRadarIfDue(),
    );
    if (result.status === "failed") {
      req.log.warn(
        "Automatic DLS runtime refresh failed; retained verified snapshot",
      );
    }
    res.set("Cache-Control", "private, no-store");
    res.json(result);
  } catch {
    res.status(503).json({
      error: "Verified regulatory source snapshot is unavailable",
    });
  }
});

export default router;
