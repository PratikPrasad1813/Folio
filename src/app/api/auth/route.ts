import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { allowAuthAttempt, createSession, destroySession, getUser, hashPassword, publicUser, sameOrigin, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Request not allowed." }, { status: 403 });
  if (!allowAuthAttempt(request)) return Response.json({ error: "Too many attempts. Please try again in 15 minutes." }, { status: 429 });
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
    if (password.length < 8 || password.length > 128) return Response.json({ error: "Use a password between 8 and 128 characters." }, { status: 400 });
    if (body.action === "register") {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
      if (!name) return Response.json({ error: "Please enter your name." }, { status: 400 });
      const [existing] = await db.select({ id: users.id, provider: users.provider }).from(users).where(eq(users.email, email)).limit(1);
      if (existing) return Response.json({ error: existing.provider === "email" ? "This email already has an account. Try signing in." : `This email is linked to ${existing.provider === "google" ? "Google" : "GitHub"} sign-in. Please continue with that provider.` }, { status: 409 });
      const passwordHash = await hashPassword(password);
      const [user] = await db.insert(users).values({ name, email, passwordHash, provider: "email" }).returning();
      await createSession(user.id);
      return Response.json({ user: publicUser(user) });
    }
    if (body.action !== "login") return Response.json({ error: "Unknown authentication action." }, { status: 400 });
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) return Response.json({ error: "That email and password don’t match. Please try again." }, { status: 401 });
    if (!user.passwordHash) return Response.json({ error: `This account uses ${user.provider === "google" ? "Google" : user.provider === "github" ? "GitHub" : "social"} sign-in. Continue with that provider instead.` }, { status: 401 });
    if (!await verifyPassword(password, user.passwordHash)) return Response.json({ error: "That email and password don’t match. Please try again." }, { status: 401 });
    await createSession(user.id);
    return Response.json({ user: publicUser(user) });
  } catch (error) {
    console.error("Authentication failed:", error);
    return Response.json({ error: "We couldn’t complete that request. Please try again." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Request not allowed." }, { status: 403 });
  const user = await getUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : user.name;
    const weeklyGoal = body.weeklyGoal === undefined ? user.weeklyGoal : Number(body.weeklyGoal);
    if (!name || !Number.isInteger(weeklyGoal) || weeklyGoal < 1 || weeklyGoal > 100) return Response.json({ error: "Enter a name and a weekly goal between 1 and 100." }, { status: 400 });
    const [updated] = await db.update(users).set({ name, weeklyGoal }).where(eq(users.id, user.id)).returning();
    return Response.json({ user: publicUser(updated) });
  } catch { return Response.json({ error: "Could not save your preferences." }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Request not allowed." }, { status: 403 });
  await destroySession();
  return Response.json({ ok: true });
}
