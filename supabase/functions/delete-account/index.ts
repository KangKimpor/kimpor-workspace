import {
  database,
  encoded,
  env,
  HttpError,
  json,
  owner,
  serve,
} from "../_shared/runtime.ts";
serve(async (request) => {
  if (request.method !== "POST") throw new HttpError(405, "Use POST");
  const userId = await owner(request);
  const files = (await database(
    `attachments?user_id=eq.${encoded(userId)}&select=path`,
  )) as { path: string }[];
  for (let index = 0; index < files.length; index += 100) {
    const result = await fetch(
      `${env("SUPABASE_URL")}/storage/v1/object/attachments`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
          apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prefixes: files.slice(index, index + 100).map((file) => file.path),
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!result.ok)
      throw new HttpError(
        503,
        "Could not remove cloud files. Try again before deleting records.",
      );
  }
  // Owner-bound RPC runs with the original bearer, not the service-role identity.
  const result = await fetch(
    `${env("SUPABASE_URL")}/rest/v1/rpc/delete_my_cloud_data`,
    {
      method: "POST",
      headers: {
        Authorization: request.headers.get("authorization")!,
        apikey: env("SUPABASE_ANON_KEY"),
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!result.ok) throw new HttpError(503, "Could not remove cloud records");
  return json({ ok: true });
});
