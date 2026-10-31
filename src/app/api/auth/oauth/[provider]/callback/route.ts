import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { appOrigin, exchangeProviderCode, isProviderConfigured, OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/oauth";

export const dynamic = "force-dynamic";

function fail(origin: string, message: string) {
  return Response.redirect(`${origin}/?auth_error=${encodeURIComponent(message)}`, 302);
}

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const origin = appOrigin(request);
  const { provider: slug } = await params;
  const provider = (slug === "google" || slug === "github" ? slug : null) as OAuthProvider | null;
  if (!provider) return fail(origin, "That sign-in option isn’t available.");
  const label = OAUTH_PROVIDERS[provider].label;
  if (!isProviderConfigured(provider)) return fail(origin, `${label} sign-in isn’t configured for this deployment.`);
  const jar = await cookies();
  const expectedState = jar.get("folio_oauth_state")?.value;
  const expectedProvider = jar.get("folio_oauth_provider")?.value;
  jar.delete("folio_oauth_state");
  jar.delete("folio_oauth_provider");
  try {
    const url = new URL(request.url);
    const providerError = url.searchParams.get("error");
    if (providerError) return fail(origin, providerError === "access_denied" ? `${label} sign-in was cancelled. You can try again or continue with email.` : `${label} could not complete the sign-in.`);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state || !expectedState || state !== expectedState || expectedProvider !== provider) return fail(origin, "That sign-in link expired or didn’t match. Please try again.");
    const profile = await exchangeProviderCode(provider, request, code);
    const [existing] = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);
    let user = existing;
    if (user) {
      if (user.provider !== provider) {
        console.warn(`Account ${user.id} signed in with ${provider}; keeping original provider link.`);
      }
    } else {
      [user] = await db.insert(users).values({ name: profile.name.slice(0, 80), email: profile.email, provider }).returning();
    }
    await createSession(user.id);
    return Response.redirect(`${origin}/overview`, 302);
  } catch (error) {
    console.error("OAuth callback failed:", error);
    return fail(origin, error instanceof Error ? error.message : `${label} sign-in could not be completed.`);
  }
}
