import { useEffect, useState } from "react";
import { Pressable } from "@veloradesk/ui";
import { platform } from "@veloradesk/core/platform";
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export default function InstallSettings() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(
    matchMedia("(display-mode: standalone)").matches,
  );
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (platform.desktop) return;
    const ready = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const done = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  if (platform.desktop) return null;
  return (
    <section>
      <h3>Install Kimpor Workspace</h3>
      <p>
        {installed
          ? "Kimpor Workspace is installed."
          : "Add Kimpor Workspace to your Home Screen for a full-screen workspace and supported background reminders."}
      </p>
      {prompt && !installed ? (
        <Pressable
          className="ws-button ws-tinted"
          onClick={() =>
            void prompt
              .prompt()
              .then(() => prompt.userChoice)
              .then((result) => {
                setMessage(
                  result.outcome === "accepted"
                    ? "Installation requested."
                    : "You can install later.",
                );
                setPrompt(null);
              })
          }
        >
          Install app
        </Pressable>
      ) : (
        !installed && (
          <p>
            On iPhone or iPad in Safari, use Share → Add to Home Screen. On
            other browsers, look for “Install app” in the address bar or browser
            menu.
          </p>
        )
      )}
      <p role="status">{message}</p>
    </section>
  );
}
