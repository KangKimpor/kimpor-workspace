import { describe, expect, it, vi } from "vitest";
import {
  addDays,
  BackendCalendarProvider,
  CalendarProviderError,
  expandEvents,
  exportIcs,
  importIcs,
  naturalLanguageEvent,
  splitRecurrence,
  wallTime,
  wallTimeToUtc,
  occurrenceReminderTime,
  type EventRecord,
  type ProviderEvent,
} from "./calendar";
const weekly: EventRecord = {
  id: "weekly",
  title: "Standup",
  start: "2026-03-01T14:00:00.000Z",
  end: "2026-03-01T15:00:00.000Z",
  allDay: false,
  startZone: "America/New_York",
  endZone: "America/New_York",
  recurrence: "FREQ=WEEKLY;COUNT=4;BYDAY=SU",
  exceptions: [],
};
describe("calendar wall clocks and recurrence", () => {
  it("schedules all-day reminders at local 09:00 across DST and extreme time zones", () => {
    expect(
      new Date(
        occurrenceReminderTime("2026-03-08", "America/New_York", 15),
      ).toISOString(),
    ).toBe("2026-03-08T12:45:00.000Z");
    expect(
      new Date(
        occurrenceReminderTime("2026-10-10", "Pacific/Kiritimati", 1440),
      ).toISOString(),
    ).toBe("2026-10-08T19:00:00.000Z");
    expect(
      new Date(
        occurrenceReminderTime("2026-10-10T13:00:00Z", "Asia/Phnom_Penh", 10),
      ).toISOString(),
    ).toBe("2026-10-10T12:50:00.000Z");
  });
  it("keeps weekly New York meetings at 9am across spring DST", () => {
    const occurrences = expandEvents(
      [weekly],
      "2026-03-01T00:00:00Z",
      "2026-03-30T00:00:00Z",
    );
    expect(occurrences.map((value) => value.start)).toEqual([
      "2026-03-01T14:00:00.000Z",
      "2026-03-08T13:00:00.000Z",
      "2026-03-15T13:00:00.000Z",
      "2026-03-22T13:00:00.000Z",
    ]);
    expect(
      occurrences.every(
        (value) =>
          wallTime(value.start, weekly.startZone).slice(11, 16) === "09:00",
      ),
    ).toBe(true);
  });
  it("keeps London wall clocks across its own DST transition", () => {
    const event = {
      ...weekly,
      start: "2026-03-22T09:00:00Z",
      end: "2026-03-22T10:00:00Z",
      startZone: "Europe/London",
      endZone: "Europe/London",
      recurrence: "FREQ=WEEKLY;COUNT=3",
    };
    expect(
      expandEvents([event], "2026-03-20T00:00:00Z", "2026-04-10T00:00:00Z").map(
        (value) => value.start,
      ),
    ).toEqual([
      "2026-03-22T09:00:00.000Z",
      "2026-03-29T08:00:00.000Z",
      "2026-04-05T08:00:00.000Z",
    ]);
  });
  it("uses earlier folded time and advances nonexistent wall clocks", () => {
    expect(wallTimeToUtc("2026-11-01T01:30", "America/New_York")).toBe(
      "2026-11-01T05:30:00.000Z",
    );
    expect(wallTimeToUtc("2026-03-08T02:30", "America/New_York")).toBe(
      "2026-03-08T07:30:00.000Z",
    );
    expect(() => wallTimeToUtc("2026-02-31T09:00", "UTC")).toThrow("Invalid");
  });
  it("respects monthly BYDAY, leap dates, exceptions and exclusive date-only end", () => {
    const event = {
      ...weekly,
      start: "2026-01-05",
      end: "2026-01-06",
      allDay: true,
      recurrence: "FREQ=MONTHLY;COUNT=3;BYDAY=1MO",
      exceptions: ["2026-02-02"],
    };
    expect(
      expandEvents([event], "2026-01-01", "2026-04-01").map((value) => [
        value.start,
        value.end,
      ]),
    ).toEqual([
      ["2026-01-05", "2026-01-06"],
      ["2026-03-02", "2026-03-03"],
    ]);
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(
      expandEvents([{ ...event, recurrence: "" }], "2026-01-06", "2026-01-07"),
    ).toEqual([]);
  });
  it("splits following events without duplicating or losing the original COUNT", () => {
    const split = splitRecurrence(weekly, "2026-03-15T13:00:00.000Z");
    expect(split).toEqual({
      before: "FREQ=WEEKLY;BYDAY=SU;COUNT=2",
      following: "FREQ=WEEKLY;BYDAY=SU;COUNT=2",
    });
    const events = [
      { ...weekly, recurrence: split.before! },
      {
        ...weekly,
        id: "following",
        start: "2026-03-15T13:00:00.000Z",
        end: "2026-03-15T14:00:00.000Z",
        recurrence: split.following,
      },
    ];
    expect(
      expandEvents(events, "2026-03-01", "2026-03-30").map(
        (value) => value.start,
      ),
    ).toEqual(
      expandEvents([weekly], "2026-03-01", "2026-03-30").map(
        (value) => value.start,
      ),
    );
  });
  it("parses quick add into the selected zone instead of the machine zone", () => {
    const parsed = naturalLanguageEvent(
      "lunch with Sam tomorrow 1pm",
      new Date("2026-10-10T10:00:00Z"),
      "America/New_York",
    );
    expect(parsed).toEqual({
      title: "lunch with Sam",
      start: "2026-10-11T17:00:00.000Z",
      end: "2026-10-11T18:00:00.000Z",
      allDay: false,
    });
  });
});
describe("iCalendar import and export", () => {
  it("round trips Unicode, escapes, folded UTF-8, recurrence, zones and alarms", () => {
    const event: ProviderEvent = {
      id: "meeting",
      title: "ជម្រាបសួរ 中文 ".repeat(20),
      startsAt: weekly.start,
      endsAt: weekly.end,
      timeZone: weekly.startZone,
      endTimeZone: "Europe/London",
      notes: "A, B; C\\D\nsecond line",
      location: "Meeting, room",
      recurrence: weekly.recurrence,
      exceptions: ["2026-03-08T13:00:00.000Z"],
      reminderMinutes: 90,
      busy: false,
    };
    const output = exportIcs([event]);
    expect(
      output
        .split("\r\n")
        .every((line) => new TextEncoder().encode(line).length <= 75),
    ).toBe(true);
    const imported = importIcs(output, "UTC")[0]!;
    expect(imported).toMatchObject(event);
  });
  it("retains date-only all-day semantics independent of the import zone", () => {
    const event: ProviderEvent = {
      id: "holiday",
      title: "Holiday",
      startsAt: "2026-12-25",
      endsAt: "2026-12-26",
      allDay: true,
      timeZone: "Pacific/Auckland",
    };
    expect(importIcs(exportIcs([event]), "America/New_York")[0]).toMatchObject({
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: true,
    });
  });
  it("suppresses the parent occurrence when an ICS recurrence override exists", () => {
    const calendar =
      "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:same\nDTSTART:20260301T140000Z\nDTEND:20260301T150000Z\nRRULE:FREQ=WEEKLY;COUNT=2\nEND:VEVENT\nBEGIN:VEVENT\nUID:same\nRECURRENCE-ID:20260308T140000Z\nDTSTART:20260308T160000Z\nDTEND:20260308T170000Z\nSUMMARY:Moved\nEND:VEVENT\nEND:VCALENDAR";
    const imported = importIcs(calendar);
    expect(imported[0]!.exceptions).toEqual(["2026-03-08T14:00:00.000Z"]);
    expect(imported[1]!.recurrenceId).toBe("2026-03-08T14:00:00.000Z");
  });
  it("rejects invalid or incomplete calendars before writing any rows", () => {
    expect(() => importIcs("hello")).toThrow("not an iCalendar");
    expect(() =>
      importIcs(
        "BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20260231T140000Z\nEND:VEVENT\nEND:VCALENDAR",
      ),
    ).toThrow("Invalid date");
    expect(() =>
      importIcs("BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20260301T140000Z"),
    ).toThrow("incomplete");
  });
});
describe("backend provider boundary", () => {
  it("recovers an expired sync token and carries etags without provider secrets", async () => {
    const transport = vi
      .fn()
      .mockRejectedValueOnce(new CalendarProviderError("expired", 410))
      .mockResolvedValueOnce({ events: [], syncToken: "new" })
      .mockResolvedValueOnce({ event: { id: "event", etag: "etag2" } });
    const provider = new BackendCalendarProvider(
      "google",
      "account-id",
      transport,
    );
    expect(
      await provider.listEvents(
        { from: "2026-01-01", to: "2027-01-01" },
        "old",
        "cal",
      ),
    ).toEqual({ events: [], syncToken: "new", fullResync: true });
    expect(transport.mock.calls[1]![0]).toMatchObject({
      provider: "google",
      accountId: "account-id",
      calendarId: "cal",
      syncToken: undefined,
    });
    await provider.updateEvent(
      "cal",
      {
        id: "event",
        title: "title",
        startsAt: "2026-01-01",
        endsAt: "2026-01-02",
        timeZone: "UTC",
      },
      "etag1",
    );
    expect(transport.mock.calls[2]![0]).toMatchObject({
      action: "updateEvent",
      etag: "etag1",
    });
  });
  it("rejects read-only subscription writes before a request is made", async () => {
    const transport = vi.fn();
    const provider = new BackendCalendarProvider("ics", "account", transport);
    await expect(provider.deleteEvent("calendar", "event")).rejects.toThrow(
      "read-only",
    );
    expect(transport).not.toHaveBeenCalled();
  });
});
