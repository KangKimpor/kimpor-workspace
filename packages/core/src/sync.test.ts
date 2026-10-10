import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SyncEngine, type SyncTransport } from "./sync";
import type { WorkspaceStore, SyncChange } from "./store";
const pending: SyncChange = {
  id: "pending",
  userId: "owner",
  entityId: "page",
  kind: "entity",
  table: "pages",
  fields: {},
  schemaVersion: 1,
};
function fixture() {
  let listener = () => {},
    queue = [pending],
    cursor: string | null = null;
  const state = {
    accountId: "owner",
    ready: async () => {},
    pendingCount: () => queue.length,
    subscribe: (next: () => void) => {
      listener = next;
      return vi.fn();
    },
    pendingChanges: async () => queue,
    acknowledge: vi.fn(async (ids: string[]) => {
      queue = queue.filter((change) => !ids.includes(change.id));
    }),
    getCursor: async () => cursor,
    applyRemote: vi.fn(async (_changes: SyncChange[], next: string | null) => {
      cursor = next;
    }),
  };
  const transport: SyncTransport = {
    push: vi.fn(async (_user: string, changes: SyncChange[]) => ({
      acknowledged: changes.map((change) => change.id),
    })),
    pull: vi.fn(async () => ({ changes: [], cursor: "1", hasMore: false })),
    subscribe: vi.fn(() => vi.fn()),
  };
  return {
    state,
    transport,
    store: state as unknown as WorkspaceStore,
    changed: () => listener(),
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), { visibilityState: "visible" }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("resumes pending work after online/focus events and cleans foreground timers when stopped", async () => {
  const f = fixture();
  let online = false;
  const engine = new SyncEngine(f.store, f.transport, () => online),
    listener = vi.fn();
  const unsubscribe = engine.subscribe(listener),
    stop = engine.start();
  await engine.run();
  expect(engine.getSnapshot()).toMatchObject({ state: "offline", pending: 1 });
  online = true;
  window.dispatchEvent(new Event("online"));
  await engine.run();
  expect(engine.getSnapshot()).toMatchObject({
    state: "synced",
    pending: 0,
    error: null,
  });
  expect(f.state.acknowledge).toHaveBeenCalledWith(["pending"]);
  f.changed();
  await vi.advanceTimersByTimeAsync(301);
  expect(listener).toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(60000);
  expect(vi.mocked(f.transport.pull).mock.calls.length).toBeGreaterThan(2);
  stop();
  unsubscribe();
  const before = vi.mocked(f.transport.pull).mock.calls.length;
  window.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(60000);
  expect(vi.mocked(f.transport.pull).mock.calls.length).toBe(before);
});
it("never removes unacknowledged writes and retries a transient failure with backoff", async () => {
  const f = fixture();
  vi.mocked(f.transport.push).mockResolvedValueOnce({ acknowledged: [] });
  const engine = new SyncEngine(f.store, f.transport, () => true),
    stop = engine.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(engine.getSnapshot().state).toBe("attention");
  expect(engine.getSnapshot().error).toContain("did not acknowledge");
  expect(f.state.acknowledge).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1251);
  expect(engine.getSnapshot().state).toBe("synced");
  expect(f.state.acknowledge).toHaveBeenCalledOnce();
  stop();
});
it("rejects a stalled cursor and drops an in-flight response after the account changes", async () => {
  const f = fixture();
  vi.mocked(f.transport.pull).mockResolvedValueOnce({
    changes: [],
    cursor: null,
    hasMore: true,
  });
  const engine = new SyncEngine(f.store, f.transport, () => true);
  await engine.run();
  expect(engine.getSnapshot().error).toContain("did not advance");
  expect(f.state.applyRemote).not.toHaveBeenCalled();
  let resolve!: (value: { changes: SyncChange[]; cursor: string }) => void;
  vi.mocked(f.transport.pull).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const flight = engine.run();
  await Promise.resolve();
  await Promise.resolve();
  f.state.accountId = "other";
  resolve({ changes: [pending], cursor: "9" });
  await flight;
  expect(f.state.applyRemote).not.toHaveBeenCalled();
  expect(f.transport.push).not.toHaveBeenCalled();
  f.state.accountId = "local";
  await engine.run();
  expect(engine.getSnapshot().state).toBe("local");
});
