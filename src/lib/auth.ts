// Demo mode: authentication is intentionally disabled for now.
// Every request resolves to a single shared demo workspace owner, so the rest
// of the app (API route, workspace views, actions) keeps working unchanged.
// When sign-in comes back, only this file and the page guards need to change.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { seedWorkspace } from "@/lib/seed";
import { ensureSchema } from "@/db/migrate";

export const DEMO_EMAIL = "demo@folio.studio";
export const DEMO_NAME = "Pratik Prasad";

let bootstrap: Promise<typeof users.$inferSelect> | null = null;

async function resolveDemoUser() {
  await ensureSchema();
  const [existing] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  if (existing) {
    await seedWorkspace(existing.id);
    return existing;
  }
  const [created] = await db
    .insert(users)
    .values({ name: DEMO_NAME, email: DEMO_EMAIL, provider: "demo", weeklyGoal: 14 })
    .onConflictDoNothing()
    .returning();
  if (created) {
    await seedWorkspace(created.id);
    return created;
  }
  const [fallback] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  await seedWorkspace(fallback.id);
  return fallback;
}

export async function getUser() {
  if (!bootstrap) {
    bootstrap = resolveDemoUser().catch((error) => {
      bootstrap = null;
      throw error;
    });
  }
  return bootstrap;
}

export function publicUser(user: typeof users.$inferSelect) {
  return { id: user.id, name: user.name, email: user.email, provider: user.provider, weeklyGoal: user.weeklyGoal };
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return [request.headers.get("host"), new URL(request.url).host].includes(new URL(origin).host);
  } catch {
    return false;
  }
}
