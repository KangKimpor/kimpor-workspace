import { accessToken, type ConnectedAccount, type Tokens } from "./oauth.ts";
import { unseal } from "./credentials.ts";
import { googleAction, outlookAction } from "./calendar-api.ts";
import { caldavAction, type CaldavCredentials } from "./caldav.ts";
import { fetchPublic } from "./network.ts";
import { database, encoded, HttpError, nudge } from "./runtime.ts";
import { importIcs } from "../../../packages/integrations/src/ics.ts";
import { providerIdentity } from "../../../packages/integrations/src/provider-identity.ts";
import type {
  ProviderCalendar,
  ProviderEvent,
} from "../../../packages/integrations/src/calendar.ts";
type Item = Record<string, unknown>;
type Fields = Record<
  string,
  { value: unknown; clock: { wall: number; counter: number; node: string } }
>;
export async function calendarAction(
  account: ConnectedAccount,
  body: Item,
): Promise<Item> {
  if (account.provider === "google")
    return googleAction(await accessToken(account), body);
  if (account.provider === "outlook")
    return outlookAction(await accessToken(account), body);
  if (account.provider === "caldav")
    return caldavAction(
      await unseal<CaldavCredentials>(
        account.encrypted_credentials,
        account.user_id,
      ),
      body,
    );
  if (body.action === "listCalendars")
    return {
      calendars: [
        { id: account.id, title: account.label, color: "blue", readOnly: true },
      ],
    };
  if (body.action !== "listEvents")
    throw new HttpError(403, "Subscriptions are read-only");
  const { url } = await unseal<{ url: string }>(
    account.encrypted_credentials,
    account.user_id,
  );
  const response = await fetchPublic(url);
  if (!response.ok)
    throw new HttpError(
      502,
      "Calendar subscription is temporarily unavailable",
    );
  return { events: importIcs(await response.text(), "UTC"), fullResync: true };
}
export async function revokeCalendarAccount(
  account: ConnectedAccount,
): Promise<boolean> {
  if (account.provider !== "google") return false;
  try {
    const token = await unseal<Tokens>(
      account.encrypted_credentials,
      account.user_id,
    );
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: token.refresh_token || token.access_token,
      }),
      signal: AbortSignal.timeout(15000),
    });
    return response.ok || response.status === 400;
  } catch {
    return false;
  }
}
function values(fields: Fields): Item {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, field.value]),
  );
}
/** Polls each account independently; only real remote changes append owner-scoped sync records. */
export async function pollCalendars(): Promise<{
  processed: number;
  failed: number;
}> {
  const accounts = (await database(
    "connected_accounts?order=last_sync_at.asc.nullsfirst&limit=4",
  )) as ConnectedAccount[];
  let processed = 0,
    failed = 0;
  for (const account of accounts) {
    try {
      const raw = (await database(
        `calendars?user_id=eq.${encoded(account.user_id)}&select=id,fields`,
      )) as { id: string; fields: Fields }[];
      const existingEvents = (await database(
        `events?user_id=eq.${encoded(account.user_id)}&select=id,fields&limit=5000`,
      )) as { id: string; fields: Fields }[];
      const remoteCalendars = (
        await calendarAction(account, { action: "listCalendars" })
      ).calendars as ProviderCalendar[];
      const state = account.sync_state ?? {},
        cursors = (state.cursors ?? {}) as Record<string, string>;
      const range = state.range as { start: string; end: string } | undefined;
      const activeRange =
        range && Date.parse(range.end) > Date.now() + 90 * 86400000
          ? range
          : {
              start: new Date(Date.now() - 180 * 86400000).toISOString(),
              end: new Date(Date.now() + 180 * 86400000).toISOString(),
            };
      if (activeRange !== range)
        for (const key of Object.keys(cursors)) delete cursors[key];
      const changes: Item[] = [];
      const changed = (
        table: "calendars" | "events",
        id: string,
        previous: Fields | undefined,
        next: Item,
      ) => {
        if (
          previous &&
          Object.entries(next)
            .filter(([key]) => key !== "updatedAt")
            .every(
              ([key, value]) =>
                JSON.stringify(previous[key]?.value) === JSON.stringify(value),
            )
        )
          return;
        const clock = {
          wall: Math.max(
            Date.now(),
            ...Object.values(previous ?? {}).map(
              (field) => field.clock?.wall ?? 0,
            ),
          ),
          counter:
            Math.max(
              0,
              ...Object.values(previous ?? {}).map(
                (field) => field.clock?.counter ?? 0,
              ),
            ) + 1,
          node: `server:${account.id}`,
        };
        const fields = Object.fromEntries(
          Object.entries(next)
            .filter(([, value]) => value !== undefined)
            .filter(
              ([key, value]) =>
                JSON.stringify(previous?.[key]?.value) !==
                JSON.stringify(value),
            )
            .map(([key, value]) => [key, { value, clock }]),
        );
        if (Object.keys(fields).length)
          changes.push({
            id: crypto.randomUUID(),
            userId: account.user_id,
            entityId: id,
            table,
            fields,
            kind: "entity",
            schemaVersion: 1,
          });
      };
      for (const remote of remoteCalendars.slice(0, 8)) {
        const remoteId = `${account.id}::${remote.id}`,
          old = raw.find((row) => row.fields.remoteId?.value === remoteId),
          id =
            old?.id ??
            (await providerIdentity("calendar", account.id, remote.id)),
          date = new Date().toISOString();
        changed(
          "calendars",
          id,
          old?.fields,
          old
            ? { title: remote.title }
            : {
                id,
                userId: account.user_id,
                title: remote.title,
                color: "blue",
                visible: true,
                source: account.provider,
                remoteId,
                createdAt: date,
                updatedAt: date,
                deletedAt: null,
              },
        );
        const result = await calendarAction(account, {
          action: "listEvents",
          calendarId: remote.id,
          range: activeRange,
          syncToken: cursors[remote.id],
        });
        const events = (result.events ?? []) as ProviderEvent[];
        for (const event of events) {
          const previous = existingEvents.find(
            (row) =>
              row.fields.calendarId?.value === id &&
              row.fields.remoteId?.value === event.id,
          );
          if (event.deleted) {
            if (previous)
              changed("events", previous.id, previous.fields, {
                deletedAt: date,
                updatedAt: date,
              });
            continue;
          }
          if (
            previous &&
            event.etag &&
            previous.fields.etag?.value === event.etag
          )
            continue;
          const eventId =
              previous?.id ?? (await providerIdentity("event", id, event.id)),
            before = previous ? values(previous.fields) : {};
          changed("events", eventId, previous?.fields, {
            ...before,
            id: eventId,
            userId: account.user_id,
            calendarId: id,
            title: event.title,
            start: event.startsAt,
            end: event.endsAt,
            allDay: !!event.allDay,
            startZone: event.timeZone || "UTC",
            endZone: event.endTimeZone || event.timeZone || "UTC",
            location: event.location || "",
            notes: event.notes || "",
            url: event.url || "",
            busy: event.busy !== false,
            reminderMinutes: event.reminderMinutes ?? 0,
            recurrence: event.recurrence || "",
            exceptions: event.exceptions ?? [],
            pageId: before.pageId ?? null,
            remoteId: event.id,
            etag: event.etag,
            source: account.provider,
            createdAt: before.createdAt ?? date,
            updatedAt: date,
            deletedAt: null,
          });
        }
        if (account.provider === "ics" && result.fullResync) {
          const remoteIds = new Set(events.map((event) => event.id));
          for (const oldEvent of existingEvents.filter(
            (row) =>
              row.fields.calendarId?.value === id &&
              !row.fields.deletedAt?.value &&
              !remoteIds.has(String(row.fields.remoteId?.value)),
          ))
            changed("events", oldEvent.id, oldEvent.fields, {
              deletedAt: date,
              updatedAt: date,
            });
        }
        if (typeof result.syncToken === "string")
          cursors[remote.id] = result.syncToken;
      }
      for (let offset = 0; offset < changes.length; offset += 100)
        await database("rpc/apply_calendar_changes", {
          method: "POST",
          body: JSON.stringify({
            owner_id: account.user_id,
            changes: changes.slice(offset, offset + 100),
          }),
        });
      await database(
        `connected_accounts?id=eq.${encoded(account.id)}&user_id=eq.${encoded(account.user_id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            sync_state: { ...state, cursors, range: activeRange },
            last_sync_at: new Date().toISOString(),
            status: "connected",
          }),
        },
      );
      if (changes.length) await nudge(account.user_id);
      processed++;
    } catch {
      failed++;
      await database(
        `connected_accounts?id=eq.${encoded(account.id)}&user_id=eq.${encoded(account.user_id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            last_sync_at: new Date().toISOString(),
            status: "needs_attention",
          }),
        },
      ).catch(() => {});
    }
  }
  return { processed, failed };
}
