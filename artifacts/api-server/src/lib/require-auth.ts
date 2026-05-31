import type { RequestHandler } from "express";
import { auth } from "./auth";
import { fromNodeHeaders } from "better-auth/node";

export const requireAuth: RequestHandler = async (req, res, next) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};
