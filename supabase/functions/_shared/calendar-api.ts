import {
  parseIcsExceptions,
  type IcsEvent,
} from "../../../packages/integrations/src/ics.ts";
import { HttpError } from "./runtime.ts";
type Item = Record<string, unknown>;
function object(value: unknown): Item {
  return value && typeof value === "object" ? (value as Item) : {};
}
function string(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
async function api(
  url: string,
  token: string,
  options: RequestInit = {},
): Promise<Item> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok)
    throw new HttpError(
      response.status,
      response.status === 410
        ? "Calendar sync cursor expired"
        : response.status === 412
          ? "Calendar changed on another device. Refetch before saving."
          : response.status === 401
            ? "Reconnect this calendar account"
            : "Calendar provider request failed",
    );
  return response.status === 204 ? {} : ((await response.json()) as Item);
}
function eventFromGoogle(raw: Item, calendarId: string): IcsEvent {
  const start = object(raw.start),
    end = object(raw.end);
  const allDay = !!start.date;
  const recurrence = Array.isArray(raw.recurrence)
    ? raw.recurrence.map((value) => string(value))
    : [];
  const reminders = object(raw.reminders);
  const override = Array.isArray(reminders.overrides)
    ? object(reminders.overrides[0])
    : {};
  return {
    id: string(raw.id),
    title: string(raw.summary, "Untitled event"),
    startsAt: string(start.date || start.dateTime),
    endsAt: string(end.date || end.dateTime),
    timeZone: string(start.timeZone, "UTC"),
    endTimeZone: string(end.timeZone || start.timeZone, "UTC"),
    allDay,
    etag: string(raw.etag),
    deleted: raw.status === "cancelled",
    calendarId,
    location: string(raw.location),
    notes: string(raw.description),
    url: string(raw.htmlLink),
    busy: raw.transparency !== "transparent",
    reminderMinutes: Number(override.minutes || 0),
    recurrence:
      recurrence.find((line) => line.startsWith("RRULE:"))?.slice(6) || "",
    exceptions: recurrence.flatMap((line) =>
      parseIcsExceptions(line, string(start.timeZone, "UTC")),
    ),
    ...(raw.originalStartTime
      ? {
          recurrenceId: string(
            object(raw.originalStartTime).date ||
              object(raw.originalStartTime).dateTime,
          ),
        }
      : {}),
  };
}
function googleEvent(event: Item, operationId?: string): Item {
  const allDay = event.allDay === true;
  const start = string(event.startsAt),
    end = string(event.endsAt);
  const recurrence: string[] = [];
  if (event.recurrence)
    recurrence.push(`RRULE:${string(event.recurrence).replace(/^RRULE:/, "")}`);
  if (Array.isArray(event.exceptions) && event.exceptions.length) {
    const exceptions = event.exceptions.map((value) => {
      const date = string(value);
      if (allDay) {
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(Date.parse(date))
        )
          throw new HttpError(400, "Invalid recurrence exception date");
        return date.replace(/-/g, "");
      }
      if (!Number.isFinite(Date.parse(date)))
        throw new HttpError(400, "Invalid recurrence exception time");
      return new Date(date)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
    });
    recurrence.push(
      `EXDATE${allDay ? ";VALUE=DATE" : ""}:${exceptions.join(",")}`,
    );
  }
  return {
    ...(operationId
      ? { id: operationId.toLowerCase().replace(/[^a-v0-9]/g, "") }
      : {}),
    summary: string(event.title),
    start: allDay
      ? { date: start }
      : { dateTime: start, timeZone: string(event.timeZone, "UTC") },
    end: allDay
      ? { date: end }
      : {
          dateTime: end,
          timeZone: string(event.endTimeZone || event.timeZone, "UTC"),
        },
    location: string(event.location),
    description: string(event.notes),
    transparency: event.busy === false ? "transparent" : "opaque",
    reminders: {
      useDefault: false,
      overrides:
        Number(event.reminderMinutes) > 0
          ? [{ method: "popup", minutes: Number(event.reminderMinutes) }]
          : [],
    },
    ...(recurrence.length ? { recurrence } : {}),
  };
}
export async function googleAction(token: string, body: Item): Promise<Item> {
  const action = string(body.action);
  const calendarId = string(body.calendarId);
  const base = "https://www.googleapis.com/calendar/v3";
  if (action === "listCalendars") {
    const result = await api(
      `${base}/users/me/calendarList?maxResults=250`,
      token,
    );
    return {
      calendars: (Array.isArray(result.items) ? result.items : []).map(
        (value) => {
          const item = object(value);
          return {
            id: item.id,
            title: item.summary,
            color: item.backgroundColor,
            readOnly:
              item.accessRole === "reader" ||
              item.accessRole === "freeBusyReader",
          };
        },
      ),
    };
  }
  if (!calendarId) throw new HttpError(400, "Choose a calendar");
  const eventsUrl = `${base}/calendars/${encodeURIComponent(calendarId)}/events`;
  if (action === "listEvents") {
    const range = object(body.range);
    const params = new URLSearchParams({
      maxResults: "2500",
      showDeleted: "true",
      singleEvents: "false",
    });
    if (body.syncToken) params.set("syncToken", string(body.syncToken));
    else {
      params.set("timeMin", string(range.start));
      params.set("timeMax", string(range.end));
    }
    const events: IcsEvent[] = [];
    let syncToken: string | undefined;
    let pageToken = "";
    let fullResync = false;
    for (let page = 0; page < 20; page++) {
      if (pageToken) params.set("pageToken", pageToken);
      let result: Item;
      try {
        result = await api(`${eventsUrl}?${params}`, token);
      } catch (error) {
        if (
          error instanceof HttpError &&
          error.status === 410 &&
          body.syncToken
        ) {
          params.delete("syncToken");
          params.set("timeMin", string(range.start));
          params.set("timeMax", string(range.end));
          params.delete("pageToken");
          events.length = 0;
          pageToken = "";
          fullResync = true;
          body.syncToken = undefined;
          page = -1;
          continue;
        }
        throw error;
      }
      for (const raw of Array.isArray(result.items) ? result.items : [])
        events.push(eventFromGoogle(object(raw), calendarId));
      syncToken =
        typeof result.nextSyncToken === "string"
          ? result.nextSyncToken
          : syncToken;
      pageToken = string(result.nextPageToken);
      if (!pageToken) return { events, syncToken, fullResync };
    }
    throw new HttpError(413, "Calendar has too many events in this range");
  }
  if (action === "deleteEvent") {
    await api(
      `${eventsUrl}/${encodeURIComponent(string(body.eventId))}`,
      token,
      {
        method: "DELETE",
        headers: body.etag ? { "If-Match": string(body.etag) } : {},
      },
    );
    return { ok: true };
  }
  const create = action === "createEvent";
  if (!create && action !== "updateEvent")
    throw new HttpError(400, "Unknown calendar operation");
  const payload = googleEvent(
    object(body.event),
    create ? string(body.operationId) || undefined : undefined,
  );
  try {
    const result = await api(
      create
        ? eventsUrl
        : `${eventsUrl}/${encodeURIComponent(string(body.eventId))}`,
      token,
      {
        method: create ? "POST" : "PUT",
        headers: body.etag ? { "If-Match": string(body.etag) } : {},
        body: JSON.stringify(payload),
      },
    );
    return { event: eventFromGoogle(result, calendarId) };
  } catch (error) {
    if (
      create &&
      error instanceof HttpError &&
      error.status === 409 &&
      payload.id
    )
      return {
        event: eventFromGoogle(
          await api(`${eventsUrl}/${payload.id}`, token),
          calendarId,
        ),
      };
    throw error;
  }
}
function graphDate(raw: unknown): { value: string; zone: string } {
  const date = object(raw);
  const value = string(date.dateTime);
  return {
    value: /Z$|[+-]\d{2}:\d{2}$/.test(value)
      ? new Date(value).toISOString()
      : new Date(`${value}Z`).toISOString(),
    zone: string(date.timeZone, "UTC"),
  };
}
function outlookRecurrence(raw: unknown): string {
  const item = object(raw),
    pattern = object(item.pattern),
    range = object(item.range);
  const type = string(pattern.type);
  const freq = type.toLowerCase().includes("daily")
    ? "DAILY"
    : type.toLowerCase().includes("weekly")
      ? "WEEKLY"
      : type.toLowerCase().includes("monthly")
        ? "MONTHLY"
        : type.toLowerCase().includes("yearly")
          ? "YEARLY"
          : "";
  if (!freq) return "";
  const parts = [`FREQ=${freq}`, `INTERVAL=${Number(pattern.interval || 1)}`];
  if (Array.isArray(pattern.daysOfWeek))
    parts.push(
      `BYDAY=${pattern.daysOfWeek.map((day) => ({ sunday: "SU", monday: "MO", tuesday: "TU", wednesday: "WE", thursday: "TH", friday: "FR", saturday: "SA" })[string(day) as "sunday"] || "").join(",")}`,
    );
  if (pattern.dayOfMonth) parts.push(`BYMONTHDAY=${pattern.dayOfMonth}`);
  if (pattern.month) parts.push(`BYMONTH=${pattern.month}`);
  if (range.type === "numbered")
    parts.push(`COUNT=${range.numberOfOccurrences}`);
  if (range.type === "endDate")
    parts.push(`UNTIL=${string(range.endDate).replace(/-/g, "")}T235959Z`);
  return parts.join(";");
}
function eventFromOutlook(raw: Item, calendarId: string): IcsEvent {
  if (raw["@removed"])
    return {
      id: string(raw.id),
      title: "",
      startsAt: "",
      endsAt: "",
      timeZone: "UTC",
      calendarId,
      deleted: true,
    };
  const start = graphDate(raw.start),
    end = graphDate(raw.end);
  return {
    id: string(raw.id),
    title: string(raw.subject, "Untitled event"),
    startsAt: raw.isAllDay ? start.value.slice(0, 10) : start.value,
    endsAt: raw.isAllDay ? end.value.slice(0, 10) : end.value,
    timeZone: "UTC",
    endTimeZone: "UTC",
    allDay: raw.isAllDay === true,
    etag: string(raw["@odata.etag"]),
    location: string(object(raw.location).displayName),
    notes: string(object(raw.body).content),
    url: string(raw.webLink),
    busy: raw.showAs !== "free",
    reminderMinutes: raw.isReminderOn
      ? Number(raw.reminderMinutesBeforeStart)
      : 0,
    recurrence: outlookRecurrence(raw.recurrence),
    calendarId,
  };
}
export async function outlookAction(token: string, body: Item): Promise<Item> {
  const action = string(body.action),
    calendarId = string(body.calendarId);
  const base = "https://graph.microsoft.com/v1.0/me";
  if (action === "listCalendars") {
    const result = await api(`${base}/calendars?$top=100`, token);
    return {
      calendars: (Array.isArray(result.value) ? result.value : []).map(
        (value) => {
          const item = object(value);
          return {
            id: item.id,
            title: item.name,
            color: item.hexColor || "#2268bf",
            readOnly: item.canEdit === false,
          };
        },
      ),
    };
  }
  if (!calendarId) throw new HttpError(400, "Choose a calendar");
  const calendarUrl = `${base}/calendars/${encodeURIComponent(calendarId)}`;
  if (action === "listEvents") {
    const range = object(body.range);
    let url = body.syncToken
      ? string(body.syncToken)
      : `${calendarUrl}/calendarView/delta?startDateTime=${encodeURIComponent(string(range.start))}&endDateTime=${encodeURIComponent(string(range.end))}`;
    const events: IcsEvent[] = [];
    for (let page = 0; page < 20; page++) {
      const parsed = new URL(url);
      if (
        parsed.origin !== "https://graph.microsoft.com" ||
        !parsed.pathname.startsWith("/v1.0/me/")
      )
        throw new HttpError(400, "Invalid Outlook sync cursor");
      let result: Item;
      try {
        result = await api(url, token, {
          headers: { Prefer: 'outlook.timezone="UTC"' },
        });
      } catch (error) {
        if (
          error instanceof HttpError &&
          error.status === 410 &&
          body.syncToken
        ) {
          return outlookAction(token, { ...body, syncToken: undefined });
        }
        throw error;
      }
      for (const item of Array.isArray(result.value) ? result.value : [])
        events.push(eventFromOutlook(object(item), calendarId));
      if (!result["@odata.nextLink"])
        return { events, syncToken: result["@odata.deltaLink"] };
      url = string(result["@odata.nextLink"]);
    }
    throw new HttpError(413, "Calendar has too many events");
  }
  const eventUrl = `${calendarUrl}/events/${encodeURIComponent(string(body.eventId))}`;
  if (action === "deleteEvent") {
    await api(eventUrl, token, {
      method: "DELETE",
      headers: body.etag ? { "If-Match": string(body.etag) } : {},
    });
    return { ok: true };
  }
  const event = object(body.event);
  const create = action === "createEvent";
  if (!create && action !== "updateEvent")
    throw new HttpError(400, "Unknown calendar operation");
  const payload = {
    subject: string(event.title),
    start: {
      dateTime: string(event.startsAt).replace(/Z$/, ""),
      timeZone: "UTC",
    },
    end: { dateTime: string(event.endsAt).replace(/Z$/, ""), timeZone: "UTC" },
    isAllDay: event.allDay === true,
    location: { displayName: string(event.location) },
    body: { contentType: "text", content: string(event.notes) },
    showAs: event.busy === false ? "free" : "busy",
    isReminderOn: Number(event.reminderMinutes) > 0,
    reminderMinutesBeforeStart: Number(event.reminderMinutes || 0),
    ...(create && body.operationId
      ? { transactionId: string(body.operationId) }
      : {}),
  };
  if (event.recurrence)
    throw new HttpError(
      422,
      "Outlook recurring event edits must currently be made in Outlook. Local and Google recurrence remain available.",
    );
  const result = await api(create ? `${calendarUrl}/events` : eventUrl, token, {
    method: create ? "POST" : "PATCH",
    headers: body.etag ? { "If-Match": string(body.etag) } : {},
    body: JSON.stringify(payload),
  });
  return { event: eventFromOutlook(result, calendarId) };
}
