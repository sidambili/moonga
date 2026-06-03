import { Router, type IRouter } from "express";
import healthRouter from "./health";
import eventsRouter from "./events";
import sessionsRouter from "./sessions";
import artifactsRouter from "./artifacts";
import integrationsRouter from "./integrations";
import modelSettingsRouter from "./model-settings";
import modelPricesRouter from "./model-prices";
import dashboardRouter from "./dashboard";
import webhooksRouter from "./webhooks";
import playbooksRouter from "./playbooks";
import skillsRouter from "./skills";
import projectsRouter from "./projects";
import projectSourcesRouter from "./project-sources";
import { requireAuth } from "../lib/require-auth";

const router: IRouter = Router();

// Public
router.use(healthRouter);
router.use("/webhooks", webhooksRouter);

// Protected
router.use("/events", requireAuth, eventsRouter);
router.use("/sessions", requireAuth, sessionsRouter);
router.use("/artifacts", requireAuth, artifactsRouter);
router.use("/integrations", requireAuth, integrationsRouter);
router.use("/model-settings", requireAuth, modelSettingsRouter);
router.use("/model-prices", requireAuth, modelPricesRouter);
router.use("/dashboard", requireAuth, dashboardRouter);
router.use("/playbooks", requireAuth, playbooksRouter);
router.use("/skills", requireAuth, skillsRouter);
// Authz is enforced per-handler (org membership + ownership); see projects.ts.
router.use("/projects", requireAuth, projectsRouter);
router.use("/project-sources", requireAuth, projectSourcesRouter);

export default router;
