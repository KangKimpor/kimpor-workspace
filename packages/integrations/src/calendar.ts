import * as recurrence from "rrule";
import type { RRule as RecurrenceRule } from "rrule";
import { parse } from "chrono-node";
// The browser resolves rrule's ESM entry; Deno resolves its CommonJS entry.
// Its UMD wrapper exposes the latter through default instead of named exports.
const { RRule } = ("default" in recurrence
  ? recurrence.default
  : recurrence) as typeof recurrence;
import {
  addDays,
  pseudoUtc,
  wallTime,
  wallTimeToUtc,
} from "./calendar-time.ts";
export {
  addDays,
  dateInZone,
  validTimeZone,
  wallTime,
  wallTimeToUtc,
  occurrenceReminderTime,
} from "./calendar-time.ts";
export { exportIcs, importIcs } from "./ics.ts";

export type CalendarSource = "local" | "google" | "outlook" | "caldav" | "ics";
export interface ProviderEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  endTimeZone?: string;
  allDay?: boolean;
  location?: string;
  notes?: string;
  url?: string;
  busy?: boolean;
  reminderMinutes?: number;
  recurrence?: string;
  exceptions?: string[];
  calendarId?: string;
  etag?: string;
  deleted?: boolean;
  recurrenceId?: string;
}
export interface ProviderCalendar {
  id: string;
  title: string;
  color?: string;
  readOnly?: boolean;
}
export interface CalendarAccount {
  id: string;
  provider: Exclude<CalendarSource, "local">;
  label: string;
  status: "connected" | "needs_attention";
  lastSyncAt?: string;
}
export interface CalendarProvider {
  listCalendars(): Promise<ProviderCalendar[]>;
  listEvents(
    range: { from: string; to: string },
    syncToken?: string,
    calendarId?: string,
  ): Promise<{
    events: ProviderEvent[];
    syncToken?: string;
    fullResync?: boolean;
  }>;
  createEvent(
    calendarId: string,
    event: Omit<ProviderEvent, "id">,
  ): Promise<ProviderEvent>;
  updateEvent(
    calendarId: string,
    event: ProviderEvent,
    etag: string,
  ): Promise<ProviderEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}
export interface EventRecord {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  startZone: string;
  endZone: string;
  recurrence: string;
  exceptions: string[];
}
export interface EventOccurrence<T extends EventRecord = EventRecord> {
  event: T;
  start: string;
  end: string;
  recurrenceId: string;
  key: string;
}
const DAY = 86_400_000;
export function snapMinutes(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}
export function validateRecurrence(rule: string): string {
  if (!rule.trim()) return "";
  const normalized = rule
    .trim()
    .replace(/^RRULE:/i, "")
    .toUpperCase();
  if (normalized.length > 2_000 || /[\r\n]/.test(normalized))
    throw new Error("Enter one RRULE value.");
  const parsed = RRule.fromString(normalized);
  if (
    parsed.origOptions.count !== undefined &&
    (parsed.origOptions.count === null ||
      parsed.origOptions.count <= 0 ||
      parsed.origOptions.count > 100_000)
  )
    throw new Error("Recurrence count must be between 1 and 100,000.");
  if ((parsed.origOptions.interval ?? 1) < 1)
    throw new Error("Recurrence interval must be positive.");
  return normalized;
}
function eventRule(event: EventRecord): RecurrenceRule {
  const options = RRule.parseString(validateRecurrence(event.recurrence));
  const dtstart = new Date(
    pseudoUtc(
      event.allDay
        ? `${event.start}T00:00:00`
        : wallTime(event.start, event.startZone),
    ),
  );
  if (options.until && !event.allDay)
    options.until = new Date(
      pseudoUtc(wallTime(options.until, event.startZone)),
    );
  return new RRule({ ...options, dtstart, tzid: undefined });
}
export function expandEvents<T extends EventRecord>(
  events: T[],
  from: string,
  to: string,
  limit = 10_000,
): EventOccurrence<T>[] {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs)
    throw new Error("Invalid calendar range.");
  const occurrences: EventOccurrence<T>[] = [];
  for (const event of events) {
    const duration = Date.parse(event.end) - Date.parse(event.start);
    if (!Number.isFinite(duration) || duration <= 0) continue;
    const starts = event.recurrence
      ? eventRule(event)
          .between(
            new Date(fromMs - duration - 2 * DAY),
            new Date(toMs + 2 * DAY),
            true,
            (_date, index) => index < limit,
          )
          .map((date) =>
            event.allDay
              ? date.toISOString().slice(0, 10)
              : wallTimeToUtc(date.toISOString().slice(0, 19), event.startZone),
          )
      : [event.start];
    for (const start of starts) {
      if (
        event.exceptions.includes(start) ||
        event.exceptions.includes(
          event.allDay ? start.slice(0, 10) : wallTime(start, event.startZone),
        )
      )
        continue;
      const end = event.allDay
        ? addDays(start, duration / DAY)
        : new Date(Date.parse(start) + duration).toISOString();
      if (Date.parse(end) <= fromMs || Date.parse(start) >= toMs) continue;
      occurrences.push({
        event,
        start,
        end,
        recurrenceId: start,
        key: `${event.id}:${start}`,
      });
      if (occurrences.length >= limit)
        return occurrences.sort((a, b) => a.start.localeCompare(b.start));
    }
  }
  return occurrences.sort((a, b) => a.start.localeCompare(b.start));
}
export function splitRecurrence(
  event: EventRecord,
  occurrence: string,
): { before: string | null; following: string } {
  const rule = eventRule(event);
  const wall = new Date(
    pseudoUtc(
      event.allDay ? occurrence : wallTime(occurrence, event.startZone),
    ),
  );
  const beforeCount = rule.between(
    rule.options.dtstart,
    wall,
    true,
    (date, index) => date < wall && index < 100_000,
  ).length;
  if (!beforeCount) return { before: null, following: event.recurrence };
  const fields = validateRecurrence(event.recurrence)
    .split(";")
    .filter((field) => !/^(COUNT|UNTIL)=/.test(field));
  const count = rule.origOptions.count;
  const following = [
    ...fields,
    ...(count
      ? [`COUNT=${Math.max(1, count - beforeCount)}`]
      : rule.origOptions.until
        ? [`UNTIL=${event.recurrence.match(/UNTIL=([^;]+)/)?.[1]}`]
        : []),
  ].join(";");
  return { before: [...fields, `COUNT=${beforeCount}`].join(";"), following };
}
export function naturalLanguageEvent(
  text: string,
  reference = new Date(),
  zone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): { title: string; start: string; end: string; allDay: boolean } | null {
  const result = parse(text, reference, { forwardDate: true })[0];
  if (!result) return null;
  const toWall = (component: typeof result.start) =>
    `${String(component.get("year")).padStart(4, "0")}-${String(component.get("month")).padStart(2, "0")}-${String(component.get("day")).padStart(2, "0")}T${String(component.get("hour") ?? 9).padStart(2, "0")}:${String(component.get("minute") ?? 0).padStart(2, "0")}:00`;
  const allDay = !result.start.isCertain("hour");
  const start = allDay
    ? toWall(result.start).slice(0, 10)
    : wallTimeToUtc(toWall(result.start), zone);
  const end = result.end
    ? allDay
      ? addDays(toWall(result.end).slice(0, 10), 1)
      : wallTimeToUtc(toWall(result.end), zone)
    : allDay
      ? addDays(start, 1)
      : new Date(Date.parse(start) + 3_600_000).toISOString();
  return {
    title:
      `${text.slice(0, result.index)} ${text.slice(result.index + result.text.length)}`
        .trim()
        .replace(/\s+/g, " ") || "New event",
    start,
    end,
    allDay,
  };
}

