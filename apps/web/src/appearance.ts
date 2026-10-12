import { store } from "@veloradesk/core/store";
import { platform } from "@veloradesk/core/platform";
const keys = [
  "velora-theme",
  "velora-accent",
  "velora-text-size",
  "velora-density",
  "velora-reduce-motion",
];
function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* IndexedDB remains authoritative for sync. */
  }
}
export function saveAppearance(key: string, value: string): void {
  write(key, value);
  window.dispatchEvent(new Event("velora-appearance"));
  void store
    .setSetting(key, value)
    .catch(() =>
      window.dispatchEvent(
        new CustomEvent("velora-appearance-error", {
          detail:
            "Try again",
        }),
      ),
    );
}
export function startAppearance(): () => void {
  let stopped = false,
    timer: ReturnType<typeof setTimeout> | undefined;
  const apply = () => {
    const preference = read("velora-theme") ?? "system",
      theme =
        preference === "dark" || preference === "light"
          ? preference
          : matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.accent = read("velora-accent") ?? "blue";
    document.documentElement.dataset.reduceMotion =
      read("velora-reduce-motion") ?? "false";
    document.documentElement.dataset.density =
      read("velora-density") ?? "comfortable";
    document.documentElement.style.setProperty(
      "--text-body",
      `${Math.max(15, Math.min(24, Number(read("velora-text-size")) || 15))}px`,
    );
    void platform.applyTheme(theme).catch(() => {});
  };
  const pull = async () => {
    const owner = store.accountId;
    const values = await Promise.all(
      keys.map((key) => store.getSetting<string | null>(key, null)),
    );
    if (stopped || owner !== store.accountId) return;
    let changed = false;
    for (const [index, key] of keys.entries()) {
      const value = values[index];
      if (typeof value === "string" && value !== read(key)) {
        write(key, value);
        changed = true;
      }
    }
    apply();
    if (changed) window.dispatchEvent(new Event("velora-appearance"));
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void pull().catch(() => {});
    }, 150);
  };
  const media = matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", apply);
  window.addEventListener("velora-appearance", apply);
  window.addEventListener("storage", apply);
  apply();
  const unsubscribe = store.subscribe(schedule);
  void store
    .ready()
    .then(pull)
    .catch(() => {});
  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
    media.removeEventListener("change", apply);
    window.removeEventListener("velora-appearance", apply);
    window.removeEventListener("storage", apply);
  };
}
