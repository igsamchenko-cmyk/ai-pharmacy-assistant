import { Router, type IRouter } from "express";
import { ScanPackageBody, ScanPackageResponse } from "@workspace/api-zod";
import { scanPackage } from "../services/ocrService";

const router: IRouter = Router();

router.post("/ocr/scan", async (req, res): Promise<void> => {
  const parsed = ScanPackageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await scanPackage({
    imageBase64: parsed.data.imageBase64,
    manualText: parsed.data.manualText,
  });
  res.json(ScanPackageResponse.parse(result));
});

export default router;
