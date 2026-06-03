import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db, provisionDefaultTenancy, getUserPrimaryOrgId } from "@workspace/db";
import * as schema from "@workspace/db/schema";

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET must be set");
}
if (!process.env.BETTER_AUTH_URL) {
  throw new Error("BETTER_AUTH_URL must be set");
}

const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS
  ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((o) => o.trim())
  : [];

// Ensure the baseURL origin is always trusted for CSRF checks.
const baseOrigin = new URL(process.env.BETTER_AUTH_URL).origin;
if (!trustedOrigins.includes(baseOrigin)) {
  trustedOrigins.push(baseOrigin);
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
  },
  databaseHooks: {
    user: {
      create: {
        // Auto-provision a personal org + default project for every new user,
        // regardless of how they signed up (managed or self-hosted). Throws on
        // failure to fail the signup rather than leave a user with no org.
        after: async (user) => {
          await provisionDefaultTenancy(user);
        },
      },
    },
    session: {
      create: {
        // Point every new session at the user's (first-owned) org so downstream
        // tenant scoping always has an active org to read.
        before: async (session) => {
          const orgId = await getUserPrimaryOrgId(session.userId);
          if (!orgId) return;
          return { data: { ...session, activeOrganizationId: orgId } };
        },
      },
    },
  },
  plugins: [organization()],
});
