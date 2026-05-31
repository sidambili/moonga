import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import eventsRouter from "./events";
import sessionsRouter from "./sessions";
import artifactsRouter from "./artifacts";
import integrationsRouter from "./integrations";
import modelSettingsRouter from "./model-settings";
import modelPricesRouter from "./model-prices";
import dashboardRouter from "./dashboard";
import webhooksRouter from "./webhooks";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use("/webhooks", webhooksRouter);

router.use(requireAuth);

router.use("/events", eventsRouter);
router.use("/sessions", sessionsRouter);
router.use("/artifacts", artifactsRouter);
router.use("/integrations", integrationsRouter);
router.use("/model-settings", modelSettingsRouter);
router.use("/model-prices", modelPricesRouter);
router.use("/dashboard", dashboardRouter);

export default router;
