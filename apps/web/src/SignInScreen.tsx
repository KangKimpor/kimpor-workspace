import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft } from "./Coolicons";

import { Pressable } from "@veloradesk/ui";
import { sendEmailCode, signInGoogle, verifyEmailCode } from "@veloradesk/core/cloud-auth";
import "./sign-in.css";

export default function SignInScreen({ onSuccess, onVerifying, initialError = "" }: {
  onSuccess: () => void; onVerifying: (value: boolean) => void; initialError?: string;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [resendAt, setResendAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [success, setSuccess] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);
  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(onSuccess, 650);
    return () => window.clearTimeout(timer);
  }, [success, onSuccess]);
  async function send() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      await sendEmailCode(email);
      setSent(true); setDigits(""); setResendAt(Date.now() + 30_000);
      requestAnimationFrame(() => input.current?.focus());
    } catch { setError("Try again"); setAttempt(value => value + 1); }
    finally { submitting.current = false; setBusy(false); }
  }
  async function verify(token: string) {
    if (submitting.current || success) return;
    onVerifying(true);
    submitting.current = true; setBusy(true); setError("");
    try { await verifyEmailCode(email, token); setSuccess(true); }
    catch {
      onVerifying(false);
      setError("Wrong code"); setAttempt(value => value + 1);
      setDigits(""); input.current?.focus();
    } finally { submitting.current = false; setBusy(false); }
  }
  function updateCode(value: string) {
    const token = value.replace(/\D/g, "").slice(0, 6);
    setDigits(token); setError("");
    if (token.length === 6) void verify(token);
  }
  return <main className={`sign-in${success ? " sign-in-success" : ""}`} aria-label="Sign in">
    <div className="sign-in-card">
      <img className="sign-in-mark" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="Kimpor Workspace" width="64" height="64" />
      {success ? <div className="sign-in-check" role="status" aria-label="Signed in"><Check size={44} /></div> : sent ? <>
        <Pressable className="ws-icon sign-in-back" aria-label="Change email" disabled={busy}
          onClick={() => { setSent(false); setDigits(""); setError(""); }}><ChevronLeft size={22} /></Pressable>
        <h1>Enter code</h1>
        <form onSubmit={event => { event.preventDefault(); if (digits.length === 6) void verify(digits); }}>
          <div key={attempt} className={`sign-in-code${error ? " sign-in-shake" : ""}`}>
            <div className="sign-in-boxes" aria-hidden="true">{Array.from({ length: 6 }, (_, i) =>
              <span key={i} data-active={i === digits.length}>{digits[i] ?? ""}</span>)}</div>
            <input ref={input} autoFocus aria-label="Email code" inputMode="numeric" autoComplete="one-time-code"
              pattern="[0-9]{6}" maxLength={6} value={digits} disabled={busy}
              onChange={event => updateCode(event.target.value)}
              onPaste={event => { event.preventDefault(); updateCode(event.clipboardData.getData("text")); }} />
          </div>
          {busy && <div className="sign-in-skeleton" role="status" aria-label="Verifying" />}
          <Pressable className="ws-button sign-in-resend" disabled={busy || remaining > 0} onClick={() => void send()}>
            {remaining > 0 ? `Resend ${remaining}s` : "Resend"}
          </Pressable>
        </form>
      </> : <>
        <Pressable className="ws-button ws-filled sign-in-google" disabled={busy}
          onClick={() => { setBusy(true); setError(""); void signInGoogle().catch(() => { setError("Try again"); setBusy(false); }); }}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2.2H12v4.2h5.4a4.7 4.7 0 0 1-2 3.1v2.6h3.2c1.9-1.8 3-4.4 3-7.7ZM12 22c2.7 0 5-1 6.6-2.5l-3.2-2.6c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.8-5.6-4.2H3.1v2.7A10 10 0 0 0 12 22ZM6.4 13.6a6 6 0 0 1 0-3.2V7.7H3.1a10 10 0 0 0 0 8.6l3.3-2.7ZM12 6.2c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.5 9.5 0 0 0 12 2a10 10 0 0 0-8.9 5.7l3.3 2.7C7.2 8 9.4 6.2 12 6.2Z" /></svg>
          Continue with Google
        </Pressable>
        <div className="sign-in-divider" aria-hidden="true" />
        <form onSubmit={event => { event.preventDefault(); void send(); }}>
          <input className="ws-input" type="email" aria-label="Email" placeholder="Email" autoComplete="email"
            autoCapitalize="none" required value={email} disabled={busy} onChange={event => setEmail(event.target.value)} />
          <Pressable type="submit" className="ws-button sign-in-continue" disabled={busy}>Continue</Pressable>
        </form>
        {busy && <div className="sign-in-skeleton" role="status" aria-label="Signing in" />}
      </>}
      {error && !success && <span className="sign-in-error" role="alert">{error}</span>}
    </div>
  </main>;
}
