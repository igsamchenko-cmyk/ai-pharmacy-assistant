import { Router, type IRouter } from "express";
import {
  ListDataSourcesResponse,
  GetExternalDrugReferenceQueryParams,
  GetExternalDrugReferenceResponse,
} from "@workspace/api-zod";
import {
  getExternalReference,
  getSourceStatuses,
} from "../services/externalDataService";

const router: IRouter = Router();

router.get("/sources", (_req, res): void => {
  res.json(ListDataSourcesResponse.parse({ sources: getSourceStatuses() }));
});

router.get("/external/drug", async (req, res): Promise<void> => {
  const parsed = GetExternalDrugReferenceQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!parsed.data.drugId && !parsed.data.name) {
    res.status(400).json({ error: "Provide either drugId or name." });
    return;
  }
  const reference = await getExternalReference({
    drugId: parsed.data.drugId,
    name: parsed.data.name,
  });
  res.json(GetExternalDrugReferenceResponse.parse(reference));
});

export default router;
