# ADR 0004: System browser, PKCE and exact callbacks

2026-10-10. Tauri 2.12.2, native WebView2 frame, per-user NSIS, single instance,
`veloradesk://auth/callback`, and system-browser OAuth. Embedded OAuth is rejected;
loopback redirect is the fallback. Platform adapters own native APIs and theme.

Contract tests reject wrong scheme/path/state, lookalike CORS origins, duplicate
parameters, fragments and expiry. The Windows smoke check exercises install,
protocol registration, window, second-instance forwarding and normal exit.
Neither is a live Supabase/provider code exchange.

Phase 1 must generate a random state/verifier, SHA256 PKCE challenge, bind one
pending flow to its expiry, consume it once and exchange a validated code. The
connected account must be configured before live auth testing. Go for scaffold;
live sign-in is unverified. Never embed provider login in the webview.
