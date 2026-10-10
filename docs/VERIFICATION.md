# Verification ledger

2026-10-10. No product module is complete. “Verified by me” means the user's
confirmed physical-device check; none has been supplied in this session.

| Check | Actual evidence | User device verification | Status |
| --- | --- | --- | --- |
| Install/lint/typecheck/web build | Frozen pnpm lock; ESLint, tsc and Vite builds pass | — | tested locally |
| Core contracts | 10 tests; 500 generated LWW merge cases; clocks, quota, callback/CORS and three offline Yjs clients | — | tested locally |
| Contract coverage | 100% lines/statements/functions; 97.56% branches, four scoped contract modules only | — | tested; not whole-app coverage |
| Gallery/editor flows | 32 Playwright checks across Chromium, WebKit, Firefox and phone WebKit | — | tested locally |
| Accessibility | Axe WCAG A/AA 2.0/2.1/2.2 scans of gallery/editor/about, both themes; zero returned violations | — | tested automatically; screen readers pending |
| Feedback/layout | Every visible enabled button/input changes style within 100ms; 44px targets; narrow layouts and 200% text | — | tested locally |
| PWA offline reload | Installed SW controls page; offline reload, multilingual edit and reconnect/reload preserve text | — | tested in all four browser profiles |
| Local editor/Yjs | Actual TipTap binding, transactional IndexedDB snapshots, two-tab BroadcastChannel exchange | — | tested; not cloud sync |
| Keyboard row drag | Separate sample rows reorder with Space/arrows/Space | — | tested; not rich-text block/touch drag |
| IME guard | Synthetic composing slash key suppresses menu; multilingual content persists | — | native IME/selection pending |
| Screenshots | 96 captures: four screens × twelve matrix entries × light/dark; eight contact sheets inspected | — | generated/reviewed locally |
| Dark WebKit regression | Previously black inherited headings now retain contrast in landscape and portrait after full capture | — | fixed and tested |
| Visual pixel gate | pixelmatch comparison script, 0.1% changed-pixel threshold and CI candidate workflow | — | CI baseline pending; visual:check deliberately fails without it |
| JS budgets | 126.9 KiB gzip initial graph; 199.4 KiB additional lazy editor graph; each below 250 KiB | — | tested; SW precache separately downloads assets |
| Semantic colors | 44 token pairs pass text/focus/icon thresholds; white/gradient minimum 4.32:1 | — | tested locally |
| Lighthouse | One local desktop run: Performance 100, Accessibility 100, Best Practices 100, SEO 91; LCP 422ms, TBT 33.5ms, CLS 0.000294 | — | budget assertions pass; not a device benchmark |
| Brand | Private JPEG → isolated A/B/C centerlines; scored contact sheet; selected A; SVG/PNG/ICO/NSIS assets | — | traced/exported/reviewed; OS masking/scaling pending |
| JS licenses | Locked installed dependency inventory; narrow reviewed build-only libvips and BSD metadata cases | — | audited locally |
| Rust licenses | 291 Windows-resolved Cargo packages' license expressions, locked target metadata | — | audited; native compile separate |
| Tauri configuration | CLI JSON schema validates; Cargo.lock generated; plugins/capabilities/Rust/NSIS scaffold | — | native build pending |
| Desktop OAuth/CORS | Exact callback/state/expiry and CORS contracts | — | tested contracts; live provider exchange pending |
| Workflows and secrets | actionlint v1.7.12 reports no errors; verified gitleaks binary/checksum and pre-commit scans pass | — | tested locally; remote execution pending |
| GitHub/public CI | Auth identifies KangKimpor; repo create rejected with integration 403 | — | blocked; workflows are unrun |
| Pages subpath | Local production/CSP build under /veloradesk/: direct gallery, editor navigation and controlled offline reload pass in Chromium/WebKit | — | tested locally; no public deployment |
| Public preview/NSIS | Portable Pages/Vercel and Windows smoke workflows prepared | — | not deployed/built |
| iPhone/iPad/Windows native behavior | DEVICE-TEST.md supplied; no physical hardware access | — | unverified |

See [screenshot matrix](evidence/screenshot-matrix.json), [contrast](evidence/contrast.json),
[Lighthouse summary](evidence/lighthouse-summary.json), [JS licenses](evidence/dependency-licenses.json)
and [Windows crate inventory](evidence/cargo-windows-licenses.json).

CI records are not available. No live cloud schema, RLS, OAuth sign-in, email
sender, cross-device transport, outbox/pull engine, updater delivery or device
performance has been verified. Source license expressions are not a binary
redistribution notice audit. Physical device install, IME, selection, touch drag,
safe areas, haptics and VoiceOver/Narrator are explicit manual gates.
