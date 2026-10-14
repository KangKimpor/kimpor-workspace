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
//#endregion
//#region supabase/functions/delete-account/index.ts
serve(async (request) => {
	if (request.method !== "POST") throw new HttpError(405, "Use POST");
	const userId = await owner(request);
	const files = await database(`attachments?user_id=eq.${encoded(userId)}&select=path`);
	files.push(...await database(`purged_files?user_id=eq.${encoded(userId)}&select=path`));
	for (let index = 0; index < files.length; index += 100) if (!(await fetch(`${env("SUPABASE_URL")}/storage/v1/object/attachments`, {
		method: "DELETE",
		headers: {
			Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
			apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ prefixes: files.slice(index, index + 100).map((file) => file.path) }),
		signal: AbortSignal.timeout(2e4)
	})).ok) throw new HttpError(503, "Could not remove cloud files. Try again before deleting records.");
	if (!(await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/delete_my_cloud_data`, {
		method: "POST",
		headers: {
			Authorization: request.headers.get("authorization"),
			apikey: env("SUPABASE_ANON_KEY"),
			"Content-Type": "application/json"
		},
		body: "{}",
		signal: AbortSignal.timeout(2e4)
	})).ok) throw new HttpError(503, "Could not remove cloud records");
	return json({ ok: true });
});
//#endregion
