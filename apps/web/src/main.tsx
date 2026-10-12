import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import "./font.css";
import "@veloradesk/ui/tokens.css";
import "./style.css";
import { platform } from "@veloradesk/core/platform";
import { ApplicationLock } from "./ApplicationLock";
import "./app-lock.css";
const FoundationApp = lazy(() =>
  import("./App").then((module) => ({ default: module.App })),
);
import WorkspaceApp from "./WorkspaceApp";
const AccountGate = lazy(() => import("./AccountGate"));

// Resolve appearance before the first React layout, including container queries.
let savedTheme = "system";
try {
  savedTheme = localStorage.getItem("velora-theme") ?? "system";
} catch {
  /* Storage is optional. */
}
document.documentElement.dataset.theme =
  savedTheme === "dark" || savedTheme === "light"
    ? savedTheme
    : matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";

function Router() {
  const [path, setPath] = React.useState(location.pathname);
  React.useEffect(() => {
    const change = () => setPath(location.pathname);
    window.addEventListener("popstate", change);
    return () => window.removeEventListener("popstate", change);
  }, []);
  const foundation = path.includes("/design") || path.includes("/spikes/");
  React.useLayoutEffect(() => {
    document.getElementById("root")!.dataset.workspace = String(!foundation);
  }, [foundation]);
  return (
    <Suspense
      fallback={
        <div className="loading" role="status">
          Opening your workspace…
        </div>
      }
    >
      {foundation ? (
        <FoundationApp />
      ) : (
        <ApplicationLock>
          <AccountGate><WorkspaceApp /></AccountGate>
        </ApplicationLock>
      )}
    </Suspense>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>,
);
if (!platform.desktop && "serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => {
        /* First load remains usable if registration is blocked. */
      });
  });
}
