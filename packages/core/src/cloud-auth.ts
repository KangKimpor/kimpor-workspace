import { parseDesktopCallback } from "./auth";
import { platform } from "./platform";

export interface CloudConfig {
  url: string;
  key: string;
}
export interface CloudSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email?: string };
}
const SESSION_KEY = "velora-cloud-session-v1";
const PKCE_KEY = "velora-pkce-v1";
type Listener = (session: CloudSession | null) => void;
const listeners = new Set<Listener>();
let refreshFlight: Promise<CloudSession | null> | undefined;

export function cloudConfig(): CloudConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const key =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" &&
    !(
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(parsed.hostname)
    )
  )
    throw new Error("Cloud endpoint must use HTTPS");
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  )
    throw new Error("Invalid cloud endpoint");
  return { url, key };
}
function readSession(): CloudSession | null {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(SESSION_KEY) || "null",
    );
    if (!value || typeof value !== "object") return null;
    const session = value as CloudSession;
    if (
      !session.access_token ||
      !session.refresh_token ||
      !session.user?.id ||
      !Number.isFinite(session.expires_at)
    )
      return null;
    return session;
  } catch {
    return null;
  }
}
function saveSession(value: CloudSession | null) {
  if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  else localStorage.removeItem(SESSION_KEY);
  listeners.forEach((listener) => listener(value));
}
function requireConfig() {
  const config = cloudConfig();
  if (!config)
    throw new Error(
      "Cloud sync is not configured. Your local workspace remains available.",
    );
  return config;
}
export async function authRequest(
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const config = requireConfig();
  const response = await fetch(`${config.url}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: config.key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(
      typeof result.msg === "string"
        ? result.msg
        : typeof result.error_description === "string"
          ? result.error_description
          : "Sign-in request failed. Try again shortly.",
    );
  return result;
}
function sessionFrom(value: Record<string, unknown>): CloudSession {
  const session = {
    ...value,
    expires_at:
      typeof value.expires_at === "number"
        ? value.expires_at
        : Math.floor(Date.now() / 1000) + Number(value.expires_in || 3600),
  } as unknown as CloudSession;
  if (!session.access_token || !session.refresh_token || !session.user?.id)
    throw new Error("Invalid sign-in response");
  return session;
}
export async function currentSession(): Promise<CloudSession | null> {
  const session = readSession();
  if (!session || session.expires_at > Date.now() / 1000 + 60) return session;
  if (!refreshFlight)
    refreshFlight = authRequest("token?grant_type=refresh_token", {
      refresh_token: session.refresh_token,
    })
      .then((value) => {
        const next = sessionFrom(value);
        // Signing out or choosing another account while refresh is in flight wins.
        if (readSession()?.refresh_token !== session.refresh_token)
          return readSession();
        saveSession(next);
        return next;
      })
      .catch((error) => {
        if (
          navigator.onLine &&
          readSession()?.refresh_token === session.refresh_token
        )
          saveSession(null);
        throw error;
      })
      .finally(() => {
        refreshFlight = undefined;
      });
  return refreshFlight;
}
export function onSessionChange(listener: Listener): () => void {
  listeners.add(listener);
  listener(readSession());
  const storage = (event: StorageEvent) => {
    if (event.key === SESSION_KEY) listener(readSession());
  };
  window.addEventListener("storage", storage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", storage);
  };
}
export async function sendEmailCode(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    throw new Error("Enter a valid email address");
  await authRequest("otp", { email: email.trim(), create_user: true });
}
export async function verifyEmailCode(email: string, token: string) {
  if (!/^\d{6}$/.test(token))
    throw new Error("Enter the six-digit code from your email");
  const session = sessionFrom(
    await authRequest("verify", { email: email.trim(), token, type: "email" }),
  );
  saveSession(session);
  return session;
}
export async function signOut() {
  const config = cloudConfig();
  const session = readSession();
  // Clear this device immediately. Revocation is best-effort while offline.
  saveSession(null);
  localStorage.removeItem(PKCE_KEY);
  if (config && session)
    await fetch(`${config.url}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${session.access_token}`,
      },
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
}
function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
export async function signInGoogle() {
  const config = requireConfig();
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64Url(crypto.getRandomValues(new Uint8Array(24)));
  const challenge = base64Url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  );
  const redirect = platform.desktop
    ? new URL("veloradesk://auth/callback")
    : new URL(location.pathname, location.origin);
  redirect.searchParams.set("state", state);
  localStorage.setItem(
    PKCE_KEY,
    JSON.stringify({
      verifier,
      state,
      expiresAt: Date.now() + 10 * 60 * 1000,
      redirect: redirect.href,
    }),
  );
  const url = new URL(`${config.url}/auth/v1/authorize`);
  url.search = new URLSearchParams({
    provider: "google",
    redirect_to: redirect.href,
    code_challenge: challenge,
    code_challenge_method: "s256",
  }).toString();
  if (platform.desktop) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url.href);
  } else location.assign(url.href);
}
export async function consumeAuthRedirect(
  raw: string,
): Promise<CloudSession | null> {
  const url = new URL(raw);
  if (!url.searchParams.has("code") && !url.searchParams.has("error"))
    return null;
  const pending = JSON.parse(localStorage.getItem(PKCE_KEY) || "null") as {
    verifier: string;
    state: string;
    expiresAt: number;
    redirect: string;
  } | null;
  if (!pending || !pending.verifier || !pending.state)
    throw new Error(
      "Sign-in request is missing or expired. Start sign-in again.",
    );
  let code: string;
  if (platform.desktop)
    code = parseDesktopCallback(
      raw,
      pending.state,
      pending.expiresAt,
      Date.now(),
    ).code;
  else {
    const expected = new URL(pending.redirect);
    if (
      url.origin !== expected.origin ||
      url.pathname !== expected.pathname ||
      url.hash ||
      url.searchParams.getAll("state").length !== 1 ||
      url.searchParams.get("state") !== pending.state ||
      Date.now() >= pending.expiresAt ||
      url.searchParams.has("error") ||
      url.searchParams.getAll("code").length !== 1
    )
      throw new Error("Invalid or expired sign-in return");
    code = url.searchParams.get("code")!;
  }
  // Consume before exchange so duplicate callbacks cannot replay the verifier.
  localStorage.removeItem(PKCE_KEY);
  const session = sessionFrom(
    await authRequest("token?grant_type=pkce", {
      auth_code: code,
      code_verifier: pending.verifier,
    }),
  );
  saveSession(session);
  if (!platform.desktop) {
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return session;
}
export async function initializeCloudAuth(
  onError: (error: Error) => void,
): Promise<() => void> {
  if (!cloudConfig()) return () => {};
  const consume = (url: string) => {
    void consumeAuthRedirect(url).catch((error) =>
      onError(error instanceof Error ? error : new Error("Sign-in failed")),
    );
  };
  if (!platform.desktop) consume(location.href);
  return platform.onAuthRedirect(consume);
}
