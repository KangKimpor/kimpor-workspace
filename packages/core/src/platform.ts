export interface DesktopUpdate {
  version: string;
  body?: string;
  date?: string;
  download(
    onProgress?: (downloaded: number, total?: number) => void,
  ): Promise<void>;
  install(readiness: {
    confirmed: boolean;
    hasUnsavedChanges: boolean;
    hasUnsyncedChanges: boolean;
  }): Promise<void>;
  close(): Promise<void>;
}

const isDesktop =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// All platform inspection stays here; UI only consumes this adapter.
export const platform = {
  desktop: isDesktop,
  async applyTheme(theme: "light" | "dark") {
    if (!isDesktop) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setTheme(theme);
  },
  async onAuthRedirect(callback: (url: string) => void): Promise<() => void> {
    if (!isDesktop) return () => {};
    const { getCurrent, onOpenUrl } =
      await import("@tauri-apps/plugin-deep-link");
    const unlisten = await onOpenUrl((urls) => urls.forEach(callback));
    (await getCurrent())?.forEach(callback);
    return unlisten;
  },
  async onQuickCapture(callback: () => void): Promise<() => void> {
    if (!isDesktop) return () => {};
    const { listen } = await import("@tauri-apps/api/event");
    return listen("desktop:quick-capture", callback);
  },
  async onQuit(callback: () => void): Promise<() => void> {
    if (!isDesktop) return () => {};
    const { listen } = await import("@tauri-apps/api/event");
    return listen("desktop:request-quit", callback);
  },
  async quit() {
    if (!isDesktop) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("quit_application");
  },
  async setQuickCaptureHotkey(enabled: boolean) {
    if (!isDesktop) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_quick_capture_hotkey", { enabled });
  },
  async setMinimizeToTray(enabled: boolean) {
    if (!isDesktop) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_minimize_to_tray", { enabled });
  },
  async getAutostart() {
    if (!isDesktop) return false;
    const { isEnabled } = await import("@tauri-apps/plugin-autostart");
    return isEnabled();
  },
  async setAutostart(enabled: boolean) {
    if (!isDesktop) return;
    const startup = await import("@tauri-apps/plugin-autostart");
    await (enabled ? startup.enable() : startup.disable());
  },
  async canNotify() {
    if (isDesktop) {
      const { isPermissionGranted } =
        await import("@tauri-apps/plugin-notification");
      return isPermissionGranted();
    }
    return (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    );
  },
  async requestNotificationPermission() {
    if (isDesktop) {
      const { requestPermission } =
        await import("@tauri-apps/plugin-notification");
      return (await requestPermission()) === "granted";
    }
    if (typeof Notification === "undefined") return false;
    return (await Notification.requestPermission()) === "granted";
  },
  async notify(message: { title: string; body: string }) {
    if (!(await this.canNotify())) return false;
    if (isDesktop) {
      const { sendNotification } =
        await import("@tauri-apps/plugin-notification");
      sendNotification(message);
    } else if (
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator
    ) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return false;
      await registration.showNotification(message.title, {
        body: message.body,
        icon: "icon-192.png",
        tag: "veloradesk-reminder",
      });
    } else {
      new Notification(message.title, { body: message.body });
    }
    return true;
  },
  async checkForUpdate(): Promise<DesktopUpdate | null> {
    if (!isDesktop) return null;
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check({ timeout: 15000 });
    if (!update) return null;
    let downloaded = false;
    return {
      version: update.version,
      body: update.body,
      date: update.date,
      async download(onProgress) {
        downloaded = false;
        let bytes = 0;
        let total: number | undefined;
        await update.download((event) => {
          if (event.event === "Started") total = event.data.contentLength;
          if (event.event === "Progress") bytes += event.data.chunkLength;
          onProgress?.(bytes, total);
        });
        downloaded = true;
      },
      async install(readiness) {
        if (!readiness.confirmed)
          throw new Error("Confirm installation before restarting.");
        if (readiness.hasUnsavedChanges || readiness.hasUnsyncedChanges)
          throw new Error(
            "Save and sync your changes before installing the update.",
          );
        if (!downloaded)
          throw new Error(
            "Download and verify the update before installing it.",
          );
        // The plugin verifies the configured Ed25519 signature before installation.
        await update.install({ restartAfterInstall: true });
      },
      async close() {
        await update.close();
      },
    };
  },
  async watchForUpdates(
    onUpdate: (update: DesktopUpdate | null) => void,
    onError?: (error: unknown) => void,
  ): Promise<() => void> {
    if (!isDesktop) return () => {};
    let stopped = false;
    let current: DesktopUpdate | null = null;
    let checking = false;
    const poll = async () => {
      if (stopped || checking) return;
      checking = true;
      try {
        const next = await this.checkForUpdate();
        if (stopped) {
          await next?.close();
          return;
        }
        if (current?.version === next?.version) {
          await next?.close();
          return;
        }
        await current?.close();
        current = next;
        onUpdate(current);
      } catch (error) {
        if (!stopped) onError?.(error);
      } finally {
        checking = false;
      }
    };
    void poll();
    const interval = setInterval(
      () => {
        void poll();
      },
      6 * 60 * 60 * 1000,
    );
    return () => {
      stopped = true;
      clearInterval(interval);
      void current?.close().catch(() => {});
    };
  },
  async openExternal(raw: string) {
    const url = new URL(raw);
    const docs = ["github.com", "supabase.com", "vercel.com"].includes(
      url.hostname,
    );
    const supabaseAuth =
      /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) &&
      url.pathname.startsWith("/auth/v1/");
    const googleAuth =
      url.hostname === "accounts.google.com" &&
      url.pathname === "/o/oauth2/v2/auth";
    const microsoftAuth =
      url.hostname === "login.microsoftonline.com" &&
      /^\/[^/]+\/oauth2\/v2\.0\/authorize$/.test(url.pathname);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !(docs || supabaseAuth || googleAuth || microsoftAuth)
    )
      throw new Error("External destination is not allowed");
    if (isDesktop) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url.href);
    } else window.open(url.href, "_blank", "noopener,noreferrer");
  },
  async persistStorage() {
    return typeof navigator !== "undefined" && navigator.storage?.persist
      ? navigator.storage.persist()
      : false;
  },
  haptic(_kind: "light" | "success") {
    /* Optional capability; no unverified browser haptic hack. */
  },
  download(name: string, content: string, mime = "application/json") {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
