import type { SyncChange, WorkspaceStore } from "./store";

export interface SyncTransport {
  push(
    userId: string,
    changes: SyncChange[],
  ): Promise<{ acknowledged: string[] }>;
  pull(
    userId: string,
    cursor: string | null,
  ): Promise<{
    changes: SyncChange[];
    cursor: string | null;
    hasMore?: boolean;
  }>;
  subscribe?(userId: string, nudge: () => void): () => void;
}
export type SyncState =
  | "synced"
  | "syncing"
  | "offline"
  | "attention"
  | "local";
export interface SyncStatus {
  state: SyncState;
  pending: number;
  lastSyncedAt: string | null;
  error: string | null;
}

/** Foreground sync only: browsers may suspend timers and cannot promise background sync. */
export class SyncEngine {
  private status: SyncStatus = {
    state: "local",
    pending: 0,
    lastSyncedAt: null,
    error: null,
  };
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private rerun = false;
  private stopped = true;
  private timer?: ReturnType<typeof setInterval>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retry = 0;
  private unlistenStore?: () => void;
  private unlistenRemote?: () => void;
  private debounce?: ReturnType<typeof setTimeout>;
  private readonly wake = () => {
    if (
      typeof document === "undefined" ||
      document.visibilityState !== "hidden"
    )
      void this.run();
  };
  constructor(
    private readonly workspace: WorkspaceStore,
    private readonly transport: SyncTransport,
    private readonly online: () => boolean = () =>
      typeof navigator === "undefined" || navigator.onLine,
  ) {}
  getSnapshot = (): SyncStatus => this.status;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private update(patch: Partial<SyncStatus>): void {
    this.status = {
      ...this.status,
      ...patch,
      pending: this.workspace.pendingCount(),
    };
    this.listeners.forEach((listener) => listener());
  }
  start(): () => void {
    if (!this.stopped) return () => this.stop();
    this.stopped = false;
    this.unlistenStore = this.workspace.subscribe(() => {
      this.update({});
      if (this.status.state === "syncing") return;
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => void this.run(), 300);
    });
    this.unlistenRemote = this.transport.subscribe?.(
      this.workspace.accountId,
      () => {
        clearTimeout(this.debounce);
        this.debounce = setTimeout(() => void this.run(), 300);
      },
    );
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.wake);
      window.addEventListener("focus", this.wake);
      window.addEventListener("offline", this.wake);
      document.addEventListener("visibilitychange", this.wake);
    }
    this.timer = setInterval(this.wake, 60_000);
    void this.run();
    return () => this.stop();
  }
  stop(): void {
    this.stopped = true;
    clearInterval(this.timer);
    clearTimeout(this.retryTimer);
    clearTimeout(this.debounce);
    this.unlistenStore?.();
    this.unlistenRemote?.();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.wake);
      window.removeEventListener("offline", this.wake);
      window.removeEventListener("focus", this.wake);
      document.removeEventListener("visibilitychange", this.wake);
    }
  }
  run(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.rerun = false;
        await this.cycle();
      } while (this.rerun);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }
  private async cycle(): Promise<void> {
    const user = this.workspace.accountId;
    if (user === "local") {
      this.update({ state: "local", error: null });
      return;
    }
    if (!this.online()) {
      this.update({ state: "offline", error: null });
      return;
    }
    this.update({ state: "syncing", error: null });
    try {
      await this.workspace.ready();
      // Pull first so a remote encryption lock can prevent a queued plaintext write.
      await this.pull(user);
      let batches = 0;
      while (user === this.workspace.accountId) {
        const pending = await this.workspace.pendingChanges(100);
        if (!pending.length) break;
        if (++batches > 1_000)
          throw new Error(
            "Too many queued changes; sync will continue on the next attempt",
          );
        const result = await this.transport.push(user, pending);
        if (user !== this.workspace.accountId) return;
        const requested = new Set(pending.map((change) => change.id));
        const acknowledged = [...new Set(result.acknowledged)].filter((id) =>
          requested.has(id),
        );
        if (!acknowledged.length)
          throw new Error("The server did not acknowledge queued changes");
        await this.workspace.acknowledge(acknowledged);
      }
      await this.pull(user);
      if (user !== this.workspace.accountId) return;
      this.retry = 0;
      clearTimeout(this.retryTimer);
      this.update({
        state: "synced",
        lastSyncedAt: new Date().toISOString(),
        error: null,
      });
    } catch (error) {
      if (user !== this.workspace.accountId) return;
      this.update({
        state: this.online() ? "attention" : "offline",
        error:
          error instanceof Error ? error.message : "Unable to sync changes",
      });
      if (!this.stopped) {
        clearTimeout(this.retryTimer);
        const delay =
          Math.min(60_000, 1_000 * 2 ** Math.min(this.retry++, 6)) +
          Math.floor(Math.random() * 250);
        this.retryTimer = setTimeout(() => void this.run(), delay);
      }
    }
  }
  private async pull(user: string): Promise<void> {
    let cursor = await this.workspace.getCursor();
    let pages = 0;
    while (user === this.workspace.accountId) {
      if (++pages > 1_000)
        throw new Error("Too many server changes; sync will continue shortly");
      const result = await this.transport.pull(user, cursor);
      if (user !== this.workspace.accountId) return;
      if (
        result.hasMore &&
        (!result.changes.length || result.cursor === cursor)
      )
        throw new Error("Server cursor did not advance");
      await this.workspace.applyRemote(result.changes, result.cursor);
      cursor = result.cursor;
      if (!result.hasMore) break;
    }
  }
}
