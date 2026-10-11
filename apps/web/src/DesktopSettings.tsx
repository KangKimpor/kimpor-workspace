import { useEffect, useState } from "react";
import { Pressable } from "@veloradesk/ui";
import { platform, type DesktopUpdate } from "@veloradesk/core/platform";
import { store } from "@veloradesk/core/store";
import { cloudConfig } from "@veloradesk/core/cloud-auth";
import { flushEditors } from "./editor-lifecycle";
export default function DesktopSettings() {
  const [startup, setStartup] = useState(false);
  const [hotkey, setHotkey] = useState(
    localStorage.getItem("velora-desktop-hotkey") === "true",
  );
  const [tray, setTray] = useState(
    localStorage.getItem("velora-desktop-tray") === "true",
  );
  const [update, setUpdate] = useState<DesktopUpdate | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!platform.desktop) return;
    void platform
      .getAutostart()
      .then(setStartup)
      .catch((error) => setMessage(String(error)));
    let stop: (() => void) | undefined;
    let disposed = false;
    void platform
      .watchForUpdates(setUpdate, (error) =>
        setMessage(
          error instanceof Error ? error.message : "Update check unavailable.",
        ),
      )
      .then((cleanup) => {
        if (disposed) cleanup();
        else stop = cleanup;
      });
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  };
  if (!platform.desktop) return null;
  return (
    <section>
      <h3>Windows</h3>
      <label className="ws-setting-row">
        <span>Start with Windows</span>
        <input
          type="checkbox"
          checked={startup}
          disabled={busy}
          onChange={(event) => {
            const next = event.target.checked;
            void run(async () => {
              await platform.setAutostart(next);
              setStartup(next);
            });
          }}
        />
      </label>
      <label className="ws-setting-row">
        <span>Quick capture: Ctrl + Shift + Space</span>
        <input
          type="checkbox"
          checked={hotkey}
          disabled={busy}
          onChange={(event) => {
            const next = event.target.checked;
            void run(async () => {
              await platform.setQuickCaptureHotkey(next);
              localStorage.setItem("velora-desktop-hotkey", String(next));
              setHotkey(next);
            });
          }}
        />
      </label>
      <label className="ws-setting-row">
        <span>Keep running in the tray when closed</span>
        <input
          type="checkbox"
          checked={tray}
          disabled={busy}
          onChange={(event) => {
            const next = event.target.checked;
            void run(async () => {
              await platform.setMinimizeToTray(next);
              localStorage.setItem("velora-desktop-tray", String(next));
              setTray(next);
            });
          }}
        />
      </label>
      <Pressable
        className="ws-button"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const result = await platform.checkForUpdate();
            setUpdate(result);
            setMessage(
              result
                ? `Version ${result.version} is available.`
                : "You have the latest published version.",
            );
          })
        }
      >
        Check for updates
      </Pressable>
      {update && (
        <>
          <p>
            Version {update.version} is available. Save and sync before
            restarting.
          </p>
          <p>{update.body}</p>
          <Pressable
            className="ws-button ws-tinted"
            disabled={busy}
            onClick={() => {
              if (
                !confirm(
                  "Download, verify and install this update? Kimpor Workspace will restart.",
                )
              )
                return;
              void run(async () => {
                await flushEditors();
                if (
                  cloudConfig() &&
                  store.accountId !== "local" &&
                  store.pendingCount()
                )
                  throw new Error("Sync your pending changes before updating.");
                await update.download((downloaded, total) =>
                  setProgress(total ? downloaded / total : 0),
                );
                await update.install({
                  confirmed: true,
                  hasUnsavedChanges: false,
                  hasUnsyncedChanges:
                    cloudConfig() !== null &&
                    store.accountId !== "local" &&
                    store.pendingCount() > 0,
                });
              });
            }}
          >
            Install update and restart
          </Pressable>
          {busy && (
            <progress aria-label="Update download" max={1} value={progress} />
          )}
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
