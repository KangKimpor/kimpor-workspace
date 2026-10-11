import {
  googleAction,
  outlookAction,
} from "../functions/_shared/calendar-api.ts";
import {
  safeRemoteUrl,
  isPrivateAddress,
  fetchPublic,
} from "../functions/_shared/network.ts";
import { seal, unseal } from "../functions/_shared/credentials.ts";
import { expandEvents } from "../../packages/integrations/src/calendar.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
async function rejects(action: () => unknown | Promise<unknown>) {
  let failed = false;
  try {
    await action();
  } catch {
    failed = true;
  }
  assert(failed, "Expected rejection");
}
Deno.test("the deployed Deno calendar runtime expands recurrence across a DST change", () => {
  const occurrences = expandEvents([{
    id: "runtime-fixture", title: "Reminder", start: "2026-03-07T14:00:00Z",
    end: "2026-03-07T15:00:00Z", allDay: false,
    startZone: "America/New_York", endZone: "America/New_York",
    recurrence: "FREQ=DAILY;COUNT=2", exceptions: [],
  }], "2026-03-07T00:00:00Z", "2026-03-10T00:00:00Z");
  assert(occurrences.length === 2);
  assert(occurrences[0]?.start === "2026-03-07T14:00:00.000Z");
  assert(occurrences[1]?.start === "2026-03-08T13:00:00.000Z");
});
Deno.test(
  "provider credentials are authenticated to their owner and tampering never reveals them",
  async () => {
    const previous = Deno.env.get("CREDENTIAL_ENCRYPTION_KEY");
    Deno.env.set(
      "CREDENTIAL_ENCRYPTION_KEY",
      btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),
    );
    try {
      const ciphertext = await seal(
        { refresh_token: "fixture-only-token" },
        "owner-one",
      );
      assert(!ciphertext.includes("fixture-only-token"));
      assert(
        (await unseal<{ refresh_token: string }>(ciphertext, "owner-one"))
          .refresh_token === "fixture-only-token",
      );
      await rejects(() => unseal(ciphertext, "owner-two"));
      const envelope = JSON.parse(ciphertext);
      envelope.data = "AA==";
      await rejects(() => unseal(JSON.stringify(envelope), "owner-one"));
    } finally {
      if (previous) Deno.env.set("CREDENTIAL_ENCRYPTION_KEY", previous);
      else Deno.env.delete("CREDENTIAL_ENCRYPTION_KEY");
    }
  },
);
Deno.test(
  "Google expires an incremental cursor, pages a full resync and preserves etag and recurrence",
  async () => {
    const original = globalThis.fetch,
      requests: URL[] = [];
    const fixture = {
      id: "event-1",
      summary: "Review 中文 ខ្មែរ",
      etag: '"etag-1"',
      start: {
        dateTime: "2026-03-07T09:00:00-05:00",
        timeZone: "America/New_York",
      },
      end: {
        dateTime: "2026-03-07T10:00:00-05:00",
        timeZone: "America/New_York",
      },
      recurrence: ["RRULE:FREQ=DAILY;COUNT=3"],
      reminders: { overrides: [{ minutes: 10 }] },
    };
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.searchParams.has("syncToken"))
        return new Response("{}", { status: 410 });
      return Response.json(
        url.searchParams.has("pageToken")
          ? { items: [], nextSyncToken: "new-cursor" }
          : { items: [fixture], nextPageToken: "second-page" },
      );
    };
    try {
      const result = await googleAction("fixture-access-token", {
        action: "listEvents",
        calendarId: "primary",
        syncToken: "expired",
        range: { start: "2026-01-01T00:00:00Z", end: "2026-12-31T00:00:00Z" },
      });
      const events = result.events as {
        title: string;
        recurrence: string;
        etag: string;
      }[];
      assert(result.fullResync === true);
      assert(result.syncToken === "new-cursor");
      assert(events.length === 1);
      assert(events[0]?.title === fixture.summary);
      assert(events[0]?.recurrence === "FREQ=DAILY;COUNT=3");
      assert(events[0]?.etag === fixture.etag);
      assert(requests.length === 3);
      assert(
        requests[1]?.searchParams.get("timeMin") === "2026-01-01T00:00:00Z",
      );
    } finally {
      globalThis.fetch = original;
    }
  },
);
Deno.test(
  "Google creation is idempotent and etag conflicts stay visible",
  async () => {
    const original = globalThis.fetch;
    const methods: string[] = [];
    const fixture = {
      id: "fixed-id",
      summary: "Existing",
      start: { date: "2026-10-10" },
      end: { date: "2026-10-11" },
    };
    globalThis.fetch = async (_input, init) => {
      methods.push(init?.method ?? "GET");
      return init?.method === "POST"
        ? new Response("{}", { status: 409 })
        : Response.json(fixture);
    };
    try {
      const result = await googleAction("test", {
        action: "createEvent",
        calendarId: "primary",
        operationId: "a1234567890",
        event: {
          title: "Meeting",
          startsAt: "2026-10-10",
          endsAt: "2026-10-11",
          allDay: true,
        },
      });
      assert((result.event as { id: string }).id === "fixed-id");
      assert(methods.join(",") === "POST,GET");
      globalThis.fetch = async () => new Response("{}", { status: 412 });
      await rejects(() =>
        googleAction("test", {
          action: "updateEvent",
          calendarId: "primary",
          eventId: "fixed-id",
          etag: "old",
          event: { title: "Changed" },
        }),
      );
    } finally {
      globalThis.fetch = original;
    }
  },
);
Deno.test(
  "Google normalizes TZID exceptions across DST and writes RFC 5545 EXDATE values",
  async () => {
    const original = globalThis.fetch;
    const payloads: Record<string, unknown>[] = [];
    const fixture = {
      id: "recurring",
      summary: "Daily",
      start: {
        dateTime: "2026-03-07T09:00:00-05:00",
        timeZone: "America/New_York",
      },
      end: {
        dateTime: "2026-03-07T10:00:00-05:00",
        timeZone: "America/New_York",
      },
      recurrence: [
        "RRULE:FREQ=DAILY;COUNT=3",
        "EXDATE;TZID=America/New_York:20260308T090000,20260309T090000",
      ],
    };
    globalThis.fetch = async (_input, init) => {
      if (init?.body) payloads.push(JSON.parse(String(init.body)));
      return Response.json(fixture);
    };
    try {
      const result = await googleAction("test", {
        action: "createEvent",
        calendarId: "primary",
        operationId: "a1234567890",
        event: {
          title: "Daily",
          startsAt: "2026-03-07T14:00:00Z",
          endsAt: "2026-03-07T15:00:00Z",
          timeZone: "America/New_York",
          recurrence: "FREQ=DAILY;COUNT=3",
          exceptions: ["2026-03-08T13:00:00.000Z"],
        },
      });
      assert(
        JSON.stringify(
          (result.event as { exceptions: string[] }).exceptions,
        ) ===
          JSON.stringify([
            "2026-03-08T13:00:00.000Z",
            "2026-03-09T13:00:00.000Z",
          ]),
      );
      assert(
        (payloads[0]?.recurrence as string[]).includes(
          "EXDATE:20260308T130000Z",
        ),
      );
      await googleAction("test", {
        action: "createEvent",
        calendarId: "primary",
        operationId: "a1234567891",
        event: {
          title: "All day",
          allDay: true,
          startsAt: "2026-03-07",
          endsAt: "2026-03-08",
          recurrence: "FREQ=DAILY;COUNT=3",
          exceptions: ["2026-03-08"],
        },
      });
      assert(
        (payloads[1]?.recurrence as string[]).includes(
          "EXDATE;VALUE=DATE:20260308",
        ),
      );
    } finally {
      globalThis.fetch = original;
    }
  },
);
Deno.test(
  "Outlook accepts only Microsoft delta cursors and rejects unsupported recurring edits",
  async () => {
    await rejects(() =>
      outlookAction("test", {
        action: "listEvents",
        calendarId: "primary",
        syncToken: "https://attacker.example.test/steal",
        range: { start: "2026-10-10", end: "2026-10-11" },
      }),
    );
    await rejects(() =>
      outlookAction("test", {
        action: "updateEvent",
        calendarId: "primary",
        event: { title: "Recurring", recurrence: "FREQ=DAILY" },
      }),
    );
  },
);
Deno.test(
  "calendar URL checks reject private addresses and bounded responses and never forward auth on redirects",
  async () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "169.254.169.254",
      "192.168.1.1",
      "172.16.0.1",
      "::1",
      "fd00::1",
      "::ffff:127.0.0.1",
    ])
      assert(isPrivateAddress(address));
    assert(!isPrivateAddress("1.1.1.1"));
    for (const url of [
      "http://calendar.example.test",
      "https://localhost",
      "https://127.0.0.1",
      "https://user:pass@calendar.example.test",
      "https://calendar.example.test:444",
    ])
      await rejects(() => safeRemoteUrl(url));
    assert(
      safeRemoteUrl("webcal://calendar.example.test/feed.ics").protocol ===
        "https:",
    );
    await rejects(() =>
      safeRemoteUrl("https://unapproved.example.test", [
        "approved.example.test",
      ]),
    );
    const original = globalThis.fetch;
    globalThis.fetch = async (input) =>
      String(input).startsWith("https://cloudflare-dns.com")
        ? Response.json({ Status: 0, Answer: [{ type: 1, data: "1.1.1.1" }] })
        : new Response("", {
            status: 302,
            headers: { Location: "https://another.example.test/feed" },
          });
    try {
      await rejects(() =>
        fetchPublic("https://calendar.example.test/feed", {
          headers: { Authorization: "Basic fixture-only" },
        }),
      );
      globalThis.fetch = async (input) =>
        String(input).startsWith("https://cloudflare-dns.com")
          ? Response.json({ Status: 0, Answer: [{ type: 1, data: "1.1.1.1" }] })
          : new Response("exceeds", { headers: { "Content-Length": "99999" } });
      await rejects(() =>
        fetchPublic("https://calendar.example.test/feed", {}, 10),
      );
    } finally {
      globalThis.fetch = original;
    }
  },
);
