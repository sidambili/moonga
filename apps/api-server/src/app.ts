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
const allowedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS
  ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((o) => o.trim())
  : [];

// Always trust the app's own origin, mirroring auth.ts. The frontend is served
// from this same origin in production, so same-origin requests (e.g. login POSTs,
// which always carry an Origin header) must be allowed even when the operator
// hasn't listed the origin in BETTER_AUTH_TRUSTED_ORIGINS.
if (process.env.BETTER_AUTH_URL) {
  const baseOrigin = new URL(process.env.BETTER_AUTH_URL).origin;
  if (!allowedOrigins.includes(baseOrigin)) {
    allowedOrigins.push(baseOrigin);
  }
}

// Scope CORS to the API only — static assets and the SPA fallback are served from
// this same origin and must never be gated by the API's CORS policy. (Vite emits
// its <script>/<link> tags with a crossorigin attribute, so the browser sends an
// Origin header for /assets/* and a CORS rejection there would 500 the whole app.)
app.use(
  "/api",
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  }),
);

const noCacheMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
};

app.use("/api", noCacheMiddleware);
app.use("/auth", noCacheMiddleware);

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
    path.join(__dirname, "../../../frontend/dist/public");
  app.use(express.static(staticPath));
  app.get("/*splat", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(staticPath, "index.html"));
  });
}

export default app;
