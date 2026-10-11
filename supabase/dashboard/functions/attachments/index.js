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
//#region supabase/functions/attachments/index.ts
serve(async (request) => {
	const userId = await owner(request);
	if (request.method === "GET") {
		const id = new URL(request.url).searchParams.get("id") || "";
		const records = await database(`attachments?user_id=eq.${encoded(userId)}&id=eq.${encoded(id)}`);
		if (!records[0]) throw new HttpError(404, "Attachment not found");
		const response = await fetch(`${env("SUPABASE_URL")}/storage/v1/object/authenticated/attachments/${records[0].path.split("/").map(encoded).join("/")}`, {
			headers: {
				Authorization: request.headers.get("authorization"),
				apikey: env("SUPABASE_ANON_KEY")
			},
			signal: AbortSignal.timeout(25e3)
		});
		if (!response.ok) throw new HttpError(503, "Attachment is unavailable");
		return new Response(response.body, { headers: {
			"Content-Type": records[0].mime,
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff"
		} });
	}
	if (request.method !== "POST") throw new HttpError(405, "Use POST");
	if (Number(request.headers.get("content-length")) > 11e6) throw new HttpError(413, "Attachment request exceeds 10 MB");
	const form = await request.formData(), file = form.get("file"), id = String(form.get("id") || ""), page = String(form.get("pageId") || ""), changeId = String(form.get("changeId") || "");
	if (!(file instanceof File) || !/^[-a-f0-9]{36}$/i.test(id) || !page || page.length > 160 || changeId !== `attachment:${id}` || file.size > 10485760) throw new HttpError(400, "Choose a file smaller than 10 MB");
	const pages = await database(`pages?user_id=eq.${encoded(userId)}&id=eq.${encoded(page)}&select=fields`);
	if (!pages[0]) throw new HttpError(404, "Page not found");
	if (![
		"application/octet-stream",
		"image/webp",
		"image/png",
		"image/jpeg",
		"application/pdf",
		"text/plain"
	].includes(file.type)) throw new HttpError(400, "Unsupported attachment type");
	if (pages[0].fields["properties.__locked"]?.value === true && file.type !== "application/octet-stream") throw new HttpError(400, "Protected documents require encrypted attachments");
	const path = `${userId}/${id}`;
	const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())), (byte) => byte.toString(16).padStart(2, "0")).join("");
	const old = await database(`attachments?user_id=eq.${encoded(userId)}&id=eq.${encoded(id)}`);
	if (old.length) {
		if (old[0].page_id !== page || old[0].digest !== digest) throw new HttpError(409, "Attachment identity was reused");
		return json({
			ok: true,
			path
		});
	}
	await assertCapacity(file.size);
	const response = await fetch(`${env("SUPABASE_URL")}/storage/v1/object/attachments/${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
			apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
			"Content-Type": file.type,
			"x-upsert": "false"
		},
		body: file,
		signal: AbortSignal.timeout(25e3)
	});
	if (!response.ok) {
		if (response.status !== 409 && response.status !== 400) throw new HttpError(503, "File upload failed. The original remains on your device.");
		const existing = await fetch(`${env("SUPABASE_URL")}/storage/v1/object/authenticated/attachments/${path}`, {
			headers: {
				Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
				apikey: env("SUPABASE_SERVICE_ROLE_KEY")
			},
			signal: AbortSignal.timeout(25e3)
		});
		if (!existing.ok || Number(existing.headers.get("content-length") || 0) > 10485760) throw new HttpError(503, "File upload is waiting for a retry.");
		const bytes = await existing.arrayBuffer();
		const existingDigest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
		if (bytes.byteLength !== file.size || existingDigest !== digest) throw new HttpError(409, "Attachment identity was reused");
	}
	const metadata = {
		id,
		user_id: userId,
		page_id: page,
		path,
		bytes: file.size,
		mime: file.type,
		name: file.name.slice(0, 255),
		digest
	};
	try {
		await database("rpc/register_attachment", {
			method: "POST",
			body: JSON.stringify({
				owner_id: userId,
				metadata,
				change_id: changeId
			})
		});
	} catch (error) {
		await fetch(`${env("SUPABASE_URL")}/storage/v1/object/attachments`, {
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
				apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ prefixes: [path] }),
			signal: AbortSignal.timeout(1e4)
		}).catch(() => {});
		throw error;
	}
	await nudge(userId);
	return json({
		ok: true,
		path
	});
});
//#endregion
