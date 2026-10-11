import { platform } from "@veloradesk/core/platform";
import type { CalendarEvent } from "@veloradesk/core/model";

function subscriptionKey(value: string): Uint8Array<ArrayBuffer> {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}
export async function enablePush(): Promise<string> {
  if (platform.desktop) {
    const granted = await platform.requestNotificationPermission();
    if (!granted) throw new Error("Notification permission was not granted.");
    return "Windows notifications enabled while Kimpor Workspace is running.";
  }
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    throw new Error(
      "Install Kimpor Workspace on your Home Screen to use notifications, or use a browser that supports Web Push.",
    );
  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!publicKey)
    throw new Error(
      "Background reminders need cloud notification configuration. In-app reminders work while Kimpor Workspace is open.",
    );
  const { cloudRequest } = await import("@veloradesk/core/cloud");
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("Notification permission was not granted.");
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: subscriptionKey(publicKey),
    }));
  try {
    await cloudRequest("/functions/v1/push-register", {
      subscription: subscription.toJSON(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  } catch (error) {
    await subscription.unsubscribe();
    throw error;
  }
  return "Background reminders enabled for your synced calendar events.";
}
export async function disablePush(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const { cloudRequest } = await import("@veloradesk/core/cloud");
  await cloudRequest("/functions/v1/push-register", {
    unsubscribe: true,
    endpoint: subscription.endpoint,
  });
  await subscription.unsubscribe();
}
/** The foreground scheduler makes no promise of reminders while an offline web app is closed. */
export function startReminders(
  getEvents: () => CalendarEvent[],
  announce: (message: string) => void,
): () => void {
  const fired = new Set<string>();
  let previous = Date.now() - 60_000;
  let checking = false;
  const check = async () => {
    if (checking) return;
    checking = true;
    const now = Date.now();
    try {
      const { expandEvents, occurrenceReminderTime } =
        await import("@veloradesk/integrations");
      for (const event of getEvents()) {
        if (event.deletedAt || event.reminderMinutes <= 0) continue;
        const lead = Math.min(event.reminderMinutes, 7 * 24 * 60) * 60_000;
        let occurrences;
        try {
          occurrences = expandEvents(
            [event],
            new Date(previous - (event.allDay ? 86_400_000 : 0)).toISOString(),
            new Date(
              now + lead + 60_000 + (event.allDay ? 86_400_000 : 0),
            ).toISOString(),
          );
        } catch {
          continue;
        }
        for (const occurrence of occurrences) {
          const time = occurrenceReminderTime(
            occurrence.start,
            event.startZone,
            event.reminderMinutes,
          );
          const id = `${event.id}:${occurrence.start}:${event.reminderMinutes}`;
          if (time > previous && time <= now && !fired.has(id)) {
            fired.add(id);
            const message = `${event.title || "Event"} starts ${event.reminderMinutes ? `in ${event.reminderMinutes} minutes` : "now"}.`;
            announce(message);
            void platform
              .canNotify()
              .then((granted) => {
                if (granted)
                  return platform.notify({
                    title: "Kimpor Workspace reminder",
                    body: message,
                  });
              })
              .catch(() => undefined);
          }
        }
      }
      previous = now;
      if (fired.size > 1000) fired.clear();
    } finally {
      checking = false;
    }
  };
  const wake = () => {
    void check().catch(() => undefined);
  };
  wake();
  const timer = setInterval(wake, 15_000);
  window.addEventListener("focus", wake);
  return () => {
    clearInterval(timer);
    window.removeEventListener("focus", wake);
  };
}
