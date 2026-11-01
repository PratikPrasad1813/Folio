import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getUser, publicUser, sameOrigin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const current = await getUser();
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Please send valid JSON." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const weeklyGoal = Number(body.weeklyGoal);
  if (!name || name.length > 80) return Response.json({ error: "Please enter a name between 1 and 80 characters." }, { status: 400 });
  if (!Number.isInteger(weeklyGoal) || weeklyGoal < 1 || weeklyGoal > 200) return Response.json({ error: "Weekly goal must be between 1 and 200." }, { status: 400 });
  const [updated] = await db.update(users).set({ name, weeklyGoal }).where(eq(users.id, current.id)).returning();
  return Response.json({ user: publicUser(updated) });
}
