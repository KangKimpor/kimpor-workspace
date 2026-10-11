//#region supabase/functions/_shared/runtime.ts
var env = (name) => {
	const value = Deno.env.get(name);
	if (!value) throw new Error(`Missing server configuration: ${name}`);
	return value;
};
function serve(handler) {
	Deno.serve(async (request) => {
		const origin = request.headers.get("origin");
		const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((item) => item.trim()).filter(Boolean);
		const cors = origin && allowed.includes(origin) ? {
			"Access-Control-Allow-Origin": origin,
			Vary: "Origin",
			"Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
			"Access-Control-Allow-Methods": "GET,POST,OPTIONS"
		} : {};
		if (origin && !allowed.includes(origin)) return json({ error: "Origin is not allowed" }, 403);
		if (request.method === "OPTIONS") return new Response(null, {
			status: 204,
			headers: cors
		});
		try {
			const response = await handler(request);
			Object.entries(cors).forEach(([key, value]) => response.headers.set(key, value));
			return response;
		} catch (error) {
			const status = error instanceof HttpError ? error.status : 500;
			return json({ error: error instanceof HttpError ? error.message : "Service configuration or provider request failed" }, status, cors);
		}
	});
}
var HttpError = class extends Error {
	status;
	constructor(status, message) {
		super(message);
		this.status = status;
	}
};
function json(value, status = 200, headers = {}) {
	return new Response(JSON.stringify(value), {
		status,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
			...headers
		}
	});
}
async function readBody(request) {
	const text = await request.text();
	if (text.length > 2097152) throw new HttpError(413, "Request is too large");
	try {
		const value = JSON.parse(text);
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
		return value;
	} catch {
		throw new HttpError(400, "Invalid request body");
	}
}
async function owner(request) {
	const authorization = request.headers.get("authorization");
	if (!authorization?.startsWith("Bearer ")) throw new HttpError(401, "Sign in first");
	const response = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, {
		headers: {
			Authorization: authorization,
			apikey: env("SUPABASE_ANON_KEY")
		},
		signal: AbortSignal.timeout(15e3)
	});
	if (!response.ok) throw new HttpError(401, "Session expired. Sign in again.");
	const value = await response.json();
	if (!value.id) throw new HttpError(401, "Invalid session");
	return value.id;
}
async function database(path, options = {}) {
	const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
		...options,
		headers: {
			apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
			Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
			"Content-Type": "application/json",
			Prefer: "return=representation",
			...options.headers
		},
		signal: AbortSignal.timeout(2e4)
	});
	if (!response.ok) throw new HttpError(503, "Cloud database is waking up or unavailable");
	return response.status === 204 ? null : await response.json();
}
var encoded = (value) => encodeURIComponent(value);
async function assertCapacity(bytes = 0) {
	const value = await database("rpc/server_storage_usage", {
		method: "POST",
		body: "{}"
	});
	if (!Number.isFinite(value.databaseBytes) || !Number.isFinite(value.storageBytes) || value.databaseBytes + bytes * 3 >= 5e8 || value.storageBytes + bytes >= 1e9) throw new HttpError(507, "Cloud storage is full or capacity cannot be verified. Your local edits are safe.");
}
async function nudge(userId, cursor) {
	await fetch(`${env("SUPABASE_URL")}/realtime/v1/api/broadcast`, {
		method: "POST",
		headers: {
			apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
			Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ messages: [{
			topic: `workspace:${userId}`,
			event: "change",
			payload: { cursor: cursor || "refresh" },
			private: true
		}] }),
		signal: AbortSignal.timeout(5e3)
	}).catch(() => {});
}
//#endregion
//#region supabase/functions/_shared/credentials.ts
var encoder = new TextEncoder();
function fromBase64(value) {
	return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
function toBase64(value) {
	return btoa(String.fromCharCode(...value));
}
async function key() {
	const bytes = fromBase64(env("CREDENTIAL_ENCRYPTION_KEY"));
	if (bytes.length !== 32) throw new Error("Credential encryption key must be 32 bytes");
	return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(value, userId) {
	const iv = crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt({
		name: "AES-GCM",
		iv,
		additionalData: encoder.encode(userId)
	}, await key(), encoder.encode(JSON.stringify(value)));
	return JSON.stringify({
		v: 1,
		iv: toBase64(iv),
		data: toBase64(new Uint8Array(ciphertext))
	});
}
async function unseal(raw, userId) {
	try {
		const value = JSON.parse(raw);
		if (value.v !== 1) throw new Error();
		const plaintext = await crypto.subtle.decrypt({
			name: "AES-GCM",
			iv: fromBase64(value.iv),
			additionalData: encoder.encode(userId)
		}, await key(), fromBase64(value.data));
		return JSON.parse(new TextDecoder().decode(plaintext));
	} catch {
		throw new HttpError(500, "Stored account credentials could not be opened");
	}
}
//#endregion
//#region supabase/functions/_shared/oauth.ts
var encode64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function signingKey() {
	return crypto.subtle.importKey("raw", new TextEncoder().encode(env("OAUTH_STATE_SECRET")), {
		name: "HMAC",
		hash: "SHA-256"
	}, false, ["sign", "verify"]);
}
function callbackUrl() {
	return `${env("SUPABASE_URL")}/functions/v1/calendar-callback`;
}
async function beginCalendarOAuth(userId, provider) {
	const verifier = encode64(crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(32)));
	const challenge = encode64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
	const id = crypto.randomUUID();
	const expiresAt = Date.now() + 6e5;
	const payload = encode64(new TextEncoder().encode(JSON.stringify({
		id,
		provider,
		expiresAt
	})));
	const signature = encode64(new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(), new TextEncoder().encode(payload))));
	await database("calendar_oauth_requests", {
		method: "POST",
		body: JSON.stringify({
			id,
			user_id: userId,
			provider,
			encrypted_verifier: await seal({ verifier }, userId),
			expires_at: new Date(expiresAt).toISOString()
		})
	});
	const url = new URL(provider === "google" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
	url.search = new URLSearchParams({
		client_id: env(provider === "google" ? "GOOGLE_CLIENT_ID" : "OUTLOOK_CLIENT_ID"),
		redirect_uri: callbackUrl(),
		response_type: "code",
		scope: provider === "google" ? "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly" : "openid email profile offline_access https://graph.microsoft.com/Calendars.ReadWrite",
		state: `${payload}.${signature}`,
		code_challenge: challenge,
		code_challenge_method: "S256",
		...provider === "google" ? {
			access_type: "offline",
			prompt: "consent select_account"
		} : { prompt: "select_account" }
	}).toString();
	return url.href;
}
async function exchange(provider, params) {
	const response = await fetch(provider === "google" ? "https://oauth2.googleapis.com/token" : "https://login.microsoftonline.com/common/oauth2/v2.0/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			...params,
			client_id: env(provider === "google" ? "GOOGLE_CLIENT_ID" : "OUTLOOK_CLIENT_ID"),
			client_secret: env(provider === "google" ? "GOOGLE_CLIENT_SECRET" : "OUTLOOK_CLIENT_SECRET")
		}),
		signal: AbortSignal.timeout(2e4)
	});
	const value = await response.json();
	if (!response.ok || !value.access_token) throw new HttpError(401, "Calendar authorization expired or was declined. Reconnect this account.");
	return {
		...value,
		expiresAt: Date.now() + Number(value.expires_in || 3600) * 1e3
	};
}
async function accessToken(account) {
	const tokens = await unseal(account.encrypted_credentials, account.user_id);
	if (tokens.expiresAt > Date.now() + 6e4) return tokens.access_token;
	if (!tokens.refresh_token) throw new HttpError(401, "Reconnect this calendar account");
	try {
		const refreshed = await exchange(account.provider, {
			grant_type: "refresh_token",
			refresh_token: tokens.refresh_token
		});
		const next = {
			...tokens,
			...refreshed,
			refresh_token: refreshed.refresh_token || tokens.refresh_token
		};
		await database(`connected_accounts?id=eq.${encoded(account.id)}&user_id=eq.${encoded(account.user_id)}`, {
			method: "PATCH",
			body: JSON.stringify({
				encrypted_credentials: await seal(next, account.user_id),
				status: "connected"
			})
		});
		return next.access_token;
	} catch (error) {
		await database(`connected_accounts?id=eq.${encoded(account.id)}&user_id=eq.${encoded(account.user_id)}`, {
			method: "PATCH",
			body: "{\"status\":\"needs_attention\"}"
		});
		throw error;
	}
}
//#endregion
//#region packages/integrations/src/calendar-time.ts
var DAY$1 = 864e5;
var formatters = /* @__PURE__ */ new Map();
function validTimeZone(zone) {
	try {
		new Intl.DateTimeFormat("en", { timeZone: zone }).format();
		return true;
	} catch {
		return false;
	}
}
function wallTime(instant, zone) {
	if (!validTimeZone(zone)) throw new Error(`Unknown time zone: ${zone}`);
	let formatter = formatters.get(zone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat("en-CA", {
			timeZone: zone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23"
		});
		formatters.set(zone, formatter);
	}
	const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
	return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
function pseudoUtc(wall) {
	const normalized = wall.length === 10 ? `${wall}T00:00:00` : wall;
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(normalized)) throw new Error("Use an ISO local date or date and time.");
	const result = Date.parse(`${normalized}Z`);
	if (!Number.isFinite(result) || new Date(result).toISOString().slice(0, 16) !== normalized.slice(0, 16)) throw new Error("Invalid date or time.");
	return result;
}
/** Compatible DST disambiguation: earlier instant in a fold, forward across a gap. */
function wallTimeToUtc(local, zone) {
	const wanted = pseudoUtc(local);
	if (!validTimeZone(zone)) throw new Error(`Unknown time zone: ${zone}`);
	const offsets = /* @__PURE__ */ new Set();
	for (const hours of [
		-36,
		-12,
		0,
		12,
		36
	]) {
		const sample = wanted + hours * 36e5;
		offsets.add(pseudoUtc(wallTime(new Date(sample), zone)) - sample);
	}
	const candidates = [...offsets].map((offset) => wanted - offset).sort((a, b) => a - b);
	const exact = candidates.find((candidate) => pseudoUtc(wallTime(new Date(candidate), zone)) === wanted);
	const forward = candidates.filter((candidate) => pseudoUtc(wallTime(new Date(candidate), zone)) > wanted).sort((a, b) => pseudoUtc(wallTime(new Date(a), zone)) - pseudoUtc(wallTime(new Date(b), zone)))[0];
	if (exact === void 0 && forward === void 0) throw new Error("This local time cannot be represented.");
	return new Date(exact ?? forward).toISOString();
}
function addDays(date, count) {
	return new Date(pseudoUtc(date) + count * DAY$1).toISOString().slice(0, 10);
}
//#endregion
//#region packages/integrations/src/ics.ts
var DAY = 864e5;
function escapeIcs(value) {
	return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}
