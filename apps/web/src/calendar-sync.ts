import { store } from "@veloradesk/core/store";
import type { Calendar, CalendarEvent } from "@veloradesk/core/model";
import { cloudConfig, currentSession } from "@veloradesk/core/cloud-auth";
import {
  providerIdentity,
  authenticatedCalendarTransport,
  BackendCalendarProvider,
  CalendarProviderError,
  type CalendarAccount,
  type CalendarTransport,
  type ProviderEvent,
} from "@veloradesk/integrations";

interface ProviderOperation {
  id: string;
  kind: "save" | "delete";
  eventId: string;
  calendarId: string;
  remoteId?: string;
  value?: ProviderEvent;
  base?: ProviderEvent;
}
const QUEUE = "provider:calendar-outbox";
let flushing: Promise<void> | undefined;
export function providerEvent(event: CalendarEvent): ProviderEvent {
  return {
    id: event.remoteId ?? event.id,
    title: event.title,
    startsAt: event.start,
    endsAt: event.end,
    timeZone: event.startZone,
    endTimeZone: event.endZone,
    allDay: event.allDay,
    location: event.location,
    notes: event.notes,
    url: event.url,
    busy: event.busy,
    reminderMinutes: event.reminderMinutes,
    recurrence: event.recurrence,
    exceptions: event.exceptions,
    etag: event.etag,
  };
}
export function eventFields(event: ProviderEvent): Partial<CalendarEvent> {
  return {
    title: event.title,
    start: event.startsAt,
    end: event.endsAt,
    startZone: event.timeZone || "UTC",
    endZone: event.endTimeZone || event.timeZone || "UTC",
    allDay: Boolean(event.allDay),
    location: event.location ?? "",
    notes: event.notes ?? "",
    url: event.url ?? "",
    busy: event.busy !== false,
    reminderMinutes: event.reminderMinutes ?? 0,
    recurrence: event.recurrence ?? "",
    exceptions: event.exceptions ?? [],
    remoteId: event.id,
    etag: event.etag,
  };
}
export function calendarTransport(): CalendarTransport {
  const config = cloudConfig();
  if (!config)
    return async () => {
      throw new Error(
        "Connected calendars need cloud setup. Local calendars work offline.",
      );
    };
  return authenticatedCalendarTransport(
    `${config.url}/functions/v1/calendar-proxy`,
    async () => (await currentSession())?.access_token ?? null,
    (input, init) =>
      fetch(input, {
        ...init,
        headers: { ...init?.headers, apikey: config.key },
        signal: AbortSignal.timeout(30_000),
      }),
  );
}
function remoteCalendar(calendar: Calendar): {
  accountId: string;
  calendarId: string;
} {
  const [accountId, ...parts] = (calendar.remoteId ?? "").split("::");
  if (!accountId || !parts.length)
    throw new Error("Reconnect this calendar account.");
  return { accountId, calendarId: parts.join("::") };
}
function providerFor(calendar: Calendar, transport = calendarTransport()) {
  if (calendar.source === "local") throw new Error("This calendar is local.");
  const remote = remoteCalendar(calendar);
  return {
    ...remote,
    provider: new BackendCalendarProvider(
      calendar.source,
      remote.accountId,
      transport,
    ),
  };
}
export async function queueCalendarChange(
  event: CalendarEvent,
  previous?: CalendarEvent,
  deleted = false,
): Promise<void> {
  if (event.source === "local") return;
  if (event.source === "ics")
    throw new Error("Subscribed calendars are read-only.");
  const operation: ProviderOperation = {
    id: crypto.randomUUID(),
    kind: deleted ? "delete" : "save",
    eventId: event.id,
    calendarId: event.calendarId,
    remoteId: event.remoteId,
    value: deleted ? undefined : providerEvent(event),
    base: previous ? providerEvent(previous) : undefined,
  };
  await store.updateSetting<ProviderOperation[]>(QUEUE, [], (queue) => [
    ...queue,
    operation,
  ]);
}
export async function pendingCalendarChanges(): Promise<number> {
  return (await store.getSetting<ProviderOperation[]>(QUEUE, [])).length;
}
async function drainQueue(notify: (message: string) => void) {
  const transport = calendarTransport();
  const initialIds = (
    await store.getSetting<ProviderOperation[]>(QUEUE, [])
  ).map((item) => item.id);
  for (const operationId of initialIds) {
    const operation = (
      await store.getSetting<ProviderOperation[]>(QUEUE, [])
    ).find((item) => item.id === operationId);
    if (!operation) continue;
    const calendar = store
      .listCalendars()
      .find((item) => item.id === operation.calendarId);
    if (!calendar || calendar.source === "local" || calendar.source === "ics")
      continue;
    const { provider, calendarId, accountId } = providerFor(
      calendar,
      transport,
    );
    try {
      if (operation.kind === "delete") {
        if (operation.remoteId)
          await provider.deleteEvent(calendarId, operation.remoteId);
      } else if (operation.value) {
        let saved: ProviderEvent;
        try {
          saved = operation.remoteId
            ? await provider.updateEvent(
                calendarId,
                { ...operation.value, id: operation.remoteId },
                operation.value.etag ?? "",
              )
            : ((
                await transport({
                  provider: calendar.source,
                  accountId,
                  action: "createEvent",
                  calendarId,
                  event: operation.value,
                  operationId: operation.id,
                })
              ).event as ProviderEvent);
        } catch (error) {
          if (
            !(error instanceof CalendarProviderError) ||
            error.status !== 412 ||
            !operation.remoteId
          )
            throw error;
          const local = operation.value;
          const remote = (
            await provider.listEvents(
              {
                from: new Date(
                  Date.parse(local.startsAt) - 86_400_000,
                ).toISOString(),
                to: new Date(
                  Date.parse(local.endsAt) + 86_400_000,
                ).toISOString(),
              },
              undefined,
              calendarId,
            )
          ).events.find((event) => event.id === operation.remoteId);
          if (!remote)
            throw new Error(
              "This event changed remotely. Refresh the account to resolve it.",
            );
          const merged = { ...remote };
          let conflicts = 0;
          for (const key of [
            "title",
            "startsAt",
            "endsAt",
            "timeZone",
            "endTimeZone",
            "allDay",
            "location",
            "notes",
            "url",
            "busy",
            "reminderMinutes",
            "recurrence",
            "exceptions",
          ] as const) {
            const desired = local[key];
            const base = operation.base?.[key];
            if (JSON.stringify(desired) !== JSON.stringify(base)) {
              if (JSON.stringify(remote[key]) === JSON.stringify(base))
                Object.assign(merged, { [key]: desired });
              else if (JSON.stringify(remote[key]) !== JSON.stringify(desired))
                conflicts++;
            }
          }
          saved = await provider.updateEvent(
            calendarId,
            merged,
            remote.etag ?? "",
          );
          if (conflicts)
            notify(
              `The remote copy won ${conflicts} conflicting event field${conflicts === 1 ? "" : "s"}. Other changes were kept.`,
            );
        }
        const current = store
          .listEvents()
          .find((event) => event.id === operation.eventId);
        const comparable = (value: ProviderEvent) =>
          JSON.stringify({ ...value, id: "", etag: undefined });
        if (current)
          await store.saveEvent({
            id: current.id,
            remoteId: saved.id,
            etag: saved.etag,
            ...(comparable(providerEvent(current)) ===
            comparable(operation.value)
              ? eventFields(saved)
              : {}),
          });
        await store.updateSetting<ProviderOperation[]>(QUEUE, [], (queue) =>
          queue.map((item) =>
            item.eventId === operation.eventId && item.id !== operation.id
              ? {
                  ...item,
                  remoteId: saved.id,
                  value: item.value
                    ? { ...item.value, id: saved.id, etag: saved.etag }
                    : undefined,
                }
              : item,
          ),
        );
      }
      await store.updateSetting<ProviderOperation[]>(QUEUE, [], (queue) =>
        queue.filter((item) => item.id !== operation.id),
      );
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Calendar sync needs attention.",
      );
    }
  }
}
export async function flushCalendarChanges(
  notify: (message: string) => void,
): Promise<void> {
  if (!navigator.onLine || !cloudConfig() || !(await currentSession())) return;
  if (!flushing) {
    flushing = (
      "locks" in navigator
        ? navigator.locks.request("veloradesk-provider-outbox", () =>
            drainQueue(notify),
          )
        : drainQueue(notify)
    ).finally(() => {
      flushing = undefined;
    });
  }
  await flushing;
}
export async function syncCalendarAccounts(
  notify: (message: string) => void,
): Promise<CalendarAccount[]> {
  if (!cloudConfig() || !(await currentSession())) return [];
  const transport = calendarTransport();
  const accounts = (await transport({ action: "accounts" }))
    .accounts as CalendarAccount[];
  await flushCalendarChanges(notify);
  const pendingIds = new Set(
    (await store.getSetting<ProviderOperation[]>(QUEUE, [])).map(
      (operation) => operation.eventId,
    ),
  );
  await Promise.all(
    accounts.map(async (account) => {
      try {
        const provider = new BackendCalendarProvider(
          account.provider,
          account.id,
          transport,
        );
        for (const remote of await provider.listCalendars()) {
          const remoteId = `${account.id}::${remote.id}`;
          const old = store
            .listCalendars()
            .find((calendar) => calendar.remoteId === remoteId);
          const calendar = await store.saveCalendar({
            ...(old ?? {}),
            id:
              old?.id ??
              (await providerIdentity("calendar", account.id, remote.id)),
            title: remote.title,
            source: account.provider,
            remoteId,
            color: old?.color ?? "blue",
          });
          const range = {
            from: new Date(Date.now() - 180 * 86_400_000).toISOString(),
            to: new Date(Date.now() + 180 * 86_400_000).toISOString(),
          };
          const syncToken = await store.getSetting<string | undefined>(
            `provider:sync-token:${calendar.id}`,
            undefined,
          );
          const result = await provider.listEvents(range, syncToken, remote.id);
          for (const event of result.events) {
            const existing = store
              .listEvents()
              .find(
                (item) =>
                  item.calendarId === calendar.id && item.remoteId === event.id,
              );
            if (existing && pendingIds.has(existing.id)) continue;
            if (event.deleted) {
              if (existing) await store.deleteEvent(existing.id);
              continue;
            }
            await store.saveEvent({
              ...(existing ?? {}),
              id:
                existing?.id ??
                (await providerIdentity("event", calendar.id, event.id)),
              ...eventFields(event),
              calendarId: calendar.id,
              source: account.provider,
            });
          }
          if (result.syncToken)
            await store.setSetting(
              `provider:sync-token:${calendar.id}`,
              result.syncToken,
            );
        }
      } catch (error) {
        account.status = "needs_attention";
        notify(
          `${account.label}: ${error instanceof Error ? error.message : "Sync needs attention."}`,
        );
      }
    }),
  );
  return accounts;
}
export async function disconnectCalendarAccount(account: CalendarAccount) {
  await calendarTransport()({
    action: "disconnect",
    provider: account.provider,
    accountId: account.id,
  });
  const calendars = store
    .listCalendars()
    .filter((calendar) => calendar.remoteId?.startsWith(`${account.id}::`));
  const ids = new Set(calendars.map((calendar) => calendar.id));
  for (const event of store
    .listEvents()
    .filter((event) => ids.has(event.calendarId)))
    await store.deleteEvent(event.id);
  for (const calendar of calendars)
    await store.saveCalendar({
      id: calendar.id,
      deletedAt: new Date().toISOString(),
    });
  await store.updateSetting<ProviderOperation[]>(QUEUE, [], (queue) =>
    queue.filter((operation) => !ids.has(operation.calendarId)),
  );
}
