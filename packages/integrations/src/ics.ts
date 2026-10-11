export interface IcsEvent {
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
import {
  addDays,
  pseudoUtc,
  validTimeZone,
  wallTime,
  wallTimeToUtc,
} from "./calendar-time.ts";
const DAY = 86_400_000;
function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}
function unescapeIcs(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_match, char: string) =>
    /n/i.test(char) ? "\n" : char,
  );
}
function foldIcs(line: string): string {
  const encoder = new TextEncoder();
  let output = "";
  let bytes = 0;
  for (const char of line) {
    const length = encoder.encode(char).length;
    if (bytes + length > 75) {
      output += "\r\n ";
      bytes = 1;
    }
    output += char;
    bytes += length;
  }
  return output;
}
function icsDate(value: string): string {
  return value.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
export function exportIcs(events: IcsEvent[], name = "Kimpor Workspace"): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kimpor Workspace//Calendar//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcs(name)}`,
  ];
  for (const event of events.filter((e) => !e.deleted)) {
    const allDay = event.allDay || event.startsAt.length === 10;
    const dateLine = (name: string, value: string, zone: string) =>
      allDay
        ? `${name};VALUE=DATE:${icsDate(value)}`
        : `${name};TZID=${zone}:${icsDate(wallTime(value, zone))}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcs(event.id)}`,
      `DTSTAMP:${icsDate(new Date().toISOString())}`,
      dateLine("DTSTART", event.startsAt, event.timeZone),
      dateLine("DTEND", event.endsAt, event.endTimeZone ?? event.timeZone),
      `SUMMARY:${escapeIcs(event.title)}`,
    );
    if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
    if (event.notes) lines.push(`DESCRIPTION:${escapeIcs(event.notes)}`);
    if (event.url) lines.push(`URL:${escapeIcs(event.url)}`);
    lines.push(`TRANSP:${event.busy === false ? "TRANSPARENT" : "OPAQUE"}`);
    if (event.recurrence)
      lines.push(`RRULE:${safeIcsRecurrence(event.recurrence)}`);
    if (event.exceptions?.length)
      lines.push(
        allDay
          ? `EXDATE;VALUE=DATE:${event.exceptions.map(icsDate).join(",")}`
          : `EXDATE:${event.exceptions.map((value) => icsDate(new Date(value).toISOString())).join(",")}`,
      );
    if (event.recurrenceId)
      lines.push(dateLine("RECURRENCE-ID", event.recurrenceId, event.timeZone));
    if (event.reminderMinutes && event.reminderMinutes > 0)
      lines.push(
        "BEGIN:VALARM",
        `TRIGGER:-PT${Math.trunc(event.reminderMinutes)}M`,
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeIcs(event.title)}`,
        "END:VALARM",
      );
    lines.push("END:VEVENT");
  }
  return [...lines, "END:VCALENDAR"].map(foldIcs).join("\r\n") + "\r\n";
}
interface IcsProperty {
  name: string;
  value: string;
  params: Record<string, string>;
}
function parseProperty(line: string): IcsProperty | null {
  let separator = -1;
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '"') quoted = !quoted;
    else if (line[index] === ":" && !quoted) {
      separator = index;
      break;
    }
  }
  if (separator < 0) return null;
  const [name, ...rawParams] = line.slice(0, separator).split(";");
  const params = Object.fromEntries(
    rawParams.map((part) => {
      const index = part.indexOf("=");
      return [
        part.slice(0, index).toUpperCase(),
        part.slice(index + 1).replace(/^"|"$/g, ""),
      ];
    }),
  );
  return {
    name: name!.toUpperCase(),
    params,
    value: line.slice(separator + 1),
  };
}
function parseIcsDate(
  property: IcsProperty,
  defaultZone: string,
): { value: string; allDay: boolean; zone: string } {
  const raw = property.value;
  const allDay = property.params.VALUE === "DATE" || /^\d{8}$/.test(raw);
  const zone = property.params.TZID ?? defaultZone;
  if (!validTimeZone(zone))
    throw new Error(`Unsupported calendar time zone: ${zone}`);
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(
    raw,
  );
  if (!match || (!allDay && !match[4])) throw new Error("Invalid ICS date.");
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  pseudoUtc(date);
  if (allDay) return { value: date, allDay, zone };
  const local = `${date}T${match[4]}:${match[5]}:${match[6] ?? "00"}`;
  return {
    value: match[7]
      ? new Date(pseudoUtc(local)).toISOString()
      : wallTimeToUtc(local, zone),
    allDay,
    zone: match[7] ? "UTC" : zone,
  };
}
/** Read an RFC 5545 EXDATE line, including date-only and TZID values. */
export function parseIcsExceptions(
  line: string,
  defaultZone: string,
): string[] {
  const property = parseProperty(line);
  if (!property || property.name !== "EXDATE") return [];
  return property.value
    .split(",")
    .map((value) => parseIcsDate({ ...property, value }, defaultZone).value);
}
export function importIcs(
  input: string,
  defaultZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): IcsEvent[] {
  if (new TextEncoder().encode(input).length > 5_000_000)
    throw new Error("ICS import is limited to 5 MB.");
  if (!/^BEGIN:VCALENDAR\s*$/im.test(input))
    throw new Error("This file is not an iCalendar calendar.");
  const lines = input.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events: IcsEvent[] = [];
  let properties: IcsProperty[] | null = null;
  let alarm = false;
  for (const line of lines) {
    if (line.toUpperCase() === "BEGIN:VEVENT") {
      properties = [];
      alarm = false;
      continue;
    }
    if (!properties) continue;
    if (line.toUpperCase() === "BEGIN:VALARM") {
      alarm = true;
      continue;
    }
    if (line.toUpperCase() === "END:VALARM") {
      alarm = false;
      continue;
    }
    if (line.toUpperCase() !== "END:VEVENT") {
      const property = parseProperty(line);
      if (property && (!alarm || property.name === "TRIGGER"))
        properties.push(property);
      continue;
    }
    const find = (name: string) =>
      properties!.find((property) => property.name === name);
    const first = find("DTSTART");
    if (!first) throw new Error("An event is missing DTSTART.");
    const start = parseIcsDate(first, defaultZone);
    const endProperty = find("DTEND");
    const duration = find("DURATION")?.value.match(
      /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
    );
    const durationMs = duration
      ? (Number(duration[1] ?? 0) * 7 + Number(duration[2] ?? 0)) * DAY +
        Number(duration[3] ?? 0) * 3_600_000 +
        Number(duration[4] ?? 0) * 60_000 +
        Number(duration[5] ?? 0) * 1_000
      : start.allDay
        ? DAY
        : 3_600_000;
    const end = endProperty
      ? parseIcsDate(endProperty, start.zone)
      : {
          ...start,
          value: start.allDay
            ? addDays(start.value, durationMs / DAY)
            : new Date(Date.parse(start.value) + durationMs).toISOString(),
        };
    if (
      end.allDay !== start.allDay ||
      Date.parse(end.value) <= Date.parse(start.value)
    )
      throw new Error("An event has an invalid end date.");
    const recurrenceId = find("RECURRENCE-ID");
    const uid = unescapeIcs(find("UID")?.value ?? crypto.randomUUID());
    const exceptions = properties
      .filter((property) => property.name === "EXDATE")
      .flatMap((property) =>
        property.value
          .split(",")
          .map(
            (value) => parseIcsDate({ ...property, value }, start.zone).value,
          ),
      );
    const reminder = find("TRIGGER")?.value.match(
      /^-PT(?:(\d+)H)?(?:(\d+)M)?$/,
    );
    events.push({
      id: uid,
      title: unescapeIcs(find("SUMMARY")?.value ?? "Untitled event"),
      startsAt: start.value,
      endsAt: end.value,
      timeZone: start.zone,
      endTimeZone: end.zone,
      allDay: start.allDay,
      location: unescapeIcs(find("LOCATION")?.value ?? ""),
      notes: unescapeIcs(find("DESCRIPTION")?.value ?? ""),
      url: unescapeIcs(find("URL")?.value ?? ""),
      busy: find("TRANSP")?.value !== "TRANSPARENT",
      reminderMinutes: reminder
        ? Number(reminder[1] ?? 0) * 60 + Number(reminder[2] ?? 0)
        : 0,
      recurrence: safeIcsRecurrence(find("RRULE")?.value ?? ""),
      exceptions,
      recurrenceId: recurrenceId
        ? parseIcsDate(recurrenceId, start.zone).value
        : undefined,
    });
    if (events.length > 10_000)
      throw new Error("ICS import is limited to 10,000 events.");
    properties = null;
  }
  if (properties) throw new Error("An ICS event is incomplete.");
  for (const override of events.filter((event) => event.recurrenceId)) {
    const parent = events.find(
      (event) => event.id === override.id && !event.recurrenceId,
    );
    if (parent)
      parent.exceptions = [
        ...new Set([...(parent.exceptions ?? []), override.recurrenceId!]),
      ];
  }
  return events;
}

function safeIcsRecurrence(value: string): string {
  const result = value
    .trim()
    .replace(/^RRULE:/i, "")
    .toUpperCase();
  if (
    result &&
    (result.length > 2000 ||
      !/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY|HOURLY|MINUTELY|SECONDLY)(;[A-Z]+=[A-Z0-9,+-]+)*$/.test(
        result,
      ))
  )
    throw new Error("Invalid recurrence rule.");
  return result;
}
