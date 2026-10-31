import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { appOrigin, isProviderConfigured, OAUTH_PROVIDERS, redirectUri, type OAuthProvider } from "@/lib/oauth";

export const dynamic = "force-dynamic";

function providerOrError(value: string): OAuthProvider | null {
  return value === "google" || value === "github" ? value : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: slug } = await params;
  const origin = appOrigin(request);
  const provider = providerOrError(slug);
  if (!provider) return Response.redirect(`${origin}/?auth_error=${encodeURIComponent("That sign-in option isn’t available.")}`, 302);
  if (!isProviderConfigured(provider)) {
    const label = OAUTH_PROVIDERS[provider].label;
    return Response.redirect(`${origin}/?auth_error=${encodeURIComponent(`${label} sign-in isn’t connected to this deployment yet. Use email and password to continue, or add ${label.toUpperCase()}_CLIENT_ID and ${label.toUpperCase()}_CLIENT_SECRET.`)}`, 302);
  }
  const config = OAUTH_PROVIDERS[provider];
  const state = randomBytes(24).toString("hex");
  const jar = await cookies();
  const secure = new URL(origin).protocol === "https:";
  jar.set("folio_oauth_state", state, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 600 });
  jar.set("folio_oauth_provider", provider, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 600 });
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId()!);
  url.searchParams.set("redirect_uri", redirectUri(request, provider));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);
  if (provider === "google") url.searchParams.set("prompt", "select_account");
  return Response.redirect(url.toString(), 302);
}
