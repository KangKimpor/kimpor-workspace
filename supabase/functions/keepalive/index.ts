import { database, env, HttpError, json, serve } from "../_shared/runtime.ts";
serve(async (request) => {
  if (request.method !== "POST") throw new HttpError(405, "Use POST");
  const expected = env("MAINTENANCE_SECRET"),
    supplied = request.headers.get("x-maintenance-secret") ?? "";
  let different = supplied.length ^ expected.length;
  for (let i = 0; i < expected.length; i++)
    different |= (supplied.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  if (different) throw new HttpError(401, "Invalid maintenance secret");
  await database("rpc/health_check", { method: "POST", body: "{}" });
  return json({ ok: true });
});
