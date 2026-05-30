import { Router, type IRouter } from "express";
import healthRouter from "./health";
import eventsRouter from "./events";
import sessionsRouter from "./sessions";
import artifactsRouter from "./artifacts";
import integrationsRouter from "./integrations";
import modelSettingsRouter from "./model-settings";
import dashboardRouter from "./dashboard";
import webhooksRouter from "./webhooks";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/events", eventsRouter);
router.use("/sessions", sessionsRouter);
router.use("/artifacts", artifactsRouter);
router.use("/integrations", integrationsRouter);
router.use("/model-settings", modelSettingsRouter);
router.use("/dashboard", dashboardRouter);
router.use("/webhooks", webhooksRouter);

export default router;
