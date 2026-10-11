import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bindAccount: vi.fn(async () => {}),
  initializeCloudAuth: vi.fn(),
  onSessionChange: vi.fn(),
}));
vi.mock("@veloradesk/core/store", () => ({
  store: { bindAccount: mocks.bindAccount, pendingCount: () => 0 },
}));
vi.mock("@veloradesk/core/sync", () => ({
  SyncEngine: class {
    subscribe() {}
    start() {}
    stop() {}
  },
}));
vi.mock("@veloradesk/core/cloud", () => ({
  SupabaseTransport: class {},
  subscribeCloudNudges: async () => () => {},
}));
vi.mock("@veloradesk/core/cloud-auth", () => ({
  cloudConfig: () => ({ url: "https://project.supabase.co" }),
  currentSession: async () => null,
  initializeCloudAuth: mocks.initializeCloudAuth,
  onSessionChange: mocks.onSessionChange,
}));
vi.mock("./editor-lifecycle", () => ({ flushEditors: async () => {} }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});

it("keeps confirmation guidance through asynchronous startup and clears it after sign-in", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, removeItem: vi.fn() });
  let finishBinding!: () => void;
  mocks.bindAccount.mockImplementationOnce(
    () => new Promise<void>((resolve) => { finishBinding = resolve; }),
  );
  let changeSession!: (session: unknown) => void;
  mocks.onSessionChange.mockImplementation((listener) => {
    changeSession = listener;
    return () => {};
  });
  const guidance = "Finish signing in from Settings → Account on this device.";
  mocks.initializeCloudAuth.mockImplementation(async (onError) => {
    onError(new Error(guidance));
    return () => {};
  });
  const { cloudState, startCloud } = await import("./cloud-state");
  const errors: string[] = [];
  const unsubscribe = cloudState.subscribe(() => errors.push(cloudState.getSnapshot().error));
  const stop = startCloud();
  try {
    await vi.waitFor(() => expect(mocks.bindAccount).toHaveBeenCalledWith(null, { adoptLocal: false }));
    finishBinding();
    await vi.waitFor(() => expect(errors).toHaveLength(2));
    expect(errors).toEqual([guidance, guidance]);
    changeSession({ user: { id: "11111111-1111-4111-8111-111111111111" } });
    await vi.waitFor(() => expect(cloudState.getSnapshot().session).not.toBeNull());
    expect(cloudState.getSnapshot().error).toBe("");
  } finally {
    stop();
    unsubscribe();
  }
});
