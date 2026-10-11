import { useEffect, useState, type ReactNode } from "react";
import { Pressable } from "@veloradesk/ui";
const storageKey = "velora-application-lock-v1";
interface LockRecord {
  salt: number[];
  proof: number[];
}
function readLock(): LockRecord | null {
  try {
    const record = JSON.parse(
      localStorage.getItem(storageKey) ?? "null",
    ) as LockRecord | null;
    return record &&
      Array.isArray(record.salt) &&
      record.salt.length === 16 &&
      Array.isArray(record.proof) &&
      record.proof.length === 32
      ? record
      : null;
  } catch {
    return null;
  }
}
async function proof(
  passphrase: string,
  salt: number[],
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: Uint8Array.from(salt),
        iterations: 310000,
      },
      key,
      256,
    ),
  );
}
export async function configureAppLock(passphrase: string): Promise<void> {
  if (passphrase.length < 8)
    throw new Error("Use a passphrase with at least eight characters.");
  const salt = [...crypto.getRandomValues(new Uint8Array(16))];
  localStorage.setItem(
    storageKey,
    JSON.stringify({ salt, proof: [...(await proof(passphrase, salt))] }),
  );
  window.dispatchEvent(new Event("velora-lock-configured"));
}
export async function removeAppLock(passphrase: string): Promise<void> {
  if (!(await checkAppLock(passphrase)))
    throw new Error("Incorrect app passphrase.");
  localStorage.removeItem(storageKey);
  window.dispatchEvent(new Event("velora-lock-configured"));
}
export async function checkAppLock(passphrase: string): Promise<boolean> {
  const record = readLock();
  if (!record) return true;
  const candidate = await proof(passphrase, record.salt);
  let difference = 0;
  candidate.forEach((value, index) => {
    difference |= value ^ record.proof[index]!;
  });
  return difference === 0;
}
export function AppLockSettings() {
  const [enabled, setEnabled] = useState(!!readLock());
  const [passphrase, setPassphrase] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section>
      <h3>App lock</h3>
      <p>
        Hide this app when it opens or stays in the background for five minutes.
        Encrypt individual notes or journal bodies in the editor for protection
        of stored data.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void (
            enabled ? removeAppLock(passphrase) : configureAppLock(passphrase)
          )
            .then(() => {
              setEnabled(!enabled);
              setPassphrase("");
              setMessage(
                enabled
                  ? "App lock removed."
                  : "App lock enabled. Keep your passphrase safe.",
              );
            })
            .catch((error) => setMessage(String(error)))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          App passphrase
          <input
            className="ws-input"
            type="password"
            value={passphrase}
            autoComplete={enabled ? "current-password" : "new-password"}
            minLength={8}
            required
            onChange={(event) => setPassphrase(event.target.value)}
          />
        </label>
        <Pressable
          type="submit"
          className="ws-button ws-tinted"
          disabled={busy}
        >
          {busy ? "Working…" : enabled ? "Remove app lock" : "Enable app lock"}
        </Pressable>
      </form>
      <p role="status">{message}</p>
    </section>
  );
}
export function ApplicationLock({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(!!readLock());
  const [passphrase, setPassphrase] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.appLocked = String(locked);
    if (locked) window.dispatchEvent(new Event("velora-application-locked"));
  }, [locked]);
  useEffect(() => {
    let hiddenAt = 0;
    const visibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        window.dispatchEvent(new Event("velora-flush-editors"));
      } else if (hiddenAt && Date.now() - hiddenAt >= 300000 && readLock())
        setLocked(true);
    };
    const lock = () => {
      if (readLock()) {
        window.dispatchEvent(new Event("velora-flush-editors"));
        setLocked(true);
      }
    };
    const configured = () => {
      if (!readLock()) setLocked(false);
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("velora-lock-app", lock);
    window.addEventListener("velora-lock-configured", configured);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("velora-lock-app", lock);
      window.removeEventListener("velora-lock-configured", configured);
    };
  }, []);
  return (
    <>
      {
        <div hidden={locked} inert={locked}>
          {children}
        </div>
      }
      {locked && (
        <main className="ws-app-lock">
          <div className="ws-card">
            <h1>Welcome back</h1>
            <p>Unlock Kimpor Workspace on this device.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setBusy(true);
                void checkAppLock(passphrase)
                  .then((valid) => {
                    setPassphrase("");
                    if (valid) {
                      setLocked(false);
                      setMessage("");
                    } else setMessage("Incorrect app passphrase.");
                  })
                  .catch(() => setMessage("Unable to unlock."))
                  .finally(() => setBusy(false));
              }}
            >
              <label>
                App passphrase
                <input
                  className="ws-input"
                  autoFocus
                  type="password"
                  autoComplete="current-password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  required
                />
              </label>
              <Pressable
                type="submit"
                className="ws-button ws-filled"
                disabled={busy}
              >
                {busy ? "Unlocking…" : "Unlock"}
              </Pressable>
              <p role="alert">{message}</p>
            </form>
          </div>
        </main>
      )}
    </>
  );
}
