import { Router, type IRouter } from "express";
import authRouter from "./auth";
import healthRouter from "./health";
import drugsRouter from "./drugs";
import catalogRouter from "./catalog";
import interactionsRouter from "./interactions";
import aiRouter from "./ai";
import ocrRouter from "./ocr";
import historyRouter from "./history";
import externalRouter from "./external";
import knowledgeRouter from "./knowledge";
import diagnosticsRouter from "./diagnostics";
import betaDashboardRouter from "./betaDashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(drugsRouter);
router.use(catalogRouter);
router.use(interactionsRouter);
router.use(aiRouter);
router.use(ocrRouter);
router.use(historyRouter);
router.use(externalRouter);
router.use(knowledgeRouter);
router.use(betaDashboardRouter);
router.use(diagnosticsRouter);

export default router;
