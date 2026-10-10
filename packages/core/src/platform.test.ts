import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updater = vi.hoisted(() => ({
  check: vi.fn(),
  download: vi.fn(),
  install: vi.fn(),
  close: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: updater.check }));

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  updater.check.mockReset();
  updater.download.mockReset();
  updater.install.mockReset();
  updater.close.mockReset();
  updater.check.mockResolvedValue({
    version: "1.0.1",
    body: "Release notes",
    download: updater.download,
    install: updater.install,
    close: updater.close,
  });
  updater.download.mockImplementation(async (callback) => {
    callback({ event: "Started", data: { contentLength: 30 } });
    callback({ event: "Progress", data: { chunkLength: 10 } });
    callback({ event: "Progress", data: { chunkLength: 20 } });
    callback({ event: "Finished" });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("desktop update safety", () => {
  it("never installs before verified download, explicit consent and saved, synced changes", async () => {
    const { platform } = await import("./platform");
    const update = (await platform.checkForUpdate())!;
    const ready = {
      confirmed: true,
      hasUnsavedChanges: false,
      hasUnsyncedChanges: false,
    };
    await expect(update.install(ready)).rejects.toThrow("Download and verify");
    const progress = vi.fn();
    await update.download(progress);
    expect(progress).toHaveBeenLastCalledWith(30, 30);
    await expect(
      update.install({ ...ready, confirmed: false }),
    ).rejects.toThrow("Confirm");
    await expect(
      update.install({ ...ready, hasUnsavedChanges: true }),
    ).rejects.toThrow("Save and sync");
    await expect(
      update.install({ ...ready, hasUnsyncedChanges: true }),
    ).rejects.toThrow("Save and sync");
    expect(updater.install).not.toHaveBeenCalled();
    await update.install(ready);
    expect(updater.install).toHaveBeenCalledExactlyOnceWith({
      restartAfterInstall: true,
    });
    expect(updater.check).toHaveBeenCalledWith({ timeout: 15000 });
    await update.close();
    expect(updater.close).toHaveBeenCalledOnce();
  });
  it("does not allow an unsuccessful download to enable installation", async () => {
    updater.download.mockRejectedValue(new Error("Signature is invalid"));
    const { platform } = await import("./platform");
    const update = (await platform.checkForUpdate())!;
    await expect(update.download()).rejects.toThrow("Signature is invalid");
    await expect(
      update.install({
        confirmed: true,
        hasUnsavedChanges: false,
        hasUnsyncedChanges: false,
      }),
    ).rejects.toThrow("Download and verify");
    expect(updater.install).not.toHaveBeenCalled();
  });
  it("keeps web builds outside the native update path", async () => {
    vi.stubGlobal("window", { open: vi.fn() });
    const { platform } = await import("./platform");
    expect(await platform.checkForUpdate()).toBeNull();
    expect(updater.check).not.toHaveBeenCalled();
  });
  it("rejects lookalike OAuth hosts, credentials and non-HTTPS destinations", async () => {
    vi.stubGlobal("window", { open: vi.fn() });
    const { platform } = await import("./platform");
    for (const url of [
      "https://github.com.attacker.invalid/",
      "https://github.com@attacker.invalid/",
      "http://github.com/",
      "https://project.supabase.co.attacker.invalid/auth/v1/authorize",
      "https://project.supabase.co/storage/v1/object",
    ]) {
      await expect(platform.openExternal(url)).rejects.toThrow("not allowed");
    }
    await platform.openExternal(
      "https://project.supabase.co/auth/v1/authorize?provider=google",
    );
    expect(window.open).toHaveBeenCalledOnce();
  });
});
