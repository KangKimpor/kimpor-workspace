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
//#endregion
//#region supabase/functions/push-register/index.ts
var allowed = (hostname) => hostname === "fcm.googleapis.com" || hostname === "updates.push.services.mozilla.com" || hostname === "web.push.apple.com" || hostname.endsWith(".notify.windows.com");
serve(async (request) => {
	if (request.method !== "POST") throw new HttpError(405, "Use POST");
	const userId = await owner(request), body = await readBody(request);
	if (body.unsubscribe === true) {
		const endpoint = String(body.endpoint ?? "");
		await database(`push_subscriptions?user_id=eq.${encoded(userId)}&endpoint=eq.${encoded(endpoint)}`, { method: "DELETE" });
		return json({ ok: true });
	}
	const subscription = body.subscription;
	if (!subscription?.endpoint || subscription.endpoint.length > 2048) throw new HttpError(400, "Invalid push subscription");
	const url = new URL(subscription.endpoint);
	if (url.protocol !== "https:" || url.username || url.password || url.port && !["443"].includes(url.port) || !allowed(url.hostname)) throw new HttpError(400, "Unsupported push service");
	if (!/^[A-Za-z0-9_-]{80,100}$/.test(subscription.keys?.p256dh ?? "") || !/^[A-Za-z0-9_-]{20,30}$/.test(subscription.keys?.auth ?? "")) throw new HttpError(400, "Invalid push encryption keys");
	const zone = String(body.timeZone || "UTC");
	try {
		new Intl.DateTimeFormat("en", { timeZone: zone });
	} catch {
		throw new HttpError(400, "Invalid time zone");
	}
	await assertCapacity(4096);
	if ((await database(`push_subscriptions?endpoint=eq.${encoded(url.href)}&select=user_id`)).some((item) => item.user_id !== userId)) throw new HttpError(409, "This browser subscription belongs to a different account. Disable it before switching accounts.");
	await database("push_subscriptions?on_conflict=endpoint", {
		method: "POST",
		headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
		body: JSON.stringify({
			user_id: userId,
			endpoint: url.href,
			subscription,
			time_zone: zone
		})
	});
	return json({ ok: true });
});
//#endregion
