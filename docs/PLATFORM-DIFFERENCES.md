# Platform differences

Updated 2026-10-10. One shared React UI; native APIs are behind the platform adapter.

| Area | Implemented Phase 0 boundary | Remaining verification |
| --- | --- | --- |
| Offline shell | PWA precaches shell/editor assets; cached reload tested. Desktop bundles assets and registers no SW. | Safari/Home Screen storage retention, origin isolation and eviction recovery |
| Editor storage | IndexedDB snapshots merge transactionally; local tabs use BroadcastChannel. | Three real device clients, migrations, outbox/pull/cloud policies in Phase 1 |
| Home Screen | Manifest, adaptive theme, icon and safe-area CSS generated. | User installation on iPhone 15/iPad A16; real status bar, launch and keyboard |
| OAuth | Exact callback/CORS contracts and native forwarding scaffold. | System-browser PKCE request/code exchange; email-code auth; connected account setup |
| Background sync | No production sync yet; iOS suspension is an explicit boundary. | Foreground/reconnect flushing; never promise background execution |
| Layout | 320px–2560px captures, touch targets, keyboard palette and 200% text checks. | Native IME, VoiceOver/Narrator, Split View, keyboard/trackpad and safe-area hardware |
| Windows | Native frame, remembered window state, per-user unsigned NSIS, WebView2 bootstrapper configured. | CI installer, install/uninstall, Snap Layouts, display scaling and system title-bar theme |
| Haptics/Pencil | Optional platform fallback is a no-op; no product promise yet. | Platform detection, device haptics, P3 sketch/pressure |
| Reminders | No reminders/push implementation in Phase 0. | In-app P1 reminders, Home Screen web push P2 and native extras P3 |
| Updates | Password-protected key provisioned; private key ignored. | CI secrets, signed latest.json, actual N→N+1 update in Phase 1 |

Emulation is not physical-device evidence. Cached PWA operation requires an online
initial install and browser-retained storage. Origin changes need export/import
or future authenticated resync. Keep native differences out of normal product
flows except where users must choose installation, permissions or sign-in.
