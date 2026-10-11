# ADR 0004: System browser, PKCE and exact callbacks

2026-10-10. Tauri 2.12.2, native WebView2 frame, per-user NSIS, single instance,
`kimpor-workspace://auth/callback`, and system-browser OAuth. Embedded OAuth is rejected;
loopback redirect is the fallback. Platform adapters own native APIs and theme.

Contract tests reject wrong scheme/path/state, lookalike CORS origins, duplicate
parameters, fragments and expiry. The Windows smoke check exercises install,
protocol registration, window, second-instance forwarding and normal exit.
Neither is a live Supabase/provider code exchange.

The implementation generates random state/verifier and SHA256 PKCE challenges,
binds one pending flow to its expiry, consumes it once and validates the return
before exchanging the code. Both provider OAuth and default email sign-in links
use this binding. Optional six-digit codes work with a configured custom sender.
Live temporary Auth grants pass; real user email delivery and native browser
exchange remain unverified. Never embed provider login in the webview.
