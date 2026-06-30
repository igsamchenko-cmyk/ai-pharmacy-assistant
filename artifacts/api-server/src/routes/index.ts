import { Router, type IRouter } from "express";
import healthRouter from "./health";
import drugsRouter from "./drugs";
import interactionsRouter from "./interactions";
import aiRouter from "./ai";
import ocrRouter from "./ocr";
import historyRouter from "./history";

const router: IRouter = Router();

router.use(healthRouter);
router.use(drugsRouter);
router.use(interactionsRouter);
router.use(aiRouter);
router.use(ocrRouter);
router.use(historyRouter);

export default router;
