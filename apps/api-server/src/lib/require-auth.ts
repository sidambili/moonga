import type { RequestHandler } from "express";
import { auth } from "./auth";
import { fromNodeHeaders } from "better-auth/node";
import { logger } from "./logger";

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    // Expose the caller's identity + active tenant so handlers can scope reads
    // and gate writes by tenant. See lib/tenant-scope.ts and lib/org-access.ts.
    res.locals.userId = session.user.id;
    res.locals.sessionId = session.session.id;
    res.locals.activeOrganizationId = session.session.activeOrganizationId ?? null;
    res.locals.activeProjectId =
      (session.session as { activeProjectId?: string | null }).activeProjectId ?? null;
    next();
  } catch (err) {
    logger.error(err, "requireAuth: session lookup failed");
    res.status(500).json({ error: "Internal Server Error" });
  }
};
