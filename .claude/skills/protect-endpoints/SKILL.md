---
name: protect-endpoints
description: Protects REST endpoints with authentication and authorization. Use when creating a new Express router, adding any GET/POST/PUT/PATCH/DELETE route to an existing router, or reviewing endpoint access controls. Every authenticated endpoint must be gated by both requireAuth and a permission/ownership check.
---

# Protect REST endpoints with authz

**Rule:** every route behind `requireAuth` MUST also carry an authorization check. If you add a route with only auth and no permission check, the IDOR/permission bypass is on you.

## Decision

```
Public / third-party webhook   → no requireAuth, verify signature/HMAC inside handler
Internal read-only             → requireAuth + requirePermission('resource:read')
Internal state-changing        → requireAuth + requirePermission('resource:write')
Admin-only operations          → requireAuth + requirePermission('admin')
```

## Current architecture

- Auth: `better-auth` with `requireAuth` middleware (`apps/api-server/src/lib/require-auth.ts`).
- Routers: plain Express `Router` modules in `apps/api-server/src/routes/*.ts`, mounted in `apps/api-server/src/routes/index.ts`.
- No RBAC system exists yet. If you are adding the first permission-gated route, you must build the permission layer first (see "Bootstrap the permission layer" below).

## Apply the gate

### 1. Route registration

In `apps/api-server/src/routes/index.ts`, every protected router must use both `requireAuth` and a permission middleware:

```ts
// apps/api-server/src/routes/index.ts
import { requireAuth } from "../lib/require-auth";
import { requirePermission } from "../lib/permissions";

// Public
router.use(healthRouter);
router.use("/webhooks", webhooksRouter);

// Protected + permission-gated
router.use("/events", requireAuth, requirePermission("event:read"), eventsRouter);
router.use("/sessions", requireAuth, requirePermission("session:read"), sessionsRouter);
router.use("/artifacts", requireAuth, requirePermission("artifact:read"), artifactsRouter);
router.use("/integrations", requireAuth, requirePermission("integration:read"), integrationsRouter);
router.use("/model-settings", requireAuth, requirePermission("setting:write"), modelSettingsRouter);
router.use("/dashboard", requireAuth, requirePermission("event:read"), dashboardRouter);
```

**Important:** `requireAuth` must come before `requirePermission` because the permission middleware reads `req.user` from the session.

### 2. Permission middleware

Create `apps/api-server/src/lib/permissions.ts`:

```ts
import type { RequestHandler } from "express";
import { auth } from "./auth";
import { fromNodeHeaders } from "better-auth/node";

export type Permission =
  | "event:read"
  | "event:write"
  | "session:read"
  | "session:write"
  | "artifact:read"
  | "artifact:write"
  | "artifact:approve"
  | "integration:read"
  | "integration:write"
  | "setting:read"
  | "setting:write"
  | "admin";

export function requirePermission(permission: Permission): RequestHandler {
  return async (req, res, next) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session?.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Attach user to request for downstream handlers
    (req as any).user = session.user;

    const userPermissions = await getUserPermissions(session.user.id);
    if (!userPermissions.includes(permission) && !userPermissions.includes("admin")) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  };
}

async function getUserPermissions(userId: string): Promise<Permission[]> {
  // TODO: implement based on your roles table
  // Default: all authenticated users get read access
  return ["event:read", "session:read", "artifact:read", "integration:read"];
}
```

### 3. Scoped route patterns

For fine-grained routes, compose middleware inline or use a helper:

```ts
// In the router file — apply permission per route
import { Router } from "express";
import { requirePermission } from "../lib/permissions";

const router = Router();

router.get("/", requirePermission("event:read"), async (req, res) => { ... });
router.post("/", requirePermission("event:write"), async (req, res) => { ... });
router.get("/:id", requirePermission("event:read"), async (req, res) => { ... });
router.patch("/:id", requirePermission("event:write"), async (req, res) => { ... });
router.delete("/:id", requirePermission("event:write"), async (req, res) => { ... });
```

**Conventions:**
- Use `*:read` for `GET` (list and get-one).
- Use `*:write` for `POST` / `PUT` / `PATCH` / `DELETE`.
- Use `*:approve` for approval workflows (e.g. `artifact:approve`).
- `admin` is a wildcard that satisfies any permission check.

## Bootstrap the permission layer

If the permission system does not exist yet, add it in this order:

### 1. DB schema (`lib/db/src/schema/permissions.ts`)

