import { Router, type IRouter } from "express";
import {
  CheckInteractionsBody,
  CheckInteractionsResponse,
  GetInteractionInstructionSignalsBody,
  GetInteractionInstructionSignalsResponse,
} from "@workspace/api-zod";
import {
  RegistryInteractionSelectionError,
  checkRegistryInteractions,
} from "../services/interactionService";
import { getInteractionInstructionSignals } from "../services/interactionInstructionSignalService";
import { requireReferenceAccess } from "../auth";

const router: IRouter = Router();
router.use(requireReferenceAccess);

router.post("/interactions/check", async (req, res): Promise<void> => {
  const parsed = CheckInteractionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const result = await checkRegistryInteractions(parsed.data.products);
    res.json(CheckInteractionsResponse.parse(result));
  } catch (error) {
    if (error instanceof RegistryInteractionSelectionError) {
      if (error.code === "registry_unavailable") {
        res.status(503).json({ error: "Реєстр тимчасово недоступний." });
        return;
      }
      if (error.code === "product_not_found") {
        res.status(404).json({ error: "Точну реєстрову позицію не знайдено." });
        return;
      }
      res.status(400).json({ error: "Один препарат не можна обрати двічі." });
      return;
    }
    throw error;
  }
});

router.post(
  "/interactions/instruction-signals",
  async (req, res): Promise<void> => {
    const parsed = GetInteractionInstructionSignalsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    try {
      const result = await getInteractionInstructionSignals(
        parsed.data.products,
      );
      res.json(GetInteractionInstructionSignalsResponse.parse(result));
    } catch (error) {
      if (error instanceof RegistryInteractionSelectionError) {
        if (error.code === "registry_unavailable") {
          res.status(503).json({ error: "Реєстр тимчасово недоступний." });
          return;
        }
        if (error.code === "product_not_found") {
          res
            .status(404)
            .json({ error: "Точну реєстрову позицію не знайдено." });
          return;
        }
        res.status(400).json({ error: "Один препарат не можна обрати двічі." });
        return;
      }
      throw error;
    }
  },
);

export default router;
