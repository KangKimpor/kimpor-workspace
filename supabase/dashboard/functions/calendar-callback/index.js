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
var decode64 = (raw) => Uint8Array.from(atob(raw.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(raw.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
async function signingKey() {
	return crypto.subtle.importKey("raw", new TextEncoder().encode(env("OAUTH_STATE_SECRET")), {
		name: "HMAC",
		hash: "SHA-256"
	}, false, ["sign", "verify"]);
}
function callbackUrl() {
	return `${env("SUPABASE_URL")}/functions/v1/calendar-callback`;
}
async function finishCalendarOAuth(state, code) {
	const parts = state.split(".");
	if (parts.length !== 2) throw new HttpError(400, "Invalid connection request");
	if (!await crypto.subtle.verify("HMAC", await signingKey(), decode64(parts[1]), new TextEncoder().encode(parts[0]))) throw new HttpError(400, "Invalid connection request");
	const claims = JSON.parse(new TextDecoder().decode(decode64(parts[0])));
	if (!claims.id || !["google", "outlook"].includes(claims.provider) || !Number.isFinite(claims.expiresAt) || Date.now() >= claims.expiresAt) throw new HttpError(400, "Connection request expired. Start again in Kimpor Workspace.");
	const request = (await database(`calendar_oauth_requests?id=eq.${encoded(claims.id)}&provider=eq.${claims.provider}&consumed_at=is.null&expires_at=gt.${encoded((/* @__PURE__ */ new Date()).toISOString())}`, {
		method: "PATCH",
		body: JSON.stringify({ consumed_at: (/* @__PURE__ */ new Date()).toISOString() })
	}))[0];
	if (!request) throw new HttpError(400, "Connection request has already been used");
	const { verifier } = await unseal(request.encrypted_verifier, request.user_id);
	const tokens = await exchange(claims.provider, {
		grant_type: "authorization_code",
		code,
		code_verifier: verifier,
		redirect_uri: callbackUrl()
	});
	const userEndpoint = claims.provider === "google" ? "https://www.googleapis.com/oauth2/v3/userinfo" : "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName";
	const profileResponse = await fetch(userEndpoint, {
		headers: { Authorization: `Bearer ${tokens.access_token}` },
		signal: AbortSignal.timeout(15e3)
	});
	const profile = profileResponse.ok ? await profileResponse.json() : {};
	const label = profile.email || profile.mail || profile.userPrincipalName || `${claims.provider} calendar`;
	await database("connected_accounts", {
		method: "POST",
		body: JSON.stringify({
			user_id: request.user_id,
			provider: claims.provider,
			label,
			encrypted_credentials: await seal({
				...tokens,
				email: label
			}, request.user_id)
		})
	});
	return request.user_id;
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
//#endregion
//#region supabase/functions/calendar-callback/index.ts
serve(async (request) => {
	const url = new URL(request.url);
	if (request.method !== "GET" || url.searchParams.getAll("state").length !== 1 || url.searchParams.getAll("code").length !== 1 || url.searchParams.has("error")) throw new HttpError(400, "Calendar connection was declined. Return to Kimpor Workspace and try again.");
	await nudge(await finishCalendarOAuth(url.searchParams.get("state"), url.searchParams.get("code")));
	return new Response("<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>Calendar connected</title><body><main><h1>Calendar connected</h1><p>You can close this window and return to Kimpor Workspace.</p></main></body></html>", { headers: {
		"Content-Type": "text/html; charset=utf-8",
		"Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
		"Cache-Control": "no-store"
	} });
});
//#endregion
