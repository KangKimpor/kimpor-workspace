import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Pressable } from "@veloradesk/ui";
import { cloudConfig } from "@veloradesk/core/cloud-auth";
import { cloudState, startCloud } from "./cloud-state";
import SignInScreen from "./SignInScreen";

export function SyncRetry() {
  const account = useSyncExternalStore(cloudState.subscribe, cloudState.getSnapshot);
  if (!account.error && !account.status.error) return null;
  return <Pressable className="ws-sync-retry" aria-label="Retry sync" onClick={() => void cloudState.sync()}>
    <span className="ws-status-dot" />Retry
  </Pressable>;
}

export default function AccountGate({ children }: { children: ReactNode }) {
  const account = useSyncExternalStore(cloudState.subscribe, cloudState.getSnapshot);
  const [verifying, setVerifying] = useState(false);
  const complete = useCallback(() => setVerifying(false), []);
  const configured = !!cloudConfig();
  useEffect(() => configured ? startCloud() : undefined, [configured]);
  // Unconfigured builds are reserved for development and fixture verification.
  if (!configured) return children;
  if (!account.ready) return <main className="sign-in" aria-label="Loading"><div className="sign-in-skeleton" /></main>;
  if (!account.session || verifying)
    return <SignInScreen onSuccess={complete} onVerifying={setVerifying} initialError={account.error ? "Try again" : ""} />;
  return children;
}
