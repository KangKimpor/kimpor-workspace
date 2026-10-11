# Platform differences

Updated 2026-10-11. Shared React UI; native APIs are behind packages/core/platform.

| Area | Implemented behavior | Remaining verification / limits |
| --- | --- | --- |
| Local storage | Dexie/IndexedDB owner partitions; body/file/setting export/import | Browser eviction and quota, OS-level disk recovery |
| Offline shell | Web SW claims clients; cached reload and edits tested; native assets omit SW | Physical Safari Home Screen retention, first install needs network |
| Sync | Foreground minute/focus/reconnect outbox; field HLC and Yjs; optional private Realtime hint | Live three-device convergence/latency, Realtime reconnect falls back to polling |
| OAuth | Email code, PKCE/state/origin/expiry/replay checks; desktop system-browser forwarding | Real Supabase/Google code exchange and Windows protocol registration |
| Phone/tablet | Bottom tabs below 600px, sidebar above, three panes above 1024px, resizing | Edge-swipe back, collapsing titles and sheet detents are gaps; physical Split View/keyboard |
| Input | Synthetic IME guards; mixed Khmer/Chinese/English; editor keyboard/mouse/touch sensors | Native IME, selection, long-press dragging and Pencil pressure on real devices |
| Reminders | Central foreground scheduler; all-day 09:00 event zone; optional server Web Push; native adapter | iOS suspension prevents reliable offline closed-app reminders; live pushes pending |
| Encryption | AES-GCM bodies/sketches and attachments; recovery key; app-lock interface privacy | Metadata remains visible; old copied data keys/wrappers cannot be revoked |
| Windows extras | Tray, Ctrl+Shift+Space capture, optional autostart, native notifications and explicit updater | MSVC/NSIS and installation smoke checks pass; resident-memory budget fails. Physical scaling, SmartScreen and N→N+1 update unverified |
| Layout/accessibility | Automated four-engine profiles, both themes and viewport matrix | VoiceOver/Narrator, safe areas, OS haptics, physical device checklist |

Changing web origins changes local storage. Export/import before moving a local-only
workspace. Cloud service failure leaves local data available. Keep backups even
when sync is configured. App lock does not encrypt the IndexedDB store.
