import { database, encoded, env, HttpError } from "./runtime.ts";
import { seal, unseal } from "./credentials.ts";
export type Provider = "google" | "outlook";
export interface Tokens {
  access_token: string;
  refresh_token?: string;
  expiresAt: number;
  email?: string;
}
export interface ConnectedAccount {
  id: string;
  user_id: string;
  provider: Provider | "caldav" | "ics";
  label: string;
  encrypted_credentials: string;
  status: string;
  sync_state: Record<string, unknown>;
}
const encode64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const decode64 = (raw: string) =>
  Uint8Array.from(
    atob(
      raw
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(raw.length / 4) * 4, "="),
    ),
    (c) => c.charCodeAt(0),
  );
async function signingKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env("OAUTH_STATE_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
function callbackUrl() {
  return `${env("SUPABASE_URL")}/functions/v1/calendar-callback`;
}
export async function beginCalendarOAuth(
  userId: string,
  provider: Provider,
): Promise<string> {
  const verifier = encode64(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = encode64(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  );
  const id = crypto.randomUUID();
  const expiresAt = Date.now() + 10 * 60000;
  const payload = encode64(
    new TextEncoder().encode(JSON.stringify({ id, provider, expiresAt })),
  );
  const signature = encode64(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        await signingKey(),
        new TextEncoder().encode(payload),
      ),
    ),
  );
  await database("calendar_oauth_requests", {
    method: "POST",
    body: JSON.stringify({
      id,
      user_id: userId,
      provider,
      encrypted_verifier: await seal({ verifier }, userId),
      expires_at: new Date(expiresAt).toISOString(),
    }),
  });
  const url = new URL(
    provider === "google"
      ? "https://accounts.google.com/o/oauth2/v2/auth"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  );
  url.search = new URLSearchParams({
    client_id: env(
      provider === "google" ? "GOOGLE_CLIENT_ID" : "OUTLOOK_CLIENT_ID",
    ),
    redirect_uri: callbackUrl(),
    response_type: "code",
    scope:
      provider === "google"
        ? "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly"
        : "openid email profile offline_access https://graph.microsoft.com/Calendars.ReadWrite",
    state: `${payload}.${signature}`,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(provider === "google"
      ? { access_type: "offline", prompt: "consent select_account" }
      : { prompt: "select_account" }),
  }).toString();
  return url.href;
}
export async function finishCalendarOAuth(
  state: string,
  code: string,
): Promise<string> {
  const parts = state.split(".");
  if (parts.length !== 2)
    throw new HttpError(400, "Invalid connection request");
  if (
    !(await crypto.subtle.verify(
      "HMAC",
      await signingKey(),
      decode64(parts[1]!),
      new TextEncoder().encode(parts[0]!),
    ))
  )
    throw new HttpError(400, "Invalid connection request");
  const claims = JSON.parse(new TextDecoder().decode(decode64(parts[0]!))) as {
    id: string;
    provider: Provider;
    expiresAt: number;
  };
  if (
    !claims.id ||
    !["google", "outlook"].includes(claims.provider) ||
    !Number.isFinite(claims.expiresAt) ||
    Date.now() >= claims.expiresAt
  )
    throw new HttpError(
      400,
      "Connection request expired. Start again in Kimpor Workspace.",
    );
  const requests = (await database(
    `calendar_oauth_requests?id=eq.${encoded(claims.id)}&provider=eq.${claims.provider}&consumed_at=is.null&expires_at=gt.${encoded(new Date().toISOString())}`,
    {
      method: "PATCH",
      body: JSON.stringify({ consumed_at: new Date().toISOString() }),
    },
  )) as { user_id: string; encrypted_verifier: string }[];
  const request = requests[0];
  if (!request)
    throw new HttpError(400, "Connection request has already been used");
  const { verifier } = await unseal<{ verifier: string }>(
    request.encrypted_verifier,
    request.user_id,
  );
  const tokens = await exchange(claims.provider, {
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: callbackUrl(),
  });
  const userEndpoint =
    claims.provider === "google"
      ? "https://www.googleapis.com/oauth2/v3/userinfo"
      : "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName";
  const profileResponse = await fetch(userEndpoint, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(15000),
  });
  const profile = profileResponse.ok ? await profileResponse.json() : {};
  const label =
    profile.email ||
    profile.mail ||
    profile.userPrincipalName ||
    `${claims.provider} calendar`;
  await database("connected_accounts", {
    method: "POST",
    body: JSON.stringify({
      user_id: request.user_id,
      provider: claims.provider,
      label,
      encrypted_credentials: await seal(
        { ...tokens, email: label },
        request.user_id,
      ),
    }),
  });
  return request.user_id;
}
async function exchange(
  provider: Provider,
  params: Record<string, string>,
): Promise<Tokens> {
  const response = await fetch(
    provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        ...params,
        client_id: env(
          provider === "google" ? "GOOGLE_CLIENT_ID" : "OUTLOOK_CLIENT_ID",
        ),
        client_secret: env(
          provider === "google"
            ? "GOOGLE_CLIENT_SECRET"
            : "OUTLOOK_CLIENT_SECRET",
        ),
      }),
      signal: AbortSignal.timeout(20000),
    },
  );
  const value = await response.json();
  if (!response.ok || !value.access_token)
    throw new HttpError(
      401,
      "Calendar authorization expired or was declined. Reconnect this account.",
    );
  return {
    ...value,
    expiresAt: Date.now() + Number(value.expires_in || 3600) * 1000,
  };
}
export async function accessToken(account: ConnectedAccount): Promise<string> {
  const tokens = await unseal<Tokens>(
    account.encrypted_credentials,
    account.user_id,
  );
  if (tokens.expiresAt > Date.now() + 60000) return tokens.access_token;
  if (!tokens.refresh_token)
    throw new HttpError(401, "Reconnect this calendar account");
  try {
    const refreshed = await exchange(account.provider as Provider, {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    });
    const next = {
      ...tokens,
      ...refreshed,
      refresh_token: refreshed.refresh_token || tokens.refresh_token,
    };
    await database(
      `connected_accounts?id=eq.${encoded(account.id)}&user_id=eq.${encoded(account.user_id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          encrypted_credentials: await seal(next, account.user_id),
          status: "connected",
        }),
      },
    );
    return next.access_token;
  } catch (error) {
    await database(
      `connected_accounts?id=eq.${encoded(account.id)}&user_id=eq.${encoded(account.user_id)}`,
      { method: "PATCH", body: '{"status":"needs_attention"}' },
    );
    throw error;
  }
}
