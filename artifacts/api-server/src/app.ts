import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { toNodeHandler } from "better-auth/node";
import router from "./routes";
import { logger } from "./lib/logger";
import { auth } from "./lib/auth";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// Block sign-up when ALLOW_SIGNUP is not explicitly "true"
app.post(/^\/api\/auth\/sign-up/, (_req, res, next) => {
  if (process.env.ALLOW_SIGNUP !== "true") {
    res.status(403).json({ error: "Sign up is currently disabled" });
    return;
  }
  next();
});

// Better Auth handles its own body parsing — mount BEFORE express.json()
app.use("/api/auth", toNodeHandler(auth.handler));

app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as unknown as Record<string, unknown> & { rawBody?: string }).rawBody = buf.toString("utf8");
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Serve frontend static files in production
if (process.env.NODE_ENV === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const staticPath =
    process.env.STATIC_FILES_PATH ||
    path.join(__dirname, "../../../ops-bridge/dist/public");
  app.use(express.static(staticPath));
  app.get("/*splat", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(staticPath, "index.html"));
  });
}

export default app;
