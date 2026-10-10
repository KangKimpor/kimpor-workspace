import {
  importIcs,
  exportIcs,
  type IcsEvent,
} from "../../../packages/integrations/src/ics.ts";
import { env, HttpError } from "./runtime.ts";
import { fetchPublic, safeRemoteUrl } from "./network.ts";
export interface CaldavCredentials {
  url: string;
  username: string;
  password: string;
  calendarHome?: string;
}
const escape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
const decode = (value: string) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
function tag(xml: string, name: string): string {
  const match = new RegExp(
    `<(?:(?:[\\w-]+):)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w-]+):)?${name}>`,
    "i",
  ).exec(xml);
  return decode(match?.[1]?.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1") || "");
}
function responses(xml: string): string[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new HttpError(502, "Unsupported calendar XML");
  return (
    xml.match(
      /<(?:(?:[\w-]+):)?response\b[^>]*>[\s\S]*?<\/(?:(?:[\w-]+):)?response>/gi,
    ) || []
  );
}
function allowed(raw: string, original: string): URL {
  const url = safeRemoteUrl(raw);
  const initial = safeRemoteUrl(original);
  const configured = env("CALENDAR_ALLOWED_HOSTS")
    .split(",")
    .map((value) => value.trim().toLowerCase());
  const apple =
    initial.hostname === "caldav.icloud.com" &&
    /^(?:p\d+-)?caldav\.icloud\.com$/.test(url.hostname);
  if (url.origin !== initial.origin && !apple)
    throw new HttpError(400, "Calendar discovery changed server unexpectedly");
  if (!configured.includes(url.hostname) && !apple)
    throw new HttpError(
      400,
      "Calendar server is not in the configured public host allowlist",
    );
  return url;
}
async function dav(
  credentials: CaldavCredentials,
  url: string,
  method: string,
  body?: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const destination = allowed(url, credentials.url);
  const auth = btoa(
    String.fromCharCode(
      ...new TextEncoder().encode(
        `${credentials.username}:${credentials.password}`,
      ),
    ),
  );
  const response = await fetchPublic(destination.href, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/xml; charset=utf-8",
      ...headers,
    },
    ...(body ? { body } : {}),
  });
  if (!response.ok && response.status !== 207)
    throw new HttpError(
      response.status,
      response.status === 412
        ? "Calendar changed remotely. Refetch before saving."
        : "CalDAV server request failed. Check the address and app-specific password.",
    );
  return response;
}
export async function discoverCalDav(
  credentials: CaldavCredentials,
): Promise<CaldavCredentials> {
  const principalResponse = await dav(
    credentials,
    credentials.url,
    "PROPFIND",
    '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>',
    { Depth: "0" },
  );
  const principalXml = await principalResponse.text();
  responses(principalXml);
  const principal = tag(tag(principalXml, "current-user-principal"), "href");
  if (!principal) throw new HttpError(502, "CalDAV principal discovery failed");
  const principalUrl = allowed(
    new URL(principal, credentials.url).href,
    credentials.url,
  ).href;
  const homeResponse = await dav(
    credentials,
    principalUrl,
    "PROPFIND",
    '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>',
    { Depth: "0" },
  );
  const homeXml = await homeResponse.text();
  responses(homeXml);
  const home = tag(tag(homeXml, "calendar-home-set"), "href");
  if (!home) throw new HttpError(502, "CalDAV home discovery failed");
  return {
    ...credentials,
    calendarHome: allowed(new URL(home, principalUrl).href, credentials.url)
      .href,
  };
}
export async function caldavAction(
  credentials: CaldavCredentials,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const action = String(body.action);
  const home = credentials.calendarHome || credentials.url;
  if (action === "listCalendars") {
    const response = await dav(
      credentials,
      home,
      "PROPFIND",
      '<d:propfind xmlns:d="DAV:" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:displayname/><d:resourcetype/><a:calendar-color/><d:current-user-privilege-set/></d:prop></d:propfind>',
      { Depth: "1" },
    );
    return {
      calendars: responses(await response.text())
        .filter((item) =>
          /<(?:[\w-]+:)?calendar(?:\s|\/|>)/i.test(tag(item, "resourcetype")),
        )
        .map((item) => ({
          id: allowed(new URL(tag(item, "href"), home).href, credentials.url)
            .href,
          title: tag(item, "displayname") || "Calendar",
          color: tag(item, "calendar-color").slice(0, 7) || "#2268bf",
          readOnly: !/<(?:[\w-]+:)?write(?:\s|\/|>)/i.test(
            tag(item, "current-user-privilege-set"),
          ),
        })),
    };
  }
  const calendar = allowed(String(body.calendarId || ""), credentials.url);
  if (!calendar.href.startsWith(home))
    throw new HttpError(400, "Calendar is outside this account home");
  if (action === "listEvents") {
    const range = body.range as { start: string; end: string };
    let xml: string;
    let fullResync = false;
    if (body.syncToken) {
      try {
        xml = await (
          await dav(
            credentials,
            calendar.href,
            "REPORT",
            `<d:sync-collection xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:sync-token>${escape(String(body.syncToken))}</d:sync-token><d:sync-level>1</d:sync-level><d:prop><d:getetag/><c:calendar-data/></d:prop></d:sync-collection>`,
            { Depth: "1" },
          )
        ).text();
      } catch (error) {
        if (
          error instanceof HttpError &&
          [403, 409, 410, 501].includes(error.status)
        ) {
          fullResync = true;
          xml = "";
        } else throw error;
      }
    } else xml = "";
    if (!xml) {
      const date = (value: string) =>
        new Date(value)
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}Z$/, "Z");
      xml = await (
        await dav(
          credentials,
          calendar.href,
          "REPORT",
          `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${date(range.start)}" end="${date(range.end)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`,
          { Depth: "1" },
        )
      ).text();
    }
    const events: IcsEvent[] = [];
    for (const item of responses(xml)) {
      const href = allowed(
        new URL(tag(item, "href"), calendar).href,
        credentials.url,
      ).href;
      if (!href.startsWith(calendar.href))
        throw new HttpError(502, "Calendar returned an unrelated resource");
      if (/\b404\b/.test(tag(item, "status"))) {
        events.push({
          id: href,
          title: "",
          startsAt: "",
          endsAt: "",
          timeZone: "UTC",
          deleted: true,
          calendarId: calendar.href,
        });
        continue;
      }
      let data = tag(item, "calendar-data");
      if (!data)
        data = await (
          await dav(credentials, href, "GET", undefined, {
            "Content-Type": "text/calendar",
          })
        ).text();
      for (const event of importIcs(data, "UTC"))
        events.push({
          ...event,
          id: href,
          etag: tag(item, "getetag"),
          calendarId: calendar.href,
        });
    }
    return {
      events,
      syncToken: tag(xml, "sync-token") || undefined,
      fullResync,
    };
  }
  const create = action === "createEvent";
  const event = body.event as IcsEvent | undefined;
  const resource = create
    ? new URL(
        `${encodeURIComponent(String(body.operationId || event?.id || crypto.randomUUID()))}.ics`,
        calendar.href.endsWith("/") ? calendar.href : `${calendar.href}/`,
      ).href
    : String(body.eventId || "");
  const destination = allowed(resource, credentials.url);
  if (!destination.href.startsWith(calendar.href))
    throw new HttpError(400, "Event is outside this calendar");
  if (action === "deleteEvent") {
    await dav(
      credentials,
      destination.href,
      "DELETE",
      undefined,
      body.etag ? { "If-Match": String(body.etag) } : {},
    );
    return { ok: true };
  }
  if (!event || (!create && action !== "updateEvent"))
    throw new HttpError(400, "Invalid calendar operation");
  const response = await dav(
    credentials,
    destination.href,
    "PUT",
    exportIcs([{ ...event, id: event.id || String(body.operationId) }]),
    {
      "Content-Type": "text/calendar; charset=utf-8",
      ...(create
        ? { "If-None-Match": "*" }
        : body.etag
          ? { "If-Match": String(body.etag) }
          : {}),
    },
  );
  return {
    event: {
      ...event,
      id: destination.href,
      calendarId: calendar.href,
      etag: response.headers.get("etag") || undefined,
    },
  };
}