export class CalendarProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "CalendarProviderError";
  }
}
export type CalendarTransport = (
  body: Record<string, unknown>,
) => Promise<Record<string, unknown>>;
export function authenticatedCalendarTransport(
  endpoint: string,
  getAccessToken: () => Promise<string | null>,
  fetcher: typeof fetch = fetch,
): CalendarTransport {
  return async (body) => {
    const token = await getAccessToken();
    if (!token)
      throw new CalendarProviderError(
        "Sign in before connecting a calendar account.",
        401,
      );
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const result: Record<string, unknown> = await response
        .json()
        .catch(() => ({}));
      if (response.ok) return result;
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const retry = Number(response.headers.get("Retry-After"));
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(
              Number.isFinite(retry) && retry > 0
                ? retry * 1_000
                : 500 * 2 ** attempt,
              10_000,
            ),
          ),
        );
        continue;
      }
      throw new CalendarProviderError(
        typeof result.error === "string"
          ? result.error
          : "The calendar provider could not complete this request.",
        response.status,
        result,
      );
    }
    throw new CalendarProviderError(
      "The calendar provider is temporarily unavailable.",
      503,
    );
  };
}
/** Browser adapter contains account IDs only; OAuth refresh tokens and CalDAV passwords stay server-side. */
export class BackendCalendarProvider implements CalendarProvider {
  constructor(
    readonly provider: Exclude<CalendarSource, "local">,
    readonly accountId: string,
    private readonly transport: CalendarTransport,
  ) {}
  private request(action: string, body: Record<string, unknown> = {}) {
    return this.transport({
      provider: this.provider,
      accountId: this.accountId,
      action,
      ...body,
    });
  }
  async listCalendars(): Promise<ProviderCalendar[]> {
    return (await this.request("listCalendars"))
      .calendars as ProviderCalendar[];
  }
  async listEvents(
    range: { from: string; to: string },
    syncToken?: string,
    calendarId?: string,
  ): Promise<{
    events: ProviderEvent[];
    syncToken?: string;
    fullResync?: boolean;
  }> {
    try {
      return (await this.request("listEvents", {
        range: { start: range.from, end: range.to },
        syncToken,
        calendarId,
      })) as unknown as {
        events: ProviderEvent[];
        syncToken?: string;
        fullResync?: boolean;
      };
    } catch (error) {
      if (
        error instanceof CalendarProviderError &&
        error.status === 410 &&
        syncToken
      )
        return {
          ...(await this.listEvents(range, undefined, calendarId)),
          fullResync: true,
        };
      throw error;
    }
  }
  async createEvent(
    calendarId: string,
    event: Omit<ProviderEvent, "id">,
  ): Promise<ProviderEvent> {
    if (this.provider === "ics")
      throw new CalendarProviderError("Subscriptions are read-only.", 403);
    return (await this.request("createEvent", { calendarId, event }))
      .event as ProviderEvent;
  }
  async updateEvent(
    calendarId: string,
    event: ProviderEvent,
    etag: string,
  ): Promise<ProviderEvent> {
    if (this.provider === "ics")
      throw new CalendarProviderError("Subscriptions are read-only.", 403);
    return (await this.request("updateEvent", { calendarId, event, etag }))
      .event as ProviderEvent;
  }
  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    if (this.provider === "ics")
      throw new CalendarProviderError("Subscriptions are read-only.", 403);
    await this.request("deleteEvent", { calendarId, eventId });
  }
  async disconnect(): Promise<void> {
    await this.request("disconnect");
  }
}
