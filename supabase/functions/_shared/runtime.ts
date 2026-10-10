declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
export const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
};
export function serve(handler: (request: Request) => Promise<Response>) {
  Deno.serve(async (request) => {
    const origin = request.headers.get("origin");
    const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const cors: Record<string, string> =
      origin && allowed.includes(origin)
        ? {
            "Access-Control-Allow-Origin": origin,
            Vary: "Origin",
            "Access-Control-Allow-Headers":
              "authorization, apikey, content-type, x-client-info",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          }
        : {};
    if (origin && !allowed.includes(origin))
      return json({ error: "Origin is not allowed" }, 403);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    try {
      const response = await handler(request);
      Object.entries(cors).forEach(([key, value]) =>
        response.headers.set(key, value),
      );
      return response;
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      return json(
        {
          error:
            error instanceof HttpError
              ? error.message
              : "Service configuration or provider request failed",
        },
        status,
        cors,
      );
    }
  });
}
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function json(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}
export async function readBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 2_097_152) throw new HttpError(413, "Request is too large");
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new HttpError(400, "Invalid request body");
  }
}
export async function owner(request: Request): Promise<string> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    throw new HttpError(401, "Sign in first");
  const response = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: env("SUPABASE_ANON_KEY") },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new HttpError(401, "Session expired. Sign in again.");
  const value = await response.json();
  if (!value.id) throw new HttpError(401, "Invalid session");
  return value.id;
}
export async function database(
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
      Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...options.headers,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new HttpError(503, "Cloud database is waking up or unavailable");
  return response.status === 204 ? null : await response.json();
}
export const encoded = (value: string) => encodeURIComponent(value);
export async function assertCapacity(bytes = 0) {
  // Service-role calls cannot use owner-bound usage RPC; global measurement is exposed only to the service role.
  const value = (await database("rpc/server_storage_usage", {
    method: "POST",
    body: "{}",
  })) as { databaseBytes: number; storageBytes: number };
  if (
    !Number.isFinite(value.databaseBytes) ||
    !Number.isFinite(value.storageBytes) ||
    value.databaseBytes + bytes * 3 >= 500000000 ||
    value.storageBytes + bytes >= 1000000000
  )
    throw new HttpError(
      507,
      "Cloud storage is full or capacity cannot be verified. Your local edits are safe.",
    );
}
export async function nudge(userId: string, cursor?: string) {
  await fetch(`${env("SUPABASE_URL")}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
      Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          topic: `workspace:${userId}`,
          event: "change",
          payload: { cursor: cursor || "refresh" },
          private: true,
        },
      ],
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}
