# Platform differences

Updated 2026-10-13. Shared React UI; native APIs are behind packages/core/platform.

| Area | Implemented behavior | Remaining verification / limits |
| --- | --- | --- |
| Cache | Dexie/IndexedDB owner partitions; body/file/setting export/import | Browser eviction and quota, OS-level disk recovery |
| Cached shell | Web SW claims clients; cached reload and edits tested; native assets omit SW | Physical Safari Home Screen retention, first install needs network |
| Sync | Foreground minute/focus/reconnect outbox; field HLC and Yjs; optional private Realtime hint | Live three-device convergence/latency, Realtime reconnect falls back to polling |
| OAuth | First-launch six-digit code entry, persistent sessions, PKCE/state/origin/expiry/replay checks; desktop system-browser forwarding; real email/Google sign-in preserves the original owner and data | Google remains Testing for the configured owner; native exchange unverified |
| Phone/tablet | Container widths: phone below 600px; 72px portrait tablet sidebar and single pane; 240px sidebar/list/detail above 1024px | Edge back, title collapse, sheet detents and simulated keyboard geometry tested; physical Split View/keyboard pending |
| Input | Synthetic IME guards; mixed Khmer/Chinese/English; editor keyboard/mouse/touch sensors | Native IME, selection, long-press dragging and Pencil pressure on real devices |
| Reminders | Central foreground scheduler; all-day 09:00 event zone; optional server Web Push; native adapter | iOS suspension prevents reliable offline closed-app reminders; live pushes pending |
| Encryption | AES-GCM bodies/sketches and attachments; recovery key; app-lock interface privacy | Metadata remains visible; old copied data keys/wrappers cannot be revoked |
| Windows extras | Tray, Ctrl+Shift+Space capture, optional autostart, native notifications and explicit updater | MSVC/NSIS and installation smoke checks pass; resident-memory budget fails. Physical scaling, SmartScreen and N→N+1 update unverified |
| Layout/accessibility | Original four browser profiles plus five requested viewports in both themes; 510 fixture captures | VoiceOver/Narrator, safe areas, OS haptics, physical device checklist |

The account holds the workspace; IndexedDB caches account partitions and pending
writes. Initial cache adoption pulls the account first, preserves existing account
fields and merges compatible Yjs text. App lock does not encrypt the cache.
