export type OAuthProvider = "google" | "github";

interface ProviderConfig {
  id: OAuthProvider;
  label: string;
  authorizeUrl: string;
  scope: string;
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
}

export const OAUTH_PROVIDERS: Record<OAuthProvider, ProviderConfig> = {
  google: {
    id: "google",
    label: "Google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scope: "openid email profile",
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
  },
  github: {
    id: "github",
    label: "GitHub",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    scope: "read:user user:email",
    clientId: () => process.env.GITHUB_CLIENT_ID,
    clientSecret: () => process.env.GITHUB_CLIENT_SECRET,
  },
};

export function isProviderConfigured(provider: OAuthProvider) {
  const config = OAUTH_PROVIDERS[provider];
  return Boolean(config.clientId() && config.clientSecret());
}

export function configuredProviders() {
  return { google: isProviderConfigured("google"), github: isProviderConfigured("github") };
}

export function appOrigin(request: Request) {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) return `${forwardedProto || "https"}://${forwardedHost}`;
  return new URL(request.url).origin;
}

export function redirectUri(request: Request, provider: OAuthProvider) {
  return `${appOrigin(request)}/api/auth/oauth/${provider}/callback`;
}

export async function exchangeProviderCode(provider: OAuthProvider, request: Request, code: string) {
  const config = OAUTH_PROVIDERS[provider];
  const clientId = config.clientId();
  const clientSecret = config.clientSecret();
  if (!clientId || !clientSecret) throw new Error("This sign-in provider is not configured.");
  if (provider === "google") {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri(request, provider), grant_type: "authorization_code" }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Google could not verify this sign-in. Please try again.");
    const tokens = await response.json() as { access_token?: string };
    if (!tokens.access_token) throw new Error("Google did not return an access token.");
    const profile = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store" });
    if (!profile.ok) throw new Error("We couldn’t read your Google profile.");
    const data = await profile.json() as { email?: string; email_verified?: boolean; name?: string };
    if (!data.email || data.email_verified === false) throw new Error("Your Google account needs a verified email address.");
    return { email: data.email.toLowerCase(), name: data.name || data.email.split("@")[0] };
  }
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri(request, provider) }),
    cache: "no-store",
  });
  if (!tokenResponse.ok) throw new Error("GitHub could not verify this sign-in. Please try again.");
  const tokens = await tokenResponse.json() as { access_token?: string };
  if (!tokens.access_token) throw new Error("GitHub did not return an access token.");
  const headers = { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "folio-workspace" };
  const profileResponse = await fetch("https://api.github.com/user", { headers, cache: "no-store" });
  if (!profileResponse.ok) throw new Error("We couldn’t read your GitHub profile.");
  const profile = await profileResponse.json() as { login?: string; name?: string; email?: string };
  let email = profile.email || "";
  if (!email) {
    const emailsResponse = await fetch("https://api.github.com/user/emails", { headers, cache: "no-store" });
    if (emailsResponse.ok) {
      const emails = await emailsResponse.json() as { email: string; primary: boolean; verified: boolean }[];
      email = emails.find(item => item.primary && item.verified)?.email || emails.find(item => item.verified)?.email || "";
    }
  }
  if (!email) throw new Error("Your GitHub account needs a verified email address.");
  return { email: email.toLowerCase(), name: profile.name || profile.login || email.split("@")[0] };
}
