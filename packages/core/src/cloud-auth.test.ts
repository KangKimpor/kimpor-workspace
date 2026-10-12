import { afterEach, beforeEach, expect, it, vi } from "vitest";
const adapter = vi.hoisted(() => ({
  desktop: false,
  onAuthRedirect: vi.fn(async () => () => {}),
}));
vi.mock("./platform", () => ({ platform: adapter }));
const saved = new Map<string, string>();
const fetcher = vi.fn();
const session = {
  access_token: "test-access",
  refresh_token: "test-refresh",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  token_type: "bearer",
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "owner@example.test",
  },
};
beforeEach(() => {
  vi.resetModules();
  saved.clear();
  fetcher.mockReset();
  adapter.desktop = false;
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("location", {
    origin: "https://workspace.example.test",
    pathname: "/",
    href: "https://workspace.example.test/",
    assign: vi.fn(),
  });
  vi.stubGlobal("history", { replaceState: vi.fn() });
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
it("clears invitation bearer fragments without adopting an unsolicited account", async () => {
  const auth = await import("./cloud-auth");
  await expect(auth.consumeAuthRedirect("https://workspace.example.test/#access_token=untrusted&refresh_token=untrusted"))
    .rejects.toThrow("Start sign-in");
  expect(history.replaceState).toHaveBeenCalledWith({}, "", "/");
  expect(fetcher).not.toHaveBeenCalled();
  expect(saved.size).toBe(0);
});
it("keeps missing cloud configuration local and rejects malformed endpoints", async () => {
  const auth = await import("./cloud-auth");
  vi.stubEnv("VITE_SUPABASE_URL", "");
  expect(auth.cloudConfig()).toBeNull();
  await expect(auth.sendEmailCode("me@example.test")).rejects.toThrow(
    "not configured",
  );
  expect(await auth.initializeCloudAuth(vi.fn())).toBeTypeOf("function");
  for (const url of [
    "http://evil.example",
    "https://user:password@project.supabase.co",
    "https://project.supabase.co/auth",
    "https://project.supabase.co/?query=1",
  ]) {
    vi.stubEnv("VITE_SUPABASE_URL", url);
    expect(() => auth.cloudConfig()).toThrow();
  }
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
  expect(auth.cloudConfig()?.url).toBe("http://127.0.0.1:54321");
});
it("uses six-digit email codes and propagates provider failures", async () => {
  const auth = await import("./cloud-auth");
  await expect(auth.sendEmailCode("invalid")).rejects.toThrow();
  await expect(
    auth.verifyEmailCode("me@example.test", "abc123"),
  ).rejects.toThrow("six-digit");
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockResolvedValueOnce(response({}));
  await auth.sendEmailCode(" me@example.test ");
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({
    email: "me@example.test",
    create_user: true,
  });
  expect(JSON.parse(fetcher.mock.calls[0]![1].body).code_challenge).toBeNull();
  expect(new URL(fetcher.mock.calls[0]![0]).searchParams.has("redirect_to")).toBe(false);
  expect(saved.has("velora-pkce-v1")).toBe(false);
  const listener = vi.fn();
  const cleanup = auth.onSessionChange(listener);
  fetcher.mockResolvedValueOnce(response(session));
  expect(await auth.verifyEmailCode("me@example.test", "123456")).toMatchObject(
    session,
  );
  expect(listener).toHaveBeenLastCalledWith(session);
  expect(await auth.currentSession()).toEqual(session);
  expect(saved.has("velora-pkce-v1")).toBe(false);
  cleanup();
  for (const error of [
    { msg: "Slow down" },
    { error_description: "Try later" },
    {},
  ]) {
    fetcher.mockResolvedValueOnce(response(error, 429));
    await expect(auth.sendEmailCode("me@example.test")).rejects.toThrow();
  }
  fetcher.mockResolvedValueOnce(response({ access_token: "bad" }));
  await expect(
    auth.verifyEmailCode("me@example.test", "123456"),
  ).rejects.toThrow("Invalid sign-in");
});
it("accepts a state-bound PKCE OAuth return and reports enabled providers", async () => {
  const auth = await import("./cloud-auth");
  await auth.signInGoogle();
  const pending = JSON.parse(saved.get("velora-pkce-v1")!);
  await expect(auth.consumeAuthRedirect(`${pending.redirect}&code=email-code&state=wrong`)).rejects.toThrow();
  fetcher.mockResolvedValueOnce(response(session));
  expect(await auth.consumeAuthRedirect(`${pending.redirect}&code=email-code`)).toEqual(session);
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ auth_code: "email-code", code_verifier: pending.verifier });
  fetcher.mockResolvedValueOnce(response({ external: { google: false } }));
  expect(await auth.availableAuthProviders()).toEqual({ google: false });
  fetcher.mockResolvedValueOnce(response({ external: { google: true } }));
  expect(await auth.availableAuthProviders()).toEqual({ google: true });
});
it("refreshes once for concurrent calls and never resurrects a signed-out session", async () => {
  const auth = await import("./cloud-auth");
  saved.set(
    "velora-cloud-session-v1",
    JSON.stringify({ ...session, expires_at: 0 }),
  );
  let resolve!: (response: Response) => void;
  fetcher.mockImplementationOnce(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const a = auth.currentSession(),
    b = auth.currentSession();
  fetcher.mockResolvedValueOnce(response({}));
  await auth.signOut();
  resolve(response({ ...session, refresh_token: "rotated" }));
  expect(await a).toBeNull();
  expect(await b).toBeNull();
  expect(await auth.currentSession()).toBeNull();
  expect(
    fetcher.mock.calls.filter((call) =>
      String(call[0]).includes("grant_type=refresh_token"),
    ),
  ).toHaveLength(1);
  saved.set(
    "velora-cloud-session-v1",
    JSON.stringify({ ...session, expires_at: 0 }),
  );
  fetcher.mockResolvedValueOnce(
    response({ ...session, expires_at: undefined, expires_in: 7200 }),
  );
  expect((await auth.currentSession())?.expires_at).toBeGreaterThan(
    Date.now() / 1000 + 7000,
  );
});
it("retains an offline session on transient refresh failure and clears revoked online sessions", async () => {
  const auth = await import("./cloud-auth");
  saved.set(
    "velora-cloud-session-v1",
    JSON.stringify({ ...session, expires_at: 0 }),
  );
  vi.stubGlobal("navigator", { onLine: false });
  fetcher.mockRejectedValueOnce(new Error("Offline"));
  await expect(auth.currentSession()).rejects.toThrow();
  expect(saved.has("velora-cloud-session-v1")).toBe(true);
  vi.stubGlobal("navigator", { onLine: true });
  fetcher.mockResolvedValueOnce(response({ msg: "Unavailable" }, 503));
  await expect(auth.currentSession()).rejects.toThrow("Unavailable");
  expect(saved.has("velora-cloud-session-v1")).toBe(true);
  fetcher.mockResolvedValueOnce(response({ msg: "Revoked" }, 401));
  await expect(auth.currentSession()).rejects.toThrow("Revoked");
  expect(saved.has("velora-cloud-session-v1")).toBe(false);
  saved.set("velora-cloud-session-v1", "invalid JSON");
  expect(await auth.currentSession()).toBeNull();
  saved.set("velora-cloud-session-v1", JSON.stringify({ access_token: "x" }));
  expect(await auth.currentSession()).toBeNull();
});
it("validates OAuth return origin, state, expiry and replay before exchanging PKCE", async () => {
  const auth = await import("./cloud-auth");
  await auth.signInGoogle();
  const pending = JSON.parse(saved.get("velora-pkce-v1")!);
  const authorize = new URL(vi.mocked(location.assign).mock.calls[0]![0]);
  expect(authorize.searchParams.get("code_challenge_method")).toBe("s256");
  expect(authorize.searchParams.get("code_challenge")).not.toBe(
    pending.verifier,
  );
  const callback = `https://workspace.example.test/?state=${pending.state}&code=test-code`;
  for (const url of [
    callback.replace("workspace.example.test", "attacker.example"),
    callback.replace(pending.state, "wrong"),
    `${callback}&state=duplicate`,
    `${callback}&code=duplicate`,
    `${callback}#fragment`,
    `${callback}&error=denied`,
  ])
    await expect(auth.consumeAuthRedirect(url)).rejects.toThrow();
  fetcher.mockResolvedValueOnce(response(session));
  expect(await auth.consumeAuthRedirect(callback)).toEqual(session);
  expect(saved.has("velora-pkce-v1")).toBe(false);
  expect(history.replaceState).toHaveBeenCalledWith({}, "", "/");
  await expect(auth.consumeAuthRedirect(callback)).rejects.toThrow(
    "missing or expired",
  );
  expect(
    await auth.consumeAuthRedirect("https://workspace.example.test/"),
  ).toBeNull();
  saved.set("velora-pkce-v1", JSON.stringify({ ...pending, expiresAt: 0 }));
  await expect(auth.consumeAuthRedirect(callback)).rejects.toThrow(
    "Invalid or expired",
  );
});
it("accepts the exact desktop deep link and cleans subscriptions and local sign-out offline", async () => {
  adapter.desktop = true;
  const auth = await import("./cloud-auth");
  const pending = {
    verifier: "test-verifier",
    state: "expected-state",
    expiresAt: Date.now() + 60000,
    redirect: "veloradesk://auth/callback",
  };
  saved.set("velora-pkce-v1", JSON.stringify(pending));
  fetcher.mockResolvedValueOnce(response(session));
  expect(
    await auth.consumeAuthRedirect(
      "veloradesk://auth/callback?state=expected-state&code=code",
    ),
  ).toEqual(session);
  expect(await auth.initializeCloudAuth(vi.fn())).toBeTypeOf("function");
  expect(adapter.onAuthRedirect).toHaveBeenCalled();
  const listener = vi.fn(),
    cleanup = auth.onSessionChange(listener);
  const event = new Event("storage");
  Object.assign(event, { key: "velora-cloud-session-v1" });
  window.dispatchEvent(event);
  expect(listener).toHaveBeenCalledTimes(2);
  cleanup();
  window.dispatchEvent(event);
  expect(listener).toHaveBeenCalledTimes(2);
  fetcher.mockRejectedValueOnce(new Error("Offline"));
  await auth.signOut();
  expect(await auth.currentSession()).toBeNull();
});
