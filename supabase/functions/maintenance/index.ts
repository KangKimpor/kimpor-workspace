import * as Y from "npm:yjs@13.6.33";
import webpush from "npm:web-push@3.6.7";
import {
  database,
  encoded,
  env,
  HttpError,
  json,
  serve,
} from "../_shared/runtime.ts";
import { pollCalendars } from "../_shared/calendar-service.ts";
import {
  expandEvents,
  occurrenceReminderTime,
  type EventRecord,
} from "../../../packages/integrations/src/calendar.ts";
function decode(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
function encode(value: Uint8Array) {
  let result = "";
  for (let i = 0; i < value.length; i += 16384)
    result += String.fromCharCode(...value.subarray(i, i + 16384));
  return btoa(result);
}
function authorize(request: Request) {
  const supplied = request.headers.get("x-maintenance-secret") ?? "",
    expected = env("MAINTENANCE_SECRET");
  let different = supplied.length ^ expected.length;
  for (let i = 0; i < expected.length; i++)
    different |= (supplied.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  if (different) throw new HttpError(401, "Invalid maintenance secret");
}
serve(async (request) => {
  authorize(request);
  if (request.method !== "POST") throw new HttpError(405, "Use POST");
  const records = (await database(
    "page_doc_updates?select=id,user_id,page_id,update_base64,created_at&order=created_at.asc&limit=32",
  )) as {
    id: string;
    user_id: string;
    page_id: string;
    update_base64: string;
    created_at: string;
  }[];
  let compacted = 0;
  const pages = new Set(records.map((row) => `${row.user_id}/${row.page_id}`));
  for (const page of pages) {
    try {
      const updates = records.filter(
        (row) => `${row.user_id}/${row.page_id}` === page,
      );
      const first = updates[0]!;
      const snapshots = (await database(
        `page_doc_snapshots?user_id=eq.${encoded(first.user_id)}&page_id=eq.${encoded(first.page_id)}&select=update_base64,through_cursor`,
      )) as { update_base64: string; through_cursor: number }[];
      const merged = Y.mergeUpdates([
        ...snapshots.map((row) => decode(row.update_base64)),
        ...updates.map((row) => decode(row.update_base64)),
      ]);
      const applied = await database("rpc/compact_page_document", {
        method: "POST",
        body: JSON.stringify({
          owner_id: first.user_id,
          page: first.page_id,
          merged_update: encode(merged),
          through_update_ids: updates.map((row) => row.id),
          expected_snapshot_cursor: snapshots[0]?.through_cursor ?? 0,
        }),
      });
      if (applied === true) compacted++;
    } catch {
      // Leave the original updates intact and continue other owners' maintenance.
    }
  }
  const calendarPoll = await pollCalendars();
  // Reminders use the cloud's current event records; foreground scheduling also works without cloud.
  let sent = 0;
  let pushConfigured = true;
  try {
    webpush.setVapidDetails(
      env("VAPID_SUBJECT"),
      env("VAPID_PUBLIC_KEY"),
      env("VAPID_PRIVATE_KEY"),
    );
  } catch {
    pushConfigured = false;
  }
  if (pushConfigured) {
    const events = (await database(
      "events?select=id,user_id,fields&limit=5000",
    )) as {
      id: string;
      user_id: string;
      fields: Record<string, { value: unknown }>;
    }[];
    const now = Date.now();
    for (const record of events) {
      const values = Object.fromEntries(
        Object.entries(record.fields).map(([key, field]) => [key, field.value]),
      );
      if (
        values.deletedAt ||
        values.reminderMinutes === undefined ||
        Number(values.reminderMinutes) <= 0
      )
        continue;
      const lead =
        Math.min(Number(values.reminderMinutes), 7 * 24 * 60) * 60000;
      let occurrences;
      try {
        occurrences = expandEvents(
          [{ ...values, id: record.id } as unknown as EventRecord],
          new Date(
            now + lead - 15 * 60000 - (values.allDay ? 86_400_000 : 0),
          ).toISOString(),
          new Date(
            now + lead + 1000 + (values.allDay ? 86_400_000 : 0),
          ).toISOString(),
          100,
        );
      } catch {
        continue;
      }
      for (const item of occurrences) {
        const time = occurrenceReminderTime(
          item.start,
          String(values.startZone || "UTC"),
          Number(values.reminderMinutes),
        );
        if (!Number.isFinite(time) || time > now || time < now - 15 * 60000)
          continue;
        const occurrence = item.start;
        const claim = (await database(
          "reminder_deliveries?on_conflict=user_id,event_id,occurrence",
          {
            method: "POST",
            headers: {
              Prefer: "resolution=ignore-duplicates,return=representation",
            },
            body: JSON.stringify({
              user_id: record.user_id,
              event_id: record.id,
              occurrence,
            }),
          },
        )) as unknown[];
        if (!claim.length) continue;
        const subscriptions = (await database(
          `push_subscriptions?user_id=eq.${encoded(record.user_id)}`,
        )) as { id: string; subscription: unknown }[];
        for (const subscription of subscriptions) {
          try {
            await webpush.sendNotification(
              subscription.subscription,
              JSON.stringify({
                title: "Kimpor Workspace reminder",
                body: String(values.title || "An event is coming up."),
                url: "/calendar",
              }),
            );
            sent++;
          } catch (error) {
            const status =
              typeof error === "object" && error && "statusCode" in error
                ? Number(error.statusCode)
                : 0;
            if (status === 404 || status === 410)
              await database(
                `push_subscriptions?id=eq.${encoded(subscription.id)}`,
                { method: "DELETE" },
              );
          }
        }
      }
    }
  }
  // Purge expired handshakes; credentials are never exported by this endpoint.
  await database(
    `calendar_oauth_requests?expires_at=lt.${encoded(new Date().toISOString())}`,
    { method: "DELETE" },
  );
  return json({ ok: true, compacted, sent, pushConfigured, calendarPoll });
});