function unescapeIcs(value) {
	return value.replace(/\\([nN,;\\])/g, (_match, char) => /n/i.test(char) ? "\n" : char);
}
function foldIcs(line) {
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
function icsDate(value) {
	return value.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function exportIcs(events, name = "Kimpor Workspace") {
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Kimpor Workspace//Calendar//EN",
		"CALSCALE:GREGORIAN",
		`X-WR-CALNAME:${escapeIcs(name)}`
	];
	for (const event of events.filter((e) => !e.deleted)) {
		const allDay = event.allDay || event.startsAt.length === 10;
		const dateLine = (name, value, zone) => allDay ? `${name};VALUE=DATE:${icsDate(value)}` : `${name};TZID=${zone}:${icsDate(wallTime(value, zone))}`;
		lines.push("BEGIN:VEVENT", `UID:${escapeIcs(event.id)}`, `DTSTAMP:${icsDate((/* @__PURE__ */ new Date()).toISOString())}`, dateLine("DTSTART", event.startsAt, event.timeZone), dateLine("DTEND", event.endsAt, event.endTimeZone ?? event.timeZone), `SUMMARY:${escapeIcs(event.title)}`);
		if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
		if (event.notes) lines.push(`DESCRIPTION:${escapeIcs(event.notes)}`);
		if (event.url) lines.push(`URL:${escapeIcs(event.url)}`);
		lines.push(`TRANSP:${event.busy === false ? "TRANSPARENT" : "OPAQUE"}`);
		if (event.recurrence) lines.push(`RRULE:${safeIcsRecurrence(event.recurrence)}`);
		if (event.exceptions?.length) lines.push(allDay ? `EXDATE;VALUE=DATE:${event.exceptions.map(icsDate).join(",")}` : `EXDATE:${event.exceptions.map((value) => icsDate(new Date(value).toISOString())).join(",")}`);
		if (event.recurrenceId) lines.push(dateLine("RECURRENCE-ID", event.recurrenceId, event.timeZone));
		if (event.reminderMinutes && event.reminderMinutes > 0) lines.push("BEGIN:VALARM", `TRIGGER:-PT${Math.trunc(event.reminderMinutes)}M`, "ACTION:DISPLAY", `DESCRIPTION:${escapeIcs(event.title)}`, "END:VALARM");
		lines.push("END:VEVENT");
	}
	return [...lines, "END:VCALENDAR"].map(foldIcs).join("\r\n") + "\r\n";
}
function parseProperty(line) {
	let separator = -1;
	let quoted = false;
	for (let index = 0; index < line.length; index++) if (line[index] === "\"") quoted = !quoted;
	else if (line[index] === ":" && !quoted) {
		separator = index;
		break;
	}
	if (separator < 0) return null;
	const [name, ...rawParams] = line.slice(0, separator).split(";");
	const params = Object.fromEntries(rawParams.map((part) => {
		const index = part.indexOf("=");
		return [part.slice(0, index).toUpperCase(), part.slice(index + 1).replace(/^"|"$/g, "")];
	}));
	return {
		name: name.toUpperCase(),
		params,
		value: line.slice(separator + 1)
	};
}
function parseIcsDate(property, defaultZone) {
	const raw = property.value;
	const allDay = property.params.VALUE === "DATE" || /^\d{8}$/.test(raw);
	const zone = property.params.TZID ?? defaultZone;
	if (!validTimeZone(zone)) throw new Error(`Unsupported calendar time zone: ${zone}`);
	const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(raw);
	if (!match || !allDay && !match[4]) throw new Error("Invalid ICS date.");
	const date = `${match[1]}-${match[2]}-${match[3]}`;
	pseudoUtc(date);
	if (allDay) return {
		value: date,
		allDay,
		zone
	};
	const local = `${date}T${match[4]}:${match[5]}:${match[6] ?? "00"}`;
	return {
		value: match[7] ? new Date(pseudoUtc(local)).toISOString() : wallTimeToUtc(local, zone),
		allDay,
		zone: match[7] ? "UTC" : zone
	};
}
/** Read an RFC 5545 EXDATE line, including date-only and TZID values. */
function parseIcsExceptions(line, defaultZone) {
	const property = parseProperty(line);
	if (!property || property.name !== "EXDATE") return [];
	return property.value.split(",").map((value) => parseIcsDate({
		...property,
		value
	}, defaultZone).value);
}
function importIcs(input, defaultZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
	if (new TextEncoder().encode(input).length > 5e6) throw new Error("ICS import is limited to 5 MB.");
	if (!/^BEGIN:VCALENDAR\s*$/im.test(input)) throw new Error("This file is not an iCalendar calendar.");
	const lines = input.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
	const events = [];
	let properties = null;
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
			if (property && (!alarm || property.name === "TRIGGER")) properties.push(property);
			continue;
		}
		const find = (name) => properties.find((property) => property.name === name);
		const first = find("DTSTART");
		if (!first) throw new Error("An event is missing DTSTART.");
		const start = parseIcsDate(first, defaultZone);
		const endProperty = find("DTEND");
		const duration = find("DURATION")?.value.match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
		const durationMs = duration ? (Number(duration[1] ?? 0) * 7 + Number(duration[2] ?? 0)) * DAY + Number(duration[3] ?? 0) * 36e5 + Number(duration[4] ?? 0) * 6e4 + Number(duration[5] ?? 0) * 1e3 : start.allDay ? DAY : 36e5;
		const end = endProperty ? parseIcsDate(endProperty, start.zone) : {
			...start,
			value: start.allDay ? addDays(start.value, durationMs / DAY) : new Date(Date.parse(start.value) + durationMs).toISOString()
		};
		if (end.allDay !== start.allDay || Date.parse(end.value) <= Date.parse(start.value)) throw new Error("An event has an invalid end date.");
		const recurrenceId = find("RECURRENCE-ID");
		const uid = unescapeIcs(find("UID")?.value ?? crypto.randomUUID());
		const exceptions = properties.filter((property) => property.name === "EXDATE").flatMap((property) => property.value.split(",").map((value) => parseIcsDate({
			...property,
			value
		}, start.zone).value));
		const reminder = find("TRIGGER")?.value.match(/^-PT(?:(\d+)H)?(?:(\d+)M)?$/);
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
			reminderMinutes: reminder ? Number(reminder[1] ?? 0) * 60 + Number(reminder[2] ?? 0) : 0,
			recurrence: safeIcsRecurrence(find("RRULE")?.value ?? ""),
			exceptions,
			recurrenceId: recurrenceId ? parseIcsDate(recurrenceId, start.zone).value : void 0
		});
		if (events.length > 1e4) throw new Error("ICS import is limited to 10,000 events.");
		properties = null;
	}
	if (properties) throw new Error("An ICS event is incomplete.");
	for (const override of events.filter((event) => event.recurrenceId)) {
		const parent = events.find((event) => event.id === override.id && !event.recurrenceId);
		if (parent) parent.exceptions = [.../* @__PURE__ */ new Set([...parent.exceptions ?? [], override.recurrenceId])];
	}
	return events;
}
function safeIcsRecurrence(value) {
	const result = value.trim().replace(/^RRULE:/i, "").toUpperCase();
	if (result && (result.length > 2e3 || !/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY|HOURLY|MINUTELY|SECONDLY)(;[A-Z]+=[A-Z0-9,+-]+)*$/.test(result))) throw new Error("Invalid recurrence rule.");
	return result;
}
//#endregion
//#region supabase/functions/_shared/calendar-api.ts
function object(value) {
	return value && typeof value === "object" ? value : {};
}
function string(value, fallback = "") {
	return typeof value === "string" ? value : fallback;
}
async function api(url, token, options = {}) {
	const response = await fetch(url, {
		...options,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			...options.headers
		},
		signal: AbortSignal.timeout(25e3)
	});
	if (!response.ok) throw new HttpError(response.status, response.status === 410 ? "Calendar sync cursor expired" : response.status === 412 ? "Calendar changed on another device. Refetch before saving." : response.status === 401 ? "Reconnect this calendar account" : "Calendar provider request failed");
	return response.status === 204 ? {} : await response.json();
}
function eventFromGoogle(raw, calendarId) {
	const start = object(raw.start), end = object(raw.end);
	const allDay = !!start.date;
	const recurrence = Array.isArray(raw.recurrence) ? raw.recurrence.map((value) => string(value)) : [];
	const reminders = object(raw.reminders);
	const override = Array.isArray(reminders.overrides) ? object(reminders.overrides[0]) : {};
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
		recurrence: recurrence.find((line) => line.startsWith("RRULE:"))?.slice(6) || "",
		exceptions: recurrence.flatMap((line) => parseIcsExceptions(line, string(start.timeZone, "UTC"))),
		...raw.originalStartTime ? { recurrenceId: string(object(raw.originalStartTime).date || object(raw.originalStartTime).dateTime) } : {}
	};
}
function googleEvent(event, operationId) {
	const allDay = event.allDay === true;
	const start = string(event.startsAt), end = string(event.endsAt);
	const recurrence = [];
	if (event.recurrence) recurrence.push(`RRULE:${string(event.recurrence).replace(/^RRULE:/, "")}`);
	if (Array.isArray(event.exceptions) && event.exceptions.length) {
		const exceptions = event.exceptions.map((value) => {
			const date = string(value);
			if (allDay) {
				if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) throw new HttpError(400, "Invalid recurrence exception date");
				return date.replace(/-/g, "");
			}
			if (!Number.isFinite(Date.parse(date))) throw new HttpError(400, "Invalid recurrence exception time");
			return new Date(date).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
		});
		recurrence.push(`EXDATE${allDay ? ";VALUE=DATE" : ""}:${exceptions.join(",")}`);
	}
	return {
		...operationId ? { id: operationId.toLowerCase().replace(/[^a-v0-9]/g, "") } : {},
		summary: string(event.title),
		start: allDay ? { date: start } : {
			dateTime: start,
			timeZone: string(event.timeZone, "UTC")
		},
		end: allDay ? { date: end } : {
			dateTime: end,
			timeZone: string(event.endTimeZone || event.timeZone, "UTC")
		},
		location: string(event.location),
		description: string(event.notes),
		transparency: event.busy === false ? "transparent" : "opaque",
		reminders: {
			useDefault: false,
			overrides: Number(event.reminderMinutes) > 0 ? [{
				method: "popup",
				minutes: Number(event.reminderMinutes)
			}] : []
		},
		...recurrence.length ? { recurrence } : {}
	};
}
async function googleAction(token, body) {
	const action = string(body.action);
	const calendarId = string(body.calendarId);
	const base = "https://www.googleapis.com/calendar/v3";
	if (action === "listCalendars") {
		const result = await api(`${base}/users/me/calendarList?maxResults=250`, token);
		return { calendars: (Array.isArray(result.items) ? result.items : []).map((value) => {
			const item = object(value);
			return {
				id: item.id,
				title: item.summary,
				color: item.backgroundColor,
				readOnly: item.accessRole === "reader" || item.accessRole === "freeBusyReader"
			};
		}) };
	}
	if (!calendarId) throw new HttpError(400, "Choose a calendar");
	const eventsUrl = `${base}/calendars/${encodeURIComponent(calendarId)}/events`;
	if (action === "listEvents") {
		const range = object(body.range);
		const params = new URLSearchParams({
			maxResults: "2500",
			showDeleted: "true",
			singleEvents: "false"
		});
		if (body.syncToken) params.set("syncToken", string(body.syncToken));
		else {
			params.set("timeMin", string(range.start));
			params.set("timeMax", string(range.end));
		}
		const events = [];
		let syncToken;
		let pageToken = "";
		let fullResync = false;
		for (let page = 0; page < 20; page++) {
			if (pageToken) params.set("pageToken", pageToken);
			let result;
			try {
				result = await api(`${eventsUrl}?${params}`, token);
			} catch (error) {
				if (error instanceof HttpError && error.status === 410 && body.syncToken) {
					params.delete("syncToken");
					params.set("timeMin", string(range.start));
					params.set("timeMax", string(range.end));
					params.delete("pageToken");
					events.length = 0;
					pageToken = "";
					fullResync = true;
					body.syncToken = void 0;
					page = -1;
					continue;
				}
				throw error;
			}
			for (const raw of Array.isArray(result.items) ? result.items : []) events.push(eventFromGoogle(object(raw), calendarId));
			syncToken = typeof result.nextSyncToken === "string" ? result.nextSyncToken : syncToken;
			pageToken = string(result.nextPageToken);
			if (!pageToken) return {
				events,
				syncToken,
				fullResync
			};
		}
		throw new HttpError(413, "Calendar has too many events in this range");
	}
	if (action === "deleteEvent") {
		await api(`${eventsUrl}/${encodeURIComponent(string(body.eventId))}`, token, {
			method: "DELETE",
			headers: body.etag ? { "If-Match": string(body.etag) } : {}
		});
		return { ok: true };
	}
	const create = action === "createEvent";
	if (!create && action !== "updateEvent") throw new HttpError(400, "Unknown calendar operation");
	const payload = googleEvent(object(body.event), create ? string(body.operationId) || void 0 : void 0);
	try {
		return { event: eventFromGoogle(await api(create ? eventsUrl : `${eventsUrl}/${encodeURIComponent(string(body.eventId))}`, token, {
			method: create ? "POST" : "PUT",
			headers: body.etag ? { "If-Match": string(body.etag) } : {},
			body: JSON.stringify(payload)
		}), calendarId) };
	} catch (error) {
		if (create && error instanceof HttpError && error.status === 409 && payload.id) return { event: eventFromGoogle(await api(`${eventsUrl}/${payload.id}`, token), calendarId) };
		throw error;
	}
}
function graphDate(raw) {
	const date = object(raw);
	const value = string(date.dateTime);
	return {
		value: /Z$|[+-]\d{2}:\d{2}$/.test(value) ? new Date(value).toISOString() : (/* @__PURE__ */ new Date(`${value}Z`)).toISOString(),
		zone: string(date.timeZone, "UTC")
	};
}
function outlookRecurrence(raw) {
	const item = object(raw), pattern = object(item.pattern), range = object(item.range);
	const type = string(pattern.type);
	const freq = type.toLowerCase().includes("daily") ? "DAILY" : type.toLowerCase().includes("weekly") ? "WEEKLY" : type.toLowerCase().includes("monthly") ? "MONTHLY" : type.toLowerCase().includes("yearly") ? "YEARLY" : "";
	if (!freq) return "";
	const parts = [`FREQ=${freq}`, `INTERVAL=${Number(pattern.interval || 1)}`];
	if (Array.isArray(pattern.daysOfWeek)) parts.push(`BYDAY=${pattern.daysOfWeek.map((day) => ({
		sunday: "SU",
		monday: "MO",
		tuesday: "TU",
		wednesday: "WE",
		thursday: "TH",
		friday: "FR",
		saturday: "SA"
	})[string(day)] || "").join(",")}`);
	if (pattern.dayOfMonth) parts.push(`BYMONTHDAY=${pattern.dayOfMonth}`);
	if (pattern.month) parts.push(`BYMONTH=${pattern.month}`);
	if (range.type === "numbered") parts.push(`COUNT=${range.numberOfOccurrences}`);
	if (range.type === "endDate") parts.push(`UNTIL=${string(range.endDate).replace(/-/g, "")}T235959Z`);
	return parts.join(";");
}
function eventFromOutlook(raw, calendarId) {
	if (raw["@removed"]) return {
		id: string(raw.id),
		title: "",
		startsAt: "",
		endsAt: "",
		timeZone: "UTC",
		calendarId,
		deleted: true
	};
	const start = graphDate(raw.start), end = graphDate(raw.end);
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
		reminderMinutes: raw.isReminderOn ? Number(raw.reminderMinutesBeforeStart) : 0,
		recurrence: outlookRecurrence(raw.recurrence),
		calendarId
	};
}
async function outlookAction(token, body) {
	const action = string(body.action), calendarId = string(body.calendarId);
	const base = "https://graph.microsoft.com/v1.0/me";
	if (action === "listCalendars") {
		const result = await api(`${base}/calendars?$top=100`, token);
		return { calendars: (Array.isArray(result.value) ? result.value : []).map((value) => {
			const item = object(value);
			return {
				id: item.id,
				title: item.name,
				color: item.hexColor || "#2268bf",
				readOnly: item.canEdit === false
			};
		}) };
	}
	if (!calendarId) throw new HttpError(400, "Choose a calendar");
	const calendarUrl = `${base}/calendars/${encodeURIComponent(calendarId)}`;
	if (action === "listEvents") {
		const range = object(body.range);
		let url = body.syncToken ? string(body.syncToken) : `${calendarUrl}/calendarView/delta?startDateTime=${encodeURIComponent(string(range.start))}&endDateTime=${encodeURIComponent(string(range.end))}`;
		const events = [];
		for (let page = 0; page < 20; page++) {
			const parsed = new URL(url);
			if (parsed.origin !== "https://graph.microsoft.com" || !parsed.pathname.startsWith("/v1.0/me/")) throw new HttpError(400, "Invalid Outlook sync cursor");
			let result;
			try {
				result = await api(url, token, { headers: { Prefer: "outlook.timezone=\"UTC\"" } });
			} catch (error) {
				if (error instanceof HttpError && error.status === 410 && body.syncToken) return outlookAction(token, {
					...body,
					syncToken: void 0
				});
				throw error;
			}
			for (const item of Array.isArray(result.value) ? result.value : []) events.push(eventFromOutlook(object(item), calendarId));
			if (!result["@odata.nextLink"]) return {
				events,
				syncToken: result["@odata.deltaLink"]
			};
			url = string(result["@odata.nextLink"]);
		}
		throw new HttpError(413, "Calendar has too many events");
	}
	const eventUrl = `${calendarUrl}/events/${encodeURIComponent(string(body.eventId))}`;
	if (action === "deleteEvent") {
		await api(eventUrl, token, {
			method: "DELETE",
			headers: body.etag ? { "If-Match": string(body.etag) } : {}
		});
		return { ok: true };
	}
	const event = object(body.event);
	const create = action === "createEvent";
	if (!create && action !== "updateEvent") throw new HttpError(400, "Unknown calendar operation");
	const payload = {
		subject: string(event.title),
		start: {
			dateTime: string(event.startsAt).replace(/Z$/, ""),
			timeZone: "UTC"
		},
		end: {
			dateTime: string(event.endsAt).replace(/Z$/, ""),
			timeZone: "UTC"
		},
		isAllDay: event.allDay === true,
		location: { displayName: string(event.location) },
		body: {
			contentType: "text",
			content: string(event.notes)
		},
		showAs: event.busy === false ? "free" : "busy",
		isReminderOn: Number(event.reminderMinutes) > 0,
		reminderMinutesBeforeStart: Number(event.reminderMinutes || 0),
		...create && body.operationId ? { transactionId: string(body.operationId) } : {}
	};
	if (event.recurrence) throw new HttpError(422, "Outlook recurring event edits must currently be made in Outlook. Local and Google recurrence remain available.");
	return { event: eventFromOutlook(await api(create ? `${calendarUrl}/events` : eventUrl, token, {
		method: create ? "POST" : "PATCH",
		headers: body.etag ? { "If-Match": string(body.etag) } : {},
		body: JSON.stringify(payload)
	}), calendarId) };
}
//#endregion
//#region supabase/functions/_shared/network.ts
function safeRemoteUrl(raw, allowedHosts) {
	const url = new URL(raw.replace(/^webcal:/i, "https:"));
	const host = url.hostname.toLowerCase();
	if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443" || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(host) || !host.includes(".") || allowedHosts && !allowedHosts.includes(host)) throw new HttpError(400, "Use a public HTTPS calendar address");
	return url;
}
async function fetchPublic(raw, options = {}, maxBytes = 5e6) {
	let url = safeRemoteUrl(raw);
	for (let attempt = 0; attempt < 4; attempt++) {
		for (const type of ["A", "AAAA"]) {
			const dns = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(url.hostname)}&type=${type}`, {
				headers: { Accept: "application/dns-json" },
				signal: AbortSignal.timeout(1e4)
			});
			if (!dns.ok) throw new HttpError(502, "Calendar DNS could not be verified");
			const result = await dns.json();
			if (result.Status !== 0 && result.Status !== 3) throw new HttpError(502, "Calendar DNS could not be verified");
			for (const answer of result.Answer || []) if ((answer.type === 1 || answer.type === 28) && isPrivateAddress(answer.data)) throw new HttpError(400, "Private calendar servers are not permitted");
		}
		const response = await fetch(url.href, {
			...options,
			redirect: "manual",
			signal: AbortSignal.timeout(25e3)
		});
		if ([
			301,
			302,
			303,
			307,
			308
		].includes(response.status)) {
			const next = safeRemoteUrl(new URL(response.headers.get("location") || "", url).href);
			if (next.origin !== url.origin && options.headers) throw new HttpError(400, "Authenticated calendar redirected to another host");
			url = next;
			continue;
		}
		if (Number(response.headers.get("content-length") || "0") > maxBytes) throw new HttpError(413, "Calendar response exceeds the size limit");
		const reader = response.body?.getReader();
		if (!reader) return response;
		const chunks = [];
		let size = 0;
		while (true) {
			const item = await reader.read();
			if (item.done) break;
			size += item.value.length;
			if (size > maxBytes) {
				await reader.cancel();
				throw new HttpError(413, "Calendar response exceeds the size limit");
			}
			chunks.push(item.value);
		}
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.length;
		}
		return new Response(bytes, {
			status: response.status,
			headers: response.headers
		});
	}
	throw new HttpError(502, "Calendar redirected too many times");
}
function isPrivateAddress(raw) {
	const ip = raw.toLowerCase();
	if (ip.includes(":")) return ip === "::" || ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || /^fe[89ab]/.test(ip) || ip.startsWith("ff") || ip.startsWith("::ffff:");
	const parts = ip.split(".").map(Number);
	const a = parts[0], b = parts[1];
	return a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19) || a === 198 && b === 51 || a === 203 && b === 0;
}
//#endregion
//#region supabase/functions/_shared/caldav.ts
var escape = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
var decode = (value) => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
function tag(xml, name) {
	return decode(new RegExp(`<(?:(?:[\\w-]+):)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w-]+):)?${name}>`, "i").exec(xml)?.[1]?.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1") || "");
}
function responses(xml) {
	if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new HttpError(502, "Unsupported calendar XML");
	return xml.match(/<(?:(?:[\w-]+):)?response\b[^>]*>[\s\S]*?<\/(?:(?:[\w-]+):)?response>/gi) || [];
}
function allowed(raw, original) {
	const url = safeRemoteUrl(raw);
	const initial = safeRemoteUrl(original);
	const configured = env("CALENDAR_ALLOWED_HOSTS").split(",").map((value) => value.trim().toLowerCase());
	const apple = initial.hostname === "caldav.icloud.com" && /^(?:p\d+-)?caldav\.icloud\.com$/.test(url.hostname);
	if (url.origin !== initial.origin && !apple) throw new HttpError(400, "Calendar discovery changed server unexpectedly");
	if (!configured.includes(url.hostname) && !apple) throw new HttpError(400, "Calendar server is not in the configured public host allowlist");
	return url;
}
async function dav(credentials, url, method, body, headers = {}) {
	const destination = allowed(url, credentials.url);
	const auth = btoa(String.fromCharCode(...new TextEncoder().encode(`${credentials.username}:${credentials.password}`)));
	const response = await fetchPublic(destination.href, {
		method,
		headers: {
			Authorization: `Basic ${auth}`,
			"Content-Type": "application/xml; charset=utf-8",
			...headers
		},
		...body ? { body } : {}
	});
	if (!response.ok && response.status !== 207) throw new HttpError(response.status, response.status === 412 ? "Calendar changed remotely. Refetch before saving." : "CalDAV server request failed. Check the address and app-specific password.");
	return response;
}
async function discoverCalDav(credentials) {
	const principalXml = await (await dav(credentials, credentials.url, "PROPFIND", "<d:propfind xmlns:d=\"DAV:\"><d:prop><d:current-user-principal/></d:prop></d:propfind>", { Depth: "0" })).text();
	responses(principalXml);
	const principal = tag(tag(principalXml, "current-user-principal"), "href");
	if (!principal) throw new HttpError(502, "CalDAV principal discovery failed");
	const principalUrl = allowed(new URL(principal, credentials.url).href, credentials.url).href;
	const homeXml = await (await dav(credentials, principalUrl, "PROPFIND", "<d:propfind xmlns:d=\"DAV:\" xmlns:c=\"urn:ietf:params:xml:ns:caldav\"><d:prop><c:calendar-home-set/></d:prop></d:propfind>", { Depth: "0" })).text();
	responses(homeXml);
	const home = tag(tag(homeXml, "calendar-home-set"), "href");
	if (!home) throw new HttpError(502, "CalDAV home discovery failed");
	return {
		...credentials,
		calendarHome: allowed(new URL(home, principalUrl).href, credentials.url).href
	};
}
async function caldavAction(credentials, body) {
	const action = String(body.action);
	const home = credentials.calendarHome || credentials.url;
	if (action === "listCalendars") return { calendars: responses(await (await dav(credentials, home, "PROPFIND", "<d:propfind xmlns:d=\"DAV:\" xmlns:a=\"http://apple.com/ns/ical/\"><d:prop><d:displayname/><d:resourcetype/><a:calendar-color/><d:current-user-privilege-set/></d:prop></d:propfind>", { Depth: "1" })).text()).filter((item) => /<(?:[\w-]+:)?calendar(?:\s|\/|>)/i.test(tag(item, "resourcetype"))).map((item) => ({
		id: allowed(new URL(tag(item, "href"), home).href, credentials.url).href,
		title: tag(item, "displayname") || "Calendar",
		color: tag(item, "calendar-color").slice(0, 7) || "#2268bf",
		readOnly: !/<(?:[\w-]+:)?write(?:\s|\/|>)/i.test(tag(item, "current-user-privilege-set"))
	})) };
	const calendar = allowed(String(body.calendarId || ""), credentials.url);
	if (!calendar.href.startsWith(home)) throw new HttpError(400, "Calendar is outside this account home");
	if (action === "listEvents") {
		const range = body.range;
		let xml;
		let fullResync = false;
		if (body.syncToken) try {
			xml = await (await dav(credentials, calendar.href, "REPORT", `<d:sync-collection xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:sync-token>${escape(String(body.syncToken))}</d:sync-token><d:sync-level>1</d:sync-level><d:prop><d:getetag/><c:calendar-data/></d:prop></d:sync-collection>`, { Depth: "1" })).text();
		} catch (error) {
			if (error instanceof HttpError && [
				403,
				409,
				410,
				501
			].includes(error.status)) {
				fullResync = true;
				xml = "";
			} else throw error;
		}
		else xml = "";
		if (!xml) {
			const date = (value) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
			xml = await (await dav(credentials, calendar.href, "REPORT", `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${date(range.start)}" end="${date(range.end)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`, { Depth: "1" })).text();
		}
		const events = [];
		for (const item of responses(xml)) {
			const href = allowed(new URL(tag(item, "href"), calendar).href, credentials.url).href;
			if (!href.startsWith(calendar.href)) throw new HttpError(502, "Calendar returned an unrelated resource");
			if (/\b404\b/.test(tag(item, "status"))) {
				events.push({
					id: href,
					title: "",
					startsAt: "",
					endsAt: "",
					timeZone: "UTC",
					deleted: true,
					calendarId: calendar.href
				});
				continue;
			}
			let data = tag(item, "calendar-data");
			if (!data) data = await (await dav(credentials, href, "GET", void 0, { "Content-Type": "text/calendar" })).text();
			for (const event of importIcs(data, "UTC")) events.push({
				...event,
				id: href,
				etag: tag(item, "getetag"),
				calendarId: calendar.href
			});
		}
		return {
			events,
			syncToken: tag(xml, "sync-token") || void 0,
			fullResync
		};
	}
	const create = action === "createEvent";
	const event = body.event;
	const destination = allowed(create ? new URL(`${encodeURIComponent(String(body.operationId || event?.id || crypto.randomUUID()))}.ics`, calendar.href.endsWith("/") ? calendar.href : `${calendar.href}/`).href : String(body.eventId || ""), credentials.url);
	if (!destination.href.startsWith(calendar.href)) throw new HttpError(400, "Event is outside this calendar");
	if (action === "deleteEvent") {
		await dav(credentials, destination.href, "DELETE", void 0, body.etag ? { "If-Match": String(body.etag) } : {});
		return { ok: true };
	}
	if (!event || !create && action !== "updateEvent") throw new HttpError(400, "Invalid calendar operation");
	const response = await dav(credentials, destination.href, "PUT", exportIcs([{
		...event,
		id: event.id || String(body.operationId)
	}]), {
		"Content-Type": "text/calendar; charset=utf-8",
		...create ? { "If-None-Match": "*" } : body.etag ? { "If-Match": String(body.etag) } : {}
	});
	return { event: {
		...event,
		id: destination.href,
		calendarId: calendar.href,
		etag: response.headers.get("etag") || void 0
	} };
}
//#endregion
//#region supabase/functions/_shared/calendar-service.ts
async function revokeCalendarAccount(account) {
	if (account.provider !== "google") return false;
	try {
		const token = await unseal(account.encrypted_credentials, account.user_id);
		const response = await fetch("https://oauth2.googleapis.com/revoke", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ token: token.refresh_token || token.access_token }),
			signal: AbortSignal.timeout(15e3)
		});
		return response.ok || response.status === 400;
	} catch {
		return false;
	}
}
//#endregion
//#region supabase/functions/calendar-proxy/index.ts
serve(async (request) => {
	if (request.method !== "POST") throw new HttpError(405, "Use POST");
	const userId = await owner(request);
	const body = await readBody(request);
	const action = String(body.action || "");
	if (action === "accounts") return json({ accounts: (await database(`connected_accounts?user_id=eq.${encoded(userId)}&select=id,provider,label,status,last_sync_at`)).map((account) => ({
		id: account.id,
		provider: account.provider,
		label: account.label,
		status: account.status,
		lastSyncAt: account.last_sync_at
	})) });
	if (action === "connect") {
		await assertCapacity(4096);
		const provider = String(body.provider);
		if (provider === "google" || provider === "outlook") return json({ url: await beginCalendarOAuth(userId, provider) });
		let credentials;
		if (provider === "caldav") {
			if (!body.username || !body.password) throw new HttpError(400, "Enter username and an app-specific password");
			credentials = await discoverCalDav({
				url: safeRemoteUrl(String(body.url)).href,
				username: String(body.username),
				password: String(body.password)
			});
		} else if (provider === "ics") {
			const url = safeRemoteUrl(String(body.url), env("CALENDAR_ALLOWED_HOSTS").split(",").map((value) => value.trim())).href;
			const response = await fetchPublic(url);
			if (!response.ok) throw new HttpError(502, "Subscription could not be downloaded");
			importIcs(await response.text(), "UTC");
			credentials = { url };
		} else throw new HttpError(400, "Unknown calendar provider");
		const accounts = await database("connected_accounts", {
			method: "POST",
			body: JSON.stringify({
				user_id: userId,
				provider,
				label: String(body.label || `${provider === "ics" ? "Calendar subscription" : "CalDAV account"}`),
				encrypted_credentials: await seal(credentials, userId)
			})
		});
		await nudge(userId);
		return json({ accountId: accounts[0]?.id });
	}
	const account = (await database(`connected_accounts?id=eq.${encoded(String(body.accountId))}&user_id=eq.${encoded(userId)}`))[0];
	if (!account) throw new HttpError(404, "Calendar account was not found");
	if (body.provider && body.provider !== account.provider) throw new HttpError(400, "Calendar provider does not match account");
	if (action === "disconnect") {
		const revoked = await revokeCalendarAccount(account);
		await database(`connected_accounts?id=eq.${encoded(account.id)}&user_id=eq.${encoded(userId)}`, { method: "DELETE" });
		await nudge(userId);
		return json({
			ok: true,
			providerRevoked: revoked
		});
	}
	if (action === "listEvents") {
		const range = body.range;
		const start = Date.parse(range?.start || ""), end = Date.parse(range?.end || "");
		if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 31968e6) throw new HttpError(400, "Use an event range of at most 370 days");
	}
	let result;
	if (account.provider === "google") result = await googleAction(await accessToken(account), body);
	else if (account.provider === "outlook") result = await outlookAction(await accessToken(account), body);
	else if (account.provider === "caldav") result = await caldavAction(await unseal(account.encrypted_credentials, userId), body);
	else if (action === "listCalendars") result = { calendars: [{
		id: account.id,
		title: account.label,
		color: "#2268bf",
		readOnly: true
	}] };
	else if (action === "listEvents") {
		const { url } = await unseal(account.encrypted_credentials, userId);
		const response = await fetchPublic(url);
		if (!response.ok) throw new HttpError(502, "Calendar subscription is temporarily unavailable");
		result = {
			events: importIcs(await response.text(), "UTC"),
			fullResync: true
		};
	} else throw new HttpError(403, "Calendar subscriptions are read-only");
	await database(`connected_accounts?id=eq.${encoded(account.id)}&user_id=eq.${encoded(userId)}`, {
		method: "PATCH",
		body: JSON.stringify({
			last_sync_at: (/* @__PURE__ */ new Date()).toISOString(),
			status: "connected"
		})
	});
	return json(result);
});
//#endregion
