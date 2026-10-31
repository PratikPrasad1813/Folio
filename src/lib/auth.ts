import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { eq, gt, and } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

const scryptAsync = promisify(scrypt);
const COOKIE_NAME = "folio_session";
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await scryptAsync(password, salt, 64) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const key = await scryptAsync(password, salt, 64) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return expected.length === key.length && timingSafeEqual(expected, key);
}

export async function getUser() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const [row] = await db.select({ user: users }).from(sessions).innerJoin(users, eq(sessions.userId, users.id)).where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()))).limit(1);
  return row?.user ?? null;
}

export function publicUser(user: typeof users.$inferSelect) {
  return { id: user.id, name: user.name, email: user.email, provider: user.provider, weeklyGoal: user.weeklyGoal };
}

const SEVEN_DAYS = 60 * 60 * 24 * 7;

export async function createSession(userId: string) {
  await destroySession();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SEVEN_DAYS * 1000);
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt });
  (await cookies()).set(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  jar.delete(COOKIE_NAME);
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return [request.headers.get("host"), new URL(request.url).host].includes(new URL(origin).host); } catch { return false; }
}

const attempts = new Map<string, { count: number; reset: number }>();
export function allowAuthAttempt(request: Request) {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const now = Date.now();
  for (const [k, value] of attempts) if (value.reset < now) attempts.delete(k);
  const value = attempts.get(key) || { count: 0, reset: now + 15 * 60 * 1000 };
  value.count += 1;
  attempts.set(key, value);
  return value.count <= 20;
}
