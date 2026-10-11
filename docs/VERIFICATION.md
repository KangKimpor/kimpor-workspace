# Verification ledger

Updated 2026-10-11. “Tested” describes the stated automated/local evidence, not a
completed physical release. The physical **Verified by user** column is
intentionally blank: no confirmed device results have been supplied.

| Feature / gate | Evidence and supported behavior | Status / limit | Verified by user |
| --- | --- | --- | --- |
| Build, lint and strict types | Frozen dependency graph; pnpm check | Tested locally | |
| Core coverage | 66 Vitest tests; whole packages/core source line coverage above 85% | Tested; not whole-app/native/backend coverage | |
| Browser profiles | Foundation + product + feature suites; Chromium, WebKit, Firefox, 320px phone WebKit | Tested locally; final totals in report | |
| Phone tabs and capture | Five bottom tabs, capture sheet, 44px targets, safe-area CSS | Tested/emulated | |
| Collapsing titles, edge-swipe back, sheet detents | Today title collapse, phone edge-back flush, 56/92dvh sheets | Eight browser checks pass; touch on physical devices pending | |
| Sidebar and three panes | Sidebar from 600px, three panes from 1024px, drag resizing | Captured/tested; desktop collapse toggle added/tested | |
| Command palette and shortcuts | Ctrl/Cmd+K, local results, IME/keyCode229 guard, modal focus return | Browser-tested; physical keyboards/IME pending | |
| Today date/events/journal/recents | Seeded screenshots and navigation/reload test | Tested locally | |
| Today tasks and pinned pages | Built-in Tasks schema, completion, favorites | Implemented; dedicated task UI coverage pending | |
| Quick capture and empty states | Unified create controls, theme-aware SVGs, optimistic writes | Browser/capture evidence | |
| Unified pages/notes/journals/rows | Dexie owner store and shared Yjs bodies | Unit/browser-tested | |
| Unlimited nesting and breadcrumbs | Cycle-checked parent links, windowed tree and scrolled nested branch benchmark | Tested locally; arbitrary-depth hardware performance unverified | |
| Reorder and reparent | Exact rational ranks, mouse tree drops, Move sheet | Order/property tests; native touch tree drag gap | |
| Favorites, recents and tags | Store fields and UI controls | Implemented/captured; dedicated UI tests pending | |
| Trash restore | Soft delete/tombstone/restore and parent descendants | Store-tested; automatic 30-day purge absent | |
| Duplicate and move | Page/body duplicate and parent move | Store-tested; duplicate attachment ownership needs further coverage | |
| Page icon/cover/full width | Icon picker, gradient covers and width toggle | Implemented; uploaded covers absent | |
| Backlinks and mentions | @ / [[ page links, date mention, body index and delegated link navigation | Insert/save/reload/follow/backlink browser case; copied hash URLs and renamed-title backlinks need coverage | |
| Paragraph/headings/lists/checklists | TipTap StarterKit and task blocks | Browser editor evidence | |
| Toggle/quote/callout/divider/table | Custom blocks and table controls | Implemented; per-block browser cases pending | |
| Code highlighting | Lazy six-language highlighter | Implemented; dedicated highlighting cases pending | |
| Inline formatting/color/Markdown shortcuts | TipTap marks and command controls | Implemented; not exhaustive formatting round-trip | |
| Slash menu and IME guard | Block menu and composing suppression | Browser-tested (synthetic IME) | |
| Editor drag / long press | dnd-kit mouse/touch/keyboard sensors | Keyboard study tested; real touch block drag pending | |
| Undo/redo/find | Yjs history and local find controls | Implemented; exhaustive undo cases pending | |
| Files and images | Compressed image/file picker, encrypted bytes, local blob URLs and sync metadata | File protection/reload browser-tested; camera/paste hardware pending | |
| Columns | Two/three columns; narrow screens stack | Browser-tested (two columns) | |
| Equations | Lazy KaTeX LaTeX HTML+MathML, untrusted commands disabled | Browser-tested with fraction/root | |
| Editor save-before-navigation | Registered body/title/file/protection flushes | Browser navigation/reload evidence | |
| PWA offline edit/reload | Real SW controls, cached reload, text retained after reconnect | Four browser profiles; physical eviction pending | |
| Calendar day/week/month/agenda | Local views and switching | Browser-tested/captured | |
| Mini month/week number/first day/clock | Calendar preferences and navigator | Implemented; preference UI matrix pending | |
| All-day/current-time line | Date-only events and timed grid | Captured; physical timezone scenarios pending | |
| Event fields and linked notes | Title/times/zones/location/notes/reminder/color/calendar/busy/URL/page | Local creation tested; exhaustive field UI pending | |
| RRULE recurrence | COUNT/UNTIL/BYDAY/EXDATE, daily/week/month/year, DST | Integration tests and recurring UI creation | |
| Recurrence edit scopes | This/following/all and split logic | Unit-tested; live provider overrides limited | |
| Calendar gestures | 15-minute create/move/resize and touch delay | Snap/logic tested; native gestures pending | |
| Natural-language add | chrono-node parsing with wall-clock conversion | Integration-tested | |
| Local calendars/visibility/default | Owner rows and preferences | Store-tested; dedicated source-control UI pending | |
| In-app reminders | Central scheduler; None=0; all-day 09:00 startZone | Timezone math tested; end-to-end timer coverage pending | |
| Notes folders/subfolders/pins | Shared page links and notes folder controls | Implemented/captured; dedicated folder tests pending | |
| Notes list/gallery/sort/convert | Shared data, view selector and type conversion | Implemented; exhaustive UI coverage pending | |
| Sketching | perfect-freehand pressure/velocity; same Y.Doc as body | Implemented; Pencil/pen hardware unverified | |
| Protected notes/journals | AES-GCM/PBKDF2, wrong password rejection, recovery wrapper and key in memory | Crypto/browser tests | |
| Encrypted convergence/compaction | Three clients; only decrypted known shards superseded; unseen edits survive | Unit-tested; SQL known-ID deletion tested | |
| Protection cleanup | Plain bodies/versions/index/outbox purged; server rejects stale plaintext | Unit + PostgreSQL and live plaintext purge/quota checks pass | |
| Protected file privacy | Ciphertext in attachment store; file keys in encrypted document | Browser bytes/reload + crypto tests | |
| Recovery/passphrase reset | Recovery rewrap with monotonic wrapVersion | Unit-tested; old copied keys/wrappers not revoked | |
| Journal date/prompts/templates/mood | Shared editor, daily entry and controls | Journal navigation/reload tested; extra controls implemented | |
| Journal heatmap/streak/memories/focus | Calendar summary and same-date past entries | Implemented/captured; exhaustive UI tests pending | |
| Journal location/weather | Off; no calls made | Gap: opt-in feature absent | |
| App lock | Passphrase verifier, hidden/inert workspace, background lock | Wrong/correct unlock and palette exclusion browser-tested; no disk encryption | |
| Search | Web Worker, Intl.Segmenter Khmer/Chinese, type/date filters; protected bodies excluded | Mixed-body/IME browser tests; warm 10k-item worker queries pass sampled 50 ms target | |
| Appearance settings | System/light/dark, five accents, text size, motion and density; owner sync | Captured/contrast-checked; large lists resize without row overlap; live preference sync unverified | |
| Language/region and diagnostics | English UI, locale/timezone diagnostic display | Implemented; translations and general region editor absent | |
| Local delete data | Scoped store deletion with explicit confirmation text | Store-tested; dedicated destructive UI coverage pending | |
| Markdown/JSON/ICS import/export | Supported Markdown blocks, full canonical JSON, folded Unicode ICS | Integration/core round-trip tests; rich Markdown fidelity limited | |
| Full ZIP backup/restore | Canonical bodies/settings/file ciphertext/envelopes/versions | Core round-trip/corruption tests; 100MB/10k-item import cap | |
| CSV/Notion ZIP import | CSV parser, parent hierarchy and encrypted referenced media | Core and four browser import/download checks pass; proprietary Notion layout/history not portable | |
| Database table/list/board | Typed row fields and shared row page | Browser row creation and views tested | |
| Database calendar/gallery | Date/cover views over same rows | Browser switching tested; populated calendar mapping needs more coverage | |
| Database typed properties | Title/text/number/select/multi/status/date/checkbox/URL/email/phone/files | Implemented; files property is text references, not a full picker | |
| Filters/sorts/groups/saved views | Nested AND/OR filter and view settings | Implemented/store-tested; exhaustive UI combinations pending | |
| Relations/rollups | Row links and aggregate calculations | Implemented; dedicated UI/edge cases pending | |
| Version history/templates | Local saved Yjs versions; recovery and prompt/task templates | Store restore tests; encrypted history intentionally unavailable | |
| Cloud email/Google auth | Six-digit flow and PKCE/state/refresh/account tests; actual saved Site URL/three return patterns and six-digit provider setting | Live email confirmation observed for the requested owner; default sender team-only; Google/native exchange unverified | |
| Owner isolation | Local partitions, SQL RLS, owner-qualified private file paths; no credential client reads | Unit/PostgreSQL and actual gateway/private Storage owner/foreign checks pass | |
| Outbox and merge engine | Three offline clients, pages/events/properties/text, retries and account-switch guard | Unit-tested with in-memory transport; real-device <5s sync unverified | |
| Realtime/polling | Tiny private broadcast hint, debounce; minute/focus/online polling | SQL/transport implementation; Realtime reconnect uses polling fallback | |
| Attachment cloud transport | Multipart ciphertext upload, digest/idempotency, authenticated owner download | Live ciphertext upload/download and foreign-owner denial pass; public UI decrypt/download exact bytes passes | |
| Quotas and waking/offline states | 70% storage warning, global fail-closed write checks, retained outbox | Unit/SQL-tested; Edge/egress/Realtime dashboard meters absent | |
| Google multi-account | Encrypted tokens, cursor410 reset/paging/etag/idempotent create; EXDATE/TZID DST normalization | Deno fixtures; real consent/7-day tokens/instance cancellations unverified | |
| Outlook | Safe Graph delta URLs and encrypted OAuth | Fixtures; recurring writes explicitly unsupported; live setup unverified | |
| iCloud/CalDAV | Discovery, REPORT, conditional writes and app-specific credentials; trusted public hosts | Typechecked; real server/Radicale/Apple behavior unverified | |
| ICS subscriptions | Read-only HTTPS import, bounded body/DNS/redirect checks, scheduler tombstones | URL fixtures; live polling/redirect behavior unverified | |
| Provider disconnect/revocation | Google revoke call; account credential removal | Implemented; Outlook/CalDAV require provider-side manual revocation | |
| Closed-app Web Push | VAPID registration and bounded recurring maintenance delivery | Code/typechecked; no live delivery; best-effort retry/dedup limits | |
| Scheduled maintenance | 15-minute SQL job, bounded calendar polling, plain snapshot CAS | SQL CAS tested; actual pg_cron requests returned HTTP 200 | |
| Scheduled encrypted backup | Consistent owner export RPC, AES-GCM artifact, wrong-key/tamper rejection | CLI tested; live export/restore and schedule unverified | |
| Daily keepalive | Secret-protected real database health RPC | SQL/typechecked; unconfigured schedule, no availability guarantee | |
| Windows tray/autostart/hotkey/notifications | Scoped Tauri plugins and native commands | Actual MSVC/NSIS builds pass; native extras need physical-device checks | |
| Windows updater | Signature verification, explicit consent, flush and pending-sync restart guard | Adapter tests; actual N→N+1/device verification absent | |
| NSIS/checksum/release | Real Windows MSVC/NSIS build; install/window/forwarding/exit/uninstall checks; new rendered-UI/note-reload gate | Memory varied: repeated failures then 143.9 MiB pass; stronger rendered-app result recorded separately. Candidates/checksums retained; no tagged release | |
| Original brand/privacy | Derived A, SVG/PNG/ICO/NSIS assets; original JPEG excluded | Traced/reviewed; OS icon scaling pending | |
| Accessibility/feedback | Axe both themes on modules/settings, focus/targets/motion tests and 44 contrast pairs | Automated evidence; VoiceOver/Narrator/haptics pending | |
| Screenshot matrix | 13 screens × 12 profiles × 2 themes; 26 contact sheets | Captured/reviewed; emulation is not hardware | |
| Bundle budgets | Initial and additional lazy graphs each ≤250KiB gzip | Tested; SW precache downloads lazy assets separately | |
| Lighthouse | Local desktop / and /design measurements | Local evidence only; physical Safari/native timing unverified | |
| Large-data performance | 2k notes + 365 journals, 20k blocks, 5k events; 5k-block note; windowed regular lists/tree/handles | Functional stress assertions pass; typing exceeds 16 ms; editor body, galleries and database bodies not fully virtualized | |
| JS/Rust licenses | Locked inventories; KaTeX/font notices; Windows-resolved Cargo expressions | Audited locally; final binary notice audit needs native bundle | |
| Workflow/secret checks | actionlint, staged/history gitleaks; six deployment safety tests; real Actions | Quality and CodeQL pass; final run/evidence recorded separately | |
| CI pixel baselines | Latest baseline: actual run 38138849715, source 9abb454, 312 captures/26 reviewed contacts; interface-baseline-review.json | All 80 browser cases and 312/312 pixel comparisons pass in 38160971705 with unchanged 0.1% gate | |
| GitHub main push/hosting | Public KangKimpor/kimpor-workspace; direct main push; Pages deployment run 38105256978 | Live URL HTTP 200; public offline/navigation/PWA checks pass in Chromium and WebKit | |
| Physical device acceptance | DEVICE-TEST.md with dates/OS/results | Unverified; no connected hardware | |
| Free signing/v1.0.0 | Unsigned fallback; SignPath requirements documented | No application/release; blocked by account/device/reputation gates | |

See [the report](PHASES-1-3-REPORT.md), [screenshot matrix](evidence/screenshot-matrix.json),
[license inventory](evidence/dependency-licenses.json) and [device checklist](DEVICE-TEST.md).
Remaining gaps and unverified cells prevent describing this as a finished v1.0.0.
