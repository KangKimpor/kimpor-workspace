import { useEffect, useState } from "react";
import { Pressable } from "@veloradesk/ui";
import { platform } from "@veloradesk/core/platform";
import { flushEditors } from "./editor-lifecycle";

export default function AppUpdateNotice() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    if (platform.desktop || !navigator.serviceWorker) return;
    let stopped = false;
    const cleanups: (() => void)[] = [];
    const watched = new Set<ServiceWorkerRegistration>();
    const watch = (registration: ServiceWorkerRegistration) => {
      if (stopped || watched.has(registration)) return;
      watched.add(registration);
      const check = () => { if (!stopped) setWaiting(registration.waiting); };
      const installing = () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", check);
        cleanups.push(() => worker.removeEventListener("statechange", check));
      };
      check(); installing();
      registration.addEventListener("updatefound", installing);
      cleanups.push(() => registration.removeEventListener("updatefound", installing));
    };
    const registered = (event: Event) => watch((event as CustomEvent<ServiceWorkerRegistration>).detail);
    window.addEventListener("workspace-sw", registered);
    void navigator.serviceWorker.getRegistration().then(registration => { if (registration) watch(registration); }).catch(() => {});
    return () => { stopped = true; window.removeEventListener("workspace-sw", registered); cleanups.forEach(cleanup => cleanup()); };
  }, []);
  if (!waiting) return null;
  return <div className="ws-update-notice" role="status"><span>{error || "A new version is ready."}</span><Pressable className="ws-button ws-filled" disabled={updating} onClick={() => {
    setUpdating(true);
    void flushEditors().then(() => {
      navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
      waiting.postMessage({ type: "SKIP_WAITING" });
    }).catch(cause => { setError(String(cause)); setUpdating(false); });
  }}>Reload to update the app</Pressable></div>;
}
