import {
  assertCapacity,
  database,
  encoded,
  HttpError,
  json,
  owner,
  readBody,
  serve,
} from "../_shared/runtime.ts";
const allowed = (hostname: string) =>
  hostname === "fcm.googleapis.com" ||
  hostname === "updates.push.services.mozilla.com" ||
  hostname === "web.push.apple.com" ||
  hostname.endsWith(".notify.windows.com");
serve(async (request) => {
  if (request.method !== "POST") throw new HttpError(405, "Use POST");
  const userId = await owner(request),
    body = await readBody(request);
  if (body.unsubscribe === true) {
    const endpoint = String(body.endpoint ?? "");
    await database(
      `push_subscriptions?user_id=eq.${encoded(userId)}&endpoint=eq.${encoded(endpoint)}`,
      { method: "DELETE" },
    );
    return json({ ok: true });
  }
  const subscription = body.subscription as
    | { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    | undefined;
  if (!subscription?.endpoint || subscription.endpoint.length > 2048)
    throw new HttpError(400, "Invalid push subscription");
  const url = new URL(subscription.endpoint);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && !["443"].includes(url.port)) ||
    !allowed(url.hostname)
  )
    throw new HttpError(400, "Unsupported push service");
  if (
    !/^[A-Za-z0-9_-]{80,100}$/.test(subscription.keys?.p256dh ?? "") ||
    !/^[A-Za-z0-9_-]{20,30}$/.test(subscription.keys?.auth ?? "")
  )
    throw new HttpError(400, "Invalid push encryption keys");
  const zone = String(body.timeZone || "UTC");
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
  } catch {
    throw new HttpError(400, "Invalid time zone");
  }
  await assertCapacity(4096);
  const existing = (await database(
    `push_subscriptions?endpoint=eq.${encoded(url.href)}&select=user_id`,
  )) as { user_id: string }[];
  if (existing.some((item) => item.user_id !== userId))
    throw new HttpError(
      409,
      "This browser subscription belongs to a different account. Disable it before switching accounts.",
    );
  await database("push_subscriptions?on_conflict=endpoint", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      endpoint: url.href,
      subscription,
      time_zone: zone,
    }),
  });
  return json({ ok: true });
});
