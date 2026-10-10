export function corsHeaders(
  origin: string | null,
  allowed: readonly string[],
): Record<string, string> | null {
  if (!origin || !allowed.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}
export function parseDesktopCallback(
  raw: string,
  expectedState: string,
  expiresAt: number,
  now: number,
): { code: string } {
  const url = new URL(raw);
  if (
    url.protocol !== "veloradesk:" ||
    url.hostname !== "auth" ||
    url.pathname !== "/callback" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  )
    throw new Error("Invalid redirect");
  if (
    !expectedState ||
    !Number.isFinite(expiresAt) ||
    !Number.isFinite(now) ||
    now >= expiresAt ||
    url.searchParams.getAll("state").length !== 1 ||
    url.searchParams.get("state") !== expectedState
  )
    throw new Error("Invalid or expired state");
  const code = url.searchParams.get("code");
  if (
    !code ||
    url.searchParams.getAll("code").length !== 1 ||
    url.searchParams.has("error")
  )
    throw new Error("Invalid authorization code");
  return { code };
}
