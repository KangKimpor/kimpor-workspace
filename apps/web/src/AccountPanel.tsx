import { useState, useSyncExternalStore } from "react";
import { Pressable } from "@veloradesk/ui";
import { signOut } from "@veloradesk/core/cloud-auth";
import { cloudRequest, cloudUsage, type CloudUsage } from "@veloradesk/core/cloud";
import { cloudState } from "./cloud-state";
import { flushEditors } from "./editor-lifecycle";

export default function AccountPanel() {
  const account = useSyncExternalStore(cloudState.subscribe, cloudState.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState<CloudUsage | null>(null);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); } catch { setError("Try again"); } finally { setBusy(false); }
  }
  if (!account.session) return null;
  return <div>
    <div className="ws-setting-row"><span>{account.session.user.email ?? "Account"}</span>
      <Pressable className="ws-button" disabled={busy} onClick={() => void run(async () => { await flushEditors(); await signOut(); })}>Sign out</Pressable>
    </div>
    <details><summary>Storage</summary>
      <Pressable className="ws-button" disabled={busy} onClick={() => void run(async () => setUsage(await cloudUsage()))}>Refresh</Pressable>
      {usage && <div>
        <label>Database<progress aria-label="Database usage" max={usage.databaseLimit} value={usage.databaseBytes} /></label>
        <label>Files<progress aria-label="File usage" max={usage.storageLimit} value={usage.storageBytes} /></label>
      </div>}
    </details>
    <details><summary>Delete account</summary>
      <Pressable className="ws-button ws-danger" disabled={busy} onClick={() => {
        if (prompt("Type DELETE ACCOUNT to permanently delete your account data.") !== "DELETE ACCOUNT") return;
        void run(async () => { await cloudRequest("/functions/v1/delete-account", {}); await signOut(); });
      }}>Delete account</Pressable>
    </details>
    {error && <span role="alert">{error}</span>}
  </div>;
}
