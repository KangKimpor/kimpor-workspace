import { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable } from "@veloradesk/ui";
import {
  cloudConfig,
  sendEmailCode,
  verifyEmailCode,
  signInGoogle,
  signOut,
  availableAuthProviders,
} from "@veloradesk/core/cloud-auth";
import {
  cloudRequest,
  cloudUsage,
  type CloudUsage,
} from "@veloradesk/core/cloud";
import { adoptLocalOnNextSignIn, cloudState } from "./cloud-state";
import { flushEditors } from "./editor-lifecycle";
export default function AccountPanel() {
  const account = useSyncExternalStore(
    cloudState.subscribe,
    cloudState.getSnapshot,
  );
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [adopt, setAdopt] = useState(true);
  const [usage, setUsage] = useState<CloudUsage | null>(null);
  const [google, setGoogle] = useState(false);
  useEffect(() => {
    let active = true;
    if (cloudConfig())
      void availableAuthProviders().then(
        (providers) => { if (active) setGoogle(providers.google); },
        () => {},
      );
    return () => { active = false; };
  }, []);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  if (!cloudConfig())
    return (
      <div className="ws-notice">
        <p>
          Cloud sync is not configured for this build. Pages, notes, journals,
          calendars, encryption, and exports work on this device.
        </p>
        <p className="ws-muted">
          Cloud setup is documented in the project’s setup checklist.
        </p>
      </div>
    );
  return (
    <div>
      {account.session ? (
        <>
          <p>
            Signed in as{" "}
            <strong>{account.session.user.email ?? "your account"}</strong>
          </p>
          <p role="status">
            {account.status.state === "synced"
              ? "Synced"
              : account.status.state === "syncing"
                ? "Syncing"
                : account.status.state === "offline"
                  ? "Offline"
                  : "Needs attention"}{" "}
            · {account.status.pending} pending changes
          </p>
          <div className="ws-settings-actions">
            <Pressable
              className="ws-button"
              disabled={busy}
              onClick={() => void run(() => cloudState.sync())}
            >
              Sync now
            </Pressable>
            <Pressable
              className="ws-button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await flushEditors();
                  await signOut();
                })
              }
            >
              Sign out
            </Pressable>
            <Pressable
              className="ws-button"
              disabled={busy}
              onClick={() => void run(async () => setUsage(await cloudUsage()))}
            >
              Check cloud storage
            </Pressable>
          </div>
          {usage && (
            <div>
              <label>
                Database: {(usage.databaseBytes / 1000000).toFixed(1)} /{" "}
                {usage.databaseLimit / 1000000} MB
                <progress
                  aria-label="Cloud database usage"
                  max={usage.databaseLimit}
                  value={usage.databaseBytes}
                />
              </label>
              <label>
                Files: {(usage.storageBytes / 1000000).toFixed(1)} /{" "}
                {usage.storageLimit / 1000000} MB
                <progress
                  aria-label="Cloud file usage"
                  max={usage.storageLimit}
                  value={usage.storageBytes}
                />
              </label>
              {usage.warning && (
                <p role="status">
                  Cloud storage is above 70%. Export and clean up before it
                  fills.
                </p>
              )}
            </div>
          )}
          <details>
            <summary>Delete my cloud data</summary>
            <p>
              Exports protect against accidental loss. This deletes synced
              records and connected calendar credentials.
            </p>
            <Pressable
              className="ws-button ws-danger"
              disabled={busy}
              onClick={() => {
                if (
                  prompt(
                    "Type DELETE CLOUD to permanently remove your synced data.",
                  ) !== "DELETE CLOUD"
                )
                  return;
                void run(async () => {
                  await cloudRequest("/functions/v1/delete-account", {});
                  await signOut();
                  setMessage("Cloud data deleted.");
                });
              }}
            >
              Delete cloud data
            </Pressable>
          </details>
        </>
      ) : (
        <>
          <label className="ws-setting-row">
            <input
              type="checkbox"
              checked={adopt}
              onChange={(event) => setAdopt(event.target.checked)}
            />
            Sync this device’s workspace after signing in
          </label>
          {google && <Pressable
            className="ws-button ws-tinted"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await flushEditors();
                adoptLocalOnNextSignIn(adopt);
                await signInGoogle();
              })
            }
          >
            Sign in with Google
          </Pressable>}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await flushEditors();
                adoptLocalOnNextSignIn(adopt);
                if (sent && code) {
                  await verifyEmailCode(email, code);
                } else {
                  await sendEmailCode(email);
                  setSent(true);
                  setMessage("Open the sign-in link in your email on this device.");
                }
              });
            }}
          >
            <label className="ws-field-label">
              Email
              <input
                className="ws-input"
                type="email"
                autoComplete="email"
                value={email}
                required
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            {sent && (
              <label className="ws-field-label">
                Email code (if provided)
                <input
                  className="ws-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </label>
            )}
            <Pressable type="submit" className="ws-button" disabled={busy}>
              {busy ? "Working…" : sent && code ? "Verify code" : sent ? "Resend email" : "Send sign-in email"}
            </Pressable>
            {sent && (
              <Pressable
                className="ws-button"
                disabled={busy}
                onClick={() => {
                  setSent(false);
                  setCode("");
                }}
              >
                Use another email
              </Pressable>
            )}
          </form>
        </>
      )}
      <p role="status">{message || account.error || account.status.error}</p>
    </div>
  );
}
