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
    // Expose the caller's active org so handlers can scope reads by tenant.
    // See lib/tenant-scope.ts.
    res.locals.activeOrganizationId = session.session.activeOrganizationId ?? null;
    next();
  } catch (err) {
    logger.error(err, "requireAuth: session lookup failed");
    res.status(500).json({ error: "Internal Server Error" });
  }
};