```ts
import { pgTable, text, primaryKey } from "drizzle-orm/pg-core";

export const rolesTable = pgTable("role", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const rolePermissionsTable = pgTable(
  "role_permission",
  {
    roleId: text("role_id").notNull().references(() => rolesTable.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
);

export const userRolesTable = pgTable(
  "user_role",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    roleId: text("role_id").notNull().references(() => rolesTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);
```

Export from `lib/db/src/schema/index.ts`.

### 2. Permission middleware (`apps/api-server/src/lib/permissions.ts`)

Implement `getUserPermissions` by querying `userRolesTable` → `rolePermissionsTable`.

### 3. Seed default roles

Add a one-time seed or startup sync:

```ts
const DEFAULT_ROLES = {
  admin: ["admin"],
  operator: [
    "event:read", "event:write",
    "session:read", "session:write",
    "artifact:read", "artifact:write", "artifact:approve",
    "integration:read", "integration:write",
    "setting:read", "setting:write",
  ],
  viewer: [
    "event:read",
    "session:read",
    "artifact:read",
    "integration:read",
  ],
};
```

### 4. Frontend wiring

Update `apps/frontend/src/App.tsx` or add a `usePermission` hook to gate UI based on the same permission strings. Keep the frontend and backend permission names identical.

## Public / unauthenticated routes

Webhook routes (GitHub, Linear, Slack, Sentry, Better Stack) are public by design. They must:

1. **Omit `requireAuth`** entirely.
2. **Authenticate via signature/HMAC** inside the handler.
3. **Carry a comment** explaining why no auth middleware is applied.

Example from `apps/api-server/src/routes/webhooks.ts`:

```ts
// Public webhook: no requireAuth. Auth happens via per-source signature
// verification inside each handler.
router.post("/github", async (req, res) => {
  const eventHeader = req.headers["x-github-event"] as string | undefined;
  const { allowed, reason } = await isAllowedGithubEvent(eventHeader);
  if (!allowed) {
    return res.status(202).json({ accepted: false, reason });
  }
  ...
});
```

## Defense in depth (still required)

Middleware gates *who can call this URL*. Service / DB queries must gate *what they can read*.

- Filter by ownership, tenant, or project where applicable.
- Do not assume `requirePermission("event:read")` means the user can read *all* events.
- Use user-scoped queries or `WHERE` clauses in Drizzle when the domain supports multi-tenancy.

## Verify with tests

Add a test that iterates all mounted routes and asserts auth/permission coverage. Since Moonga uses plain Express routers, use `express-list-endpoints` or iterate the router stack:

```ts
// apps/api-server/src/routes/__tests__/route-security.test.ts
import router from "../index";
import { requireAuth } from "../../lib/require-auth";
import { requirePermission } from "../../lib/permissions";

function getRoutes(r: any, base = ""): { method: string; path: string; handlers: string[] }[] {
  const routes: any[] = [];
  r.stack.forEach((layer: any) => {
    if (layer.route) {
      Object.keys(layer.route.methods).forEach((method) => {
        if (layer.route.methods[method]) {
          routes.push({
            method: method.toUpperCase(),
            path: base + layer.route.path,
            handlers: layer.route.stack.map((l: any) => l.handle.name || "anonymous"),
          });
        }
      });
    } else if (layer.name === "router" && layer.handle.stack) {
      const newBase = base + (layer.regexp.source.replace("\\/?(?=|$)", "").replace("(?:\\/)", "/") || "");
      routes.push(...getRoutes(layer.handle, newBase));
    }
  });
  return routes;
}

const PUBLIC_PREFIXES = ["/healthz", "/webhooks"];

describe("route security", () => {
  const routes = getRoutes(router);

  routes.forEach(({ method, path, handlers }) => {
    const isPublic = PUBLIC_PREFIXES.some((p) => path.startsWith(p));
    if (isPublic) return;

    it(`${method} ${path} has requireAuth`, () => {
      expect(handlers).toContain("requireAuth");
    });

    it(`${method} ${path} has requirePermission`, () => {
      expect(handlers.some((h) => h.includes("requirePermission"))).toBe(true);
    });
  });
});
```

## Reference patterns

- Auth setup: `apps/api-server/src/lib/require-auth.ts`
- Public webhooks: `apps/api-server/src/routes/webhooks.ts`
- Router mounting: `apps/api-server/src/routes/index.ts`
