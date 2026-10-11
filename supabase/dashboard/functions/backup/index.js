import * as Y from "npm:yjs@13.6.33";
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
//#region supabase/functions/backup/index.ts
var decode = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
function encode(value) {
	let binary = "";
	for (let i = 0; i < value.length; i += 16384) binary += String.fromCharCode(...value.subarray(i, i + 16384));
	return btoa(binary);
}
serve(async (request) => {
	if (request.method !== "POST") throw new HttpError(405, "Use POST");
	const supplied = request.headers.get("x-backup-secret") ?? "", expected = env("BACKUP_SECRET");
	let difference = supplied.length ^ expected.length;
	for (let i = 0; i < expected.length; i++) difference |= (supplied.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
	if (difference) throw new HttpError(401, "Invalid backup secret");
	const userId = env("BACKUP_OWNER_ID");
	if (!/^[a-f0-9-]{36}$/i.test(userId)) throw new HttpError(500, "Backup owner is not configured");
	const snapshot = await database("rpc/export_owner_data", {
		method: "POST",
		body: JSON.stringify({ owner_id: userId })
	});
	const read = (table) => Promise.resolve(snapshot[table] ?? []);
	const entities = [];
	for (const table of [
		"pages",
		"calendars",
		"events",
		"databases"
	]) for (const row of await read(table)) {
		const fields = row.fields;
		const entity = Object.fromEntries(Object.entries(fields).filter(([key]) => !key.startsWith("properties.")).map(([key, field]) => [key, field.value]));
		if (table === "pages") entity.properties = {
			...entity.properties ?? {},
			...Object.fromEntries(Object.entries(fields).filter(([key]) => key.startsWith("properties.")).map(([key, field]) => [key.slice(11), field.value]))
		};
		entities.push({
			table,
			entity
		});
	}
	const snapshots = await read("page_doc_snapshots"), updates = await read("page_doc_updates"), documents = [];
	for (const pageId of new Set([...snapshots, ...updates].map((row) => String(row.page_id)))) {
		if ((entities.find((entry) => entry.table === "pages" && entry.entity.id === pageId)?.entity.properties)?.__locked) continue;
		documents.push({
			pageId,
			update: encode(Y.mergeUpdates([...snapshots, ...updates].filter((row) => row.page_id === pageId).map((row) => decode(String(row.update_base64)))))
		});
	}
	const attachments = [];
	let size = 0;
	for (const file of await read("attachments")) {
		if ((size += Number(file.bytes)) > 6e7) throw new HttpError(413, "Scheduled backup exceeds the JSON import limit. Use local full export instead.");
		const response = await fetch(`${env("SUPABASE_URL")}/storage/v1/object/attachments/${String(file.path).split("/").map(encoded).join("/")}`, {
			headers: {
				Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
				apikey: env("SUPABASE_SERVICE_ROLE_KEY")
			},
			signal: AbortSignal.timeout(25e3)
		});
		if (!response.ok) throw new HttpError(503, "Could not read all backup files");
		attachments.push({
			id: file.id,
			pageId: file.page_id,
			name: file.name,
			mime: file.mime,
			size: Number(file.bytes),
			createdAt: file.created_at,
			bytes: encode(new Uint8Array(await response.arrayBuffer()))
		});
	}
	const versions = (await read("page_versions")).map((row) => ({
		id: row.id,
		pageId: row.page_id,
		createdAt: row.created_at,
		update: row.update_base64
	}));
	const encryptedDocuments = (await read("encrypted_doc_updates")).map((row) => ({
		id: row.id,
		pageId: row.page_id,
		createdAt: row.created_at,
		envelope: row.envelope
	}));
	const settings = (await read("user_settings")).flatMap((row) => Object.entries(row.fields).filter(([key]) => !key.startsWith("provider:")).map(([key, field]) => ({
		key,
		value: field.value
	})));
	const body = JSON.stringify({
		format: "veloradesk",
		version: 1,
		exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
		entities,
		documents,
		versions,
		encryptedDocuments,
		attachments,
		settings
	});
	if (body.length > 1e8) throw new HttpError(413, "Scheduled backup exceeds the import limit. Use local full export instead.");
	return new Response(body, { headers: {
		"Content-Type": "application/json",
		"Cache-Control": "no-store",
		"X-Content-Type-Options": "nosniff"
	} });
});
//#endregion
