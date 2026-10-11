import { store } from "@veloradesk/core/store";
import { SyncEngine, type SyncStatus } from "@veloradesk/core/sync";
import {
  SupabaseTransport,
  subscribeCloudNudges,
} from "@veloradesk/core/cloud";
import {
  cloudConfig,
  currentSession,
  initializeCloudAuth,
  onSessionChange,
  type CloudSession,
} from "@veloradesk/core/cloud-auth";
import { flushEditors } from "./editor-lifecycle";
interface CloudState {
  session: CloudSession | null;
  status: SyncStatus;
  error: string;
}
let state: CloudState = {
  session: null,
  status: { state: "local", pending: 0, lastSyncedAt: null, error: null },
  error: "",
};
const listeners = new Set<() => void>();
let engine: SyncEngine | null = null;
let stopNudges: (() => void) | undefined;
let transition = Promise.resolve();
let references = 0;
let dispose: (() => void) | undefined;
const emit = () => listeners.forEach((listener) => listener());
export const cloudState = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => state,
  sync: async () => engine?.run(),
};
async function bind(session: CloudSession | null) {
  await flushEditors();
  engine?.stop();
  engine = null;
  stopNudges?.();
  stopNudges = undefined;
  const adopt =
    session && localStorage.getItem("velora-adopt-next-account") === "true";
  if (session) localStorage.removeItem("velora-adopt-next-account");
  await store.bindAccount(session?.user.id ?? null, { adoptLocal: !!adopt });
  state = {
    session,
    status: {
      state: session ? "syncing" : "local",
      pending: session ? store.pendingCount() : 0,
      lastSyncedAt: null,
      error: null,
    },
    // The initial local binding can finish after the redirect error callback.
    // Keep that guidance visible until a successful sign-in changes the account.
    error: session ? "" : state.error,
  };
  emit();
  if (!session) return;
  engine = new SyncEngine(store, new SupabaseTransport());
  const current = engine;
  current.subscribe(() => {
    if (engine === current) {
      state = { ...state, status: current.getSnapshot() };
      emit();
    }
  });
  current.start();
  stopNudges = await subscribeCloudNudges(() => void current.run());
}
export function adoptLocalOnNextSignIn(value: boolean) {
  localStorage.setItem("velora-adopt-next-account", String(value));
}
export function startCloud(): () => void {
  references++;
  if (references === 1 && cloudConfig()) {
    let stopped = false;
    let stopRedirect: (() => void) | undefined;
    const enqueue = (session: CloudSession | null) => {
      transition = transition
        .then(() => (stopped ? undefined : bind(session)))
        .catch((error) => {
          state = {
            ...state,
            error: String(error),
            status: {
              ...state.status,
              state: "attention",
              error: String(error),
            },
          };
          emit();
        });
    };
    const unlisten = onSessionChange(enqueue);
    void currentSession()
      .then(enqueue)
      .catch((error) => {
        state = { ...state, error: String(error) };
        emit();
      });
    void initializeCloudAuth((error) => {
      state = { ...state, error: error.message };
      emit();
    }).then((cleanup) => {
      if (stopped) cleanup();
      else stopRedirect = cleanup;
    });
    dispose = () => {
      stopped = true;
      unlisten();
      stopRedirect?.();
      engine?.stop();
      stopNudges?.();
    };
  }
  return () => {
    if (--references === 0) {
      dispose?.();
      dispose = undefined;
    }
  };
}
