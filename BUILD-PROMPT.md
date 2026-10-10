# Build prompt: Apple-style all-in-one workspace

Oct 10, 2026 · @Kimpor

## Before you paste

Copy everything from section 1 to the end into the session that will do the build, and attach your logo image to that first message. Claude Code on your Windows PC is the best place for it, because the build needs your GitHub login, a local toolchain, and a way to install and test the .exe. A normal chat window cannot do those things.

- The prompt is written in your voice, so paste it as it is.
- It works in phases: the builder finishes Phase 0, stops and reports, and continues when you say "continue".
- Every open choice has a default, so there is nothing to fill in. The defaults: the builder proposes the app name; the GitHub repository is public under `KangKimpor` with the MIT license; the Windows installer starts unsigned; your original signature file is never committed and your full signature is not used on public pages (section 11). Say "private repo" or "use my full signature publicly" in your first message to change those.
- You will do a few account steps yourself (Google Cloud sign-in, Supabase project, device tests). The builder lists them with exact clicks.
- The free-plan limits in section 2 were checked on 2026-10-10 against the vendors' own pages. The builder re-checks them before relying on them.
- Two assumptions carried over from the earlier draft: you write English, Khmer and Chinese, often mixed (section 4), and your PC runs Windows 11 (sections 1 and 2). Edit those lines before pasting if either is wrong.

## 1. Mission and role

You are a senior full-stack engineer, product designer and release engineer. Build me one codebase that ships two ways: an installable web app (PWA) and a Windows 11 desktop app (.exe installer). Same UI, same features, same data, synced in near real time.

The app replaces four tools for me: Notion (pages and databases), a multi-account calendar, a notes app and a journal. It must feel like a first-party Apple app: calm, precise, fast, with light and dark mode and motion feedback on every touch and click.

I use an iPhone 15, an iPad (A16) and a Windows 11 PC. All three must work, offline included, and the whole stack must cost $0 to run.

Working name: `{{APP_NAME}}`. In your first reply, propose five names that are free as a GitHub repo name and an npm scope, and use the first unless I pick another. Never use Apple's or Notion's names, logos or icons inside the product.

My logo is the attached image of my signature. Refine it as described in section 11.

## 2. Hard constraints

These are non-negotiable. If one cannot be met, stop and tell me before working around it.

1. **$0 forever.** Every service, library, CI minute and host must be on a free plan with no trial and no required credit card. Verify each vendor's current free-tier limits on its official pricing page before you depend on it, and record them with the date and URL in `docs/FREE-TIER.md`. Add usage meters in Settings so I never silently exceed a cap.
2. **Platforms.** A Windows 11 x64 `.exe` installer. The web app in Safari on iOS and iPadOS (as a normal tab and as an installed Home Screen web app), plus current Chrome, Edge and Firefox.
3. **Feature parity.** No "lite" client. Differences only where a platform forces them, each documented in `docs/PLATFORM-DIFFERENCES.md`.
4. **Apple design.** Human Interface Guidelines look and feel, light and dark mode, pixel-correct spacing and alignment on every device in section 10.
5. **Sync.** All content, settings and integration state sync across devices. Offline-first: every feature works without a network and syncs when it returns.
6. **Feedback.** Every tap, click, press, drag, toggle and swipe gives visible motion feedback (section 9) and respects Reduce Motion.
7. **Privacy.** No analytics, trackers or third-party data sharing by default. My notes and journal are private, and I can export everything at any time.
8. **Repo.** Create a GitHub repository for the project and push all work there, with CI and releases (section 12).
9. **Quality.** TypeScript strict, automated tests, no secrets in the repo, and every claim that something works backed by a test or a stated manual check.

### Free-plan facts checked on 2026-10-10

Checked against the vendors' own pages on that date. Re-verify every row at build time, because limits and terms change.

| Service | What the vendor states | Source |
| --- | --- | --- |
| Supabase Free | 2 active projects. 500 MB database, 1 GB file storage (50 MB max upload), 5 GB egress, 50,000 monthly active users, 500,000 Edge Function invocations. Realtime: 200 concurrent connections, 2 million messages a month. Custom SMTP allowed. No automatic backups, no branching. Projects pause after 1 week of inactivity. | [Supabase pricing](https://supabase.com/pricing) |
| Vercel Hobby | Free for personal, non-commercial use only. | [Vercel Hobby plan](https://vercel.com/docs/plans/hobby) |
| GitHub Actions | Free on standard runners for public repos. Private repos on GitHub Free get 2,000 minutes a month and 500 MB of artifact storage, and Windows minutes count double. | [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) |
| Google OAuth | An external consent screen in "Testing" issues refresh tokens that expire after 7 days, unless the app asks only for basic profile scopes (Calendar is not one of them). In production they last until revoked or unused for about 6 months. New unverified clients are capped at 100 users. | [Google OAuth setup guide](https://developers.google.com/health/setup) (written for the Google Health API, same consent-screen rules), [Using OAuth 2.0 to access Google APIs](https://developers.google.com/identity/protocols/oauth2) |
| Windows signing | Signing is needed only to avoid the SmartScreen warning on browser downloads and to list in the Microsoft Store. SignPath Foundation signs open-source projects for free if they use an OSI-approved license, a public repository and automated builds, and pass a reputation review. | [Tauri signing guide](https://v2.tauri.app/distribute/sign/windows/), [SignPath Foundation terms](https://signpath.org/terms) |
| Microsoft Store | Individual developer registration is free since September 2025. MSIX apps are hosted and signed by Microsoft at no cost. | [Windows Developer Blog](https://blogs.windows.com/windowsdeveloper/2025/09/10/free-developer-registration-for-individual-developers-on-microsoft-store/) |
| iOS web apps | Web Push works only from Home Screen web apps (iOS 16.4 and later) and needs a tap to ask permission. Safari 18.4 added Declarative Web Push. iOS 26 opens every Home Screen site as a web app by default. | [WebKit: features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), [Monterail](https://www.monterail.com/blog/pwa-for-apple-ios) |

## 3. How to work

1. **Inventory first.** List the tools, connectors, plugins and skills you have (GitHub CLI or connector, Supabase, Vercel, a browser, UI or design skills, web search) and use them wherever they save time. Say which ones are missing.
2. **Verify before you rely.** Use web search to confirm the current version and free-tier limits of every service and major library. Do not trust memory for pricing, limits or APIs.
3. **Decide with ADRs.** For each decision in section 5, write a short Architecture Decision Record in `docs/adr/`: options, the choice, the reason, the fallback. Use my defaults unless a spike disproves them.
4. **At most one round of questions.** Ask me no more than eight batched questions up front, each with a default you will use if I do not answer. After that, decide and document. Do not stop for approval inside a phase.
5. **Manual steps.** Some steps need my accounts: Google Cloud consent screen, Supabase project, Vercel link, an Apple app-specific password. Give me one numbered checklist with exact click paths and copy-paste values. Never block on it: build against local or mock modes until I finish.
6. **Phases with hard stops.** Work through the phases in section 14. At the end of each, stop and report what works, what is tested, what is unverified and what I must do by hand. Continue only when I say "continue".
7. **Be honest about verification.** You cannot hold my iPhone or iPad. Label every behavior as verified by automated test, verified by me, or unverified. Never claim "works on iPhone" from a desktop emulator alone. Give me the manual device checklist from section 13.
8. **Look at your own output.** After every UI change, render it at the viewports in section 10 in light and dark, read the screenshots, and fix misalignment before moving on.
9. **Commit small.** Conventional Commits, one logical change each, CI green before merge.
10. **Keep a memory file.** Maintain `CLAUDE.md` at the repo root: commands, architecture map, conventions, gotchas and the current phase. Update it at the end of every phase so a future session can continue without re-explaining. At the end of Phase 1, draft a project skill file (`SKILL.md`) in the same spirit and show it to me.

## 4. Product scope

Build these as modules inside one app shell that shares one data model, one editor and one design system. Priorities: P1 ships in Phase 1, P2 in Phase 2, P3 in Phase 3.

### Navigation and shell

- **Phone (under 600 px):** bottom tab bar with Today, Calendar, Notes, Journal and Workspace; a "+" quick-capture button; large collapsing titles; sheets with detents; edge-swipe back.
- **Tablet and desktop (600 px and up):** collapsible sidebar plus content, and three panes (sidebar, list, detail) from 1024 px. Resizable panes, a Ctrl or Cmd+K command palette and keyboard shortcuts everywhere.
- **One layout system.** No separate "mobile app" and "desktop app" UI code beyond the platform adapters in section 5.

### Today (P1)

Date header, today's events from every calendar, due tasks, today's journal entry status, pinned pages, recent items and quick capture. "On this day" memories arrive in P3.

### Workspace: pages and databases (the Notion equivalent)

- **Pages (P1):** unlimited nesting; sidebar tree with drag to reorder and reparent; favorites; recents; 30-day trash with restore; duplicate and move; icon and cover (gradients and uploads); full-width toggle; breadcrumbs; backlinks; tags. Version history and templates are P2.
- **Block editor (P1):** paragraph, headings 1 to 3, bulleted, numbered and to-do lists, toggle, quote, callout, divider, code with syntax highlighting, simple table, image and file attachments (paste, drop, camera, photo library), `@` and `[[` mentions of pages and dates, inline formats and colors. Slash menu, drag handle on desktop, long-press drag on touch, Markdown shortcuts, undo and redo, find in page. Columns and math are P3.
- **Databases:** table, list and board views with typed properties (title, text, number, select, multi-select, status, date, checkbox, URL, email, phone, files) in P2. Calendar and gallery views, relations and rollups in P3; formulas and a timeline view are stretch goals. Filters (nested AND/OR), sorts, groups and saved views. Every row is a page. Tasks ship as a built-in database template that also appears in Today and Calendar.

### Calendar (local in P1, Google in P2, other sources in P3)

- **Views:** day, week, month and agenda; mini-month navigator; today button; week numbers; first-weekday setting; 12 and 24-hour clocks; all-day row; current-time line.
- **Events:** title, start and end, all-day, separate start and end time zones, location, notes, reminders, color, calendar, busy or free, URL. Notes open a linked page for meeting notes.
- **Recurrence:** full RRULE (daily, weekly, monthly, yearly, BYDAY, COUNT, UNTIL, exceptions) with "this event, this and following, all events" edits.
- **Gestures:** drag to create, move and resize with 15-minute snap; long-press then drag on touch; an Undo toast on every change; natural-language quick add ("lunch with Sam tomorrow 1pm").
- **Sources:** local calendars plus connected accounts (section 7), each with its own color, visibility toggle and sync-health badge, and a default calendar for new events.
- **Reminders:** in-app (P1), Web Push from the installed web app (P2), and Windows notifications (P3).

### Notes (P1)

An Apple Notes-style fast layer on the same editor: folders and subfolders, pinned notes, quick note, checklists, attachments, list and gallery views, sort options, note links, and convert note to page and back. A sketch canvas (perfect-freehand, using pen pressure when the pen reports it and velocity-based width otherwise) and locked notes (passcode or WebAuthn) are P3.

### Journal (basic in P1, extras in P3)

One or more entries per day, created on first write. Prompts and templates (morning, evening, gratitude, weekly review). Mood on five levels, tags, a calendar heatmap with gentle streaks, photos, opt-in location and weather (off by default), "On this day", a focus mode that hides all chrome, and an auto-save indicator. App lock. An optional end-to-end encryption mode with a recovery key (P3); warn that a lost key means lost entries.

### Cross-cutting

- **Search:** instant, local, across pages, notes, journal and events, with type and date filters. Tokenize Khmer and Chinese correctly with `Intl.Segmenter`.
- **Settings:** account; appearance (system, light, dark; accent from Apple system colors; text size; Reduce Motion; density); calendars and accounts; notifications; sync status and storage meters; import and export; security; keyboard shortcuts; language and region; diagnostics; delete my data.
- **Import and export:** Markdown, JSON and ICS in P1; Notion export zip and CSV in P2; a full-data export as one zip.
- **Windows extras (P3):** tray icon, optional start with Windows, global quick-capture hotkey, native notifications.
- **Multilingual:** I write in English, Khmer and Chinese, often mixed on one page. The editor must handle IME composition (never fire slash menus or shortcuts while `isComposing`), render Khmer and Chinese correctly and break lines properly. Ship the UI in English, built i18n-ready.
- **Basics:** onboarding, empty states with theme-aware SVG illustrations, undo everywhere, autosave with no Save buttons, optimistic UI.

## 5. Architecture decisions

Use these defaults. A spike may overturn one only with evidence recorded in an ADR.

| Layer | Default | Why | Fallback |
| --- | --- | --- | --- |
| Language and repo | TypeScript (strict) in a pnpm workspaces monorepo | One language for client, edge functions and tooling | None |
| Web UI | React, Vite, Tailwind CSS v4 on CSS-variable tokens, Radix UI primitives, Motion for springs, dnd-kit, Lucide icons, Vaul-style sheets | Large accessible ecosystem, touch-friendly drag and sheets | Build the primitive in-house |
| Editor | TipTap (ProseMirror) core with a custom slash menu and block handles | Full control of touch, IME and styling | BlockNote core, after checking touch drag and licenses |
| Local store | IndexedDB through Dexie, the source of truth on every device | Same code in Safari and WebView2 | SQLite WASM with OPFS if a sync-engine spike needs it |
| Backend | Supabase Free: Postgres, Auth, Realtime, Storage, Edge Functions, pg\_cron | Free, relational, row-level security | Firebase Spark, with a documented data-model change |
| Sync | Local-first outbox, hybrid logical clocks, field-level last-writer-wins for records, Yjs for rich-text bodies | Predictable, no vendor lock-in | PowerSync or Electric, if their free tiers and Safari support check out |
| Desktop | Tauri 2 (Rust, WebView2), NSIS installer, updater plugin | Small installer, native feel, free CI builds | Electron with electron-builder |
| Web host | Vercel Hobby static SPA with preview deploys | Personal use is allowed on Hobby | Cloudflare Pages |
| Dates | date-fns, IANA time zones, rrule, chrono-node for quick add | Mature and small | Temporal polyfill |
| Search | MiniSearch or FlexSearch in a Web Worker | Local, private, instant | Postgres full-text search |
| Offline | Workbox through vite-plugin-pwa on the web; no service worker inside Tauri | Offline shell on the web; Tauri bundles its assets | None |
| Tests | Vitest, Playwright (Chromium and WebKit), axe-core, Lighthouse CI | Free and scriptable | None |

Rules that follow from these choices:

- Run a time-boxed spike for the editor (touch drag, Khmer and Chinese IME, slash menu, Yjs binding, bundle size) and for the sync layer before committing. Audit every dependency's license and avoid GPL or commercial-only packages unless I approve.
- Hide platform differences behind adapters in `packages/core`: storage, notifications, OAuth redirect, file picker, window controls, haptics. UI code never checks the platform directly.
- Tauri's webview origin differs from the web origin, so Edge Functions must return CORS headers for both. Do not register the service worker inside Tauri.
- Auth is Supabase Auth with Google sign-in plus a six-digit email code. Use codes, not magic links: links open in Safari and strand the session outside an installed iOS web app. Sign in with Apple is out because it needs a paid developer program. If the built-in email limits get in the way, use custom SMTP on a free provider.
- Supabase free projects pause after a week of inactivity. Add a daily GitHub Actions keep-alive call, and show a clear "backend is waking up" state in the app.
- Monorepo layout: `apps/web`, `apps/desktop`, `packages/ui`, `packages/core`, `packages/integrations`, `supabase/` (migrations, RLS, functions), `docs/`, `.github/`.

## 6. Data model and sync engine

Design for one owner and several devices, with `user_id` on every row so sharing can be added later without a rewrite.

- **One unified model.** A page has a `type`: page, note, journal, database or row. Notes, journal entries and database rows reuse the same editor and storage. Journal entries carry a `date`. Rows carry `database_id` and `properties`.
- **Core tables (a sketch; settle them in an ADR):** `pages`, `page_doc_updates` and `page_doc_snapshots` (Yjs), `page_versions`, `databases` (property schema and views as JSON), `calendars`, `events`, `connected_accounts` (server-only), `attachments`, `tags`, `user_settings`, `push_subscriptions`, `tombstones`.
- **Ordering and deletes.** Fractional indexing for order. Soft deletes with tombstones, purged after 30 days. Every row carries a hybrid logical clock and a schema version.
- **Merge rules.** Records (events, properties, settings): field-level last-writer-wins by hybrid logical clock. Rich text (page bodies, journal text): one Yjs document per page, stored as appended binary updates and compacted into snapshots by a scheduled job.
- **Client flow.** Write to IndexedDB first, queue in an outbox, push with idempotent upserts, pull changes by cursor, and receive nudges over Supabase Realtime. Retry with backoff. Show Synced, Syncing, Offline or Needs attention, with a pending-changes count.
- **Sync triggers.** App start, focus, `visibilitychange`, `online`, pull-to-refresh, and every 60 seconds while open. iOS has no background sync, so never promise it.
- **Storage eviction.** Request persistent storage. If the local database is empty but the account has data, resync automatically and tell me.
- **Security.** Row-level security on every table (`auth.uid() = user_id`). `connected_accounts` and any token column have no client-readable policy. Storage buckets use per-user paths with policies. Write SQL tests that prove another user cannot read or write my rows.
- **Free-tier safety.** Compact Yjs history, compress images in the browser to WebP before upload, show database and storage meters against the verified caps (500 MB database, 1 GB files), and warn at 70 percent. Keep Realtime messages small and debounced (change nudges with IDs and cursors, never payloads), because Free allows 2 million messages a month and 256 KB a message.
- **Backups.** Supabase Free has no automatic backups, so ship a one-click full export and a scheduled GitHub Action that exports my data to a private repository or artifact (I will supply the token).
- **Prove it.** A scripted test with three simulated clients doing offline edits, concurrent edits to the same page and the same event, and reconnects. All clients must converge with no data loss. Add property-based tests for the merge rules.

## 7. Calendar integrations

Build a provider abstraction first: `CalendarProvider { listCalendars, listEvents(range, syncToken), createEvent, updateEvent(etag), deleteEvent }`. Store `source`, `remote_id` and `etag` on every event. Sync both ways. On an etag conflict, refetch and merge by field, and tell me if you had to prefer the remote copy.

### Google Calendar, multiple accounts (P2)

- Treat "connect a Google calendar account" as separate from "sign in". I can connect several Google accounts, including ones I do not sign in with.
- Use a free Google Cloud project, the Calendar API and an OAuth web client. Do the code exchange and refresh in a Supabase Edge Function that holds the client secret, with PKCE, offline access and least-privilege scopes.
- Set the consent screen to "In production" (unverified, personal use, 100-user cap, warning screen accepted). In "Testing", refresh tokens die after 7 days.
- Use incremental sync with `syncToken`, and do a full resync on HTTP 410. Poll on foreground and from a pg\_cron job every 15 minutes. Do not depend on Google push webhooks, which need a verified HTTPS domain (check the current rule).
- Make the OAuth callback an Edge Function that stores tokens against a signed `state` and shows "Connected, you can close this window". The app learns of completion through Realtime or polling. This still works when the installed iOS web app and Safari do not share storage.
- Fallback if OAuth setup becomes a burden: read-only subscription to each calendar's secret iCal address.

### Apple / iCloud Calendar (P3)

- A web app has no OAuth or EventKit route to Apple Calendar. Use CalDAV against `caldav.icloud.com` with an app-specific password that I create at appleid.apple.com.
- Browsers cannot call CalDAV directly (CORS), so proxy through an Edge Function. Encrypt the password at rest (Supabase Vault or AES-GCM with a function secret), never return it to the client, and give me a Disconnect button that deletes it.
- Discover the principal, calendar home and calendars, then sync incrementally with sync tokens or ctags. Do not promise Apple Reminders: lists upgraded to the modern format are not exposed over CalDAV (verify).

### Other sources

- Generic CalDAV for Fastmail, Nextcloud, Yahoo and Zoho (P3). ICS and `webcal://` subscriptions with a refresh policy, read-only (P2). ICS import and export (P1). Public holiday calendars (P2).
- Outlook and Outlook.com through Microsoft Graph and a free Azure app registration (P3). Work or school tenants may need admin consent.

### Rules for every provider

- Tokens and passwords live only in server tables the client cannot select. Disconnect revokes at the provider and deletes the rows.
- Rate-limit, back off exponentially, and keep one account's failure from blocking the others. Each account shows a health badge and a re-authorize prompt.
- Local calendars are first-class. Creating an event asks which calendar it belongs to, defaulting to my chosen one.
- Time zones: store UTC plus the IANA zone and the local wall-clock time. All-day events are date-only. Write DST tests (America/New\_York and Europe/London, for example) and golden tests for recurrence.

## 8. Apple design system

Look like a first-party Apple app, built from original code and open-licensed assets.

### Principles and materials

- Clarity, deference to content, depth. Content first, restrained color, large titles, generous whitespace, continuous corners, hairline separators, grouped inset lists, segmented controls, sheets with grabbers, context menus and swipe actions.
- Apple's current language is Liquid Glass. Reproduce a restrained web version: translucent toolbars and tab bars with `backdrop-filter`, concentric radii, soft shadows. Provide flat fallbacks when `backdrop-filter` is missing or when `prefers-reduced-transparency` or `prefers-contrast: more` is set. Use blur sparingly and check the frame rate on iPhone 15 and iPad A16.

### Fonts and icons

- Font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI Variable", system-ui, sans-serif`. Self-host Inter (variable, subset) for Windows and non-Apple browsers. Do not bundle SF Pro, because Apple's license does not allow it. Mono: `ui-monospace, "SF Mono", "JetBrains Mono"`.
- Khmer and Chinese: use the system fonts first (iOS and Windows ship them). Bundle Noto fallbacks only if tests show missing glyphs or bad shaping, and lazy-load them.
- Icons: Lucide or Phosphor, one stroke weight, optically aligned to text. No SF Symbols exports and no Apple logos.
- Type scale (iOS sizes, px size/line): large title 34/41, title 28/34, title 2 22/28, title 3 20/25, headline 17/22 semibold, body 17/22, callout 16/21, subhead 15/20, footnote 13/18, caption 12/16, caption 2 11/13. Use a compact desktop scale (body 14 to 15). Tabular numbers for times and figures. Inputs at 16 px or more so iOS does not zoom.

### Tokens

Define every value once as a CSS variable for light and dark, use only tokens in components, and lint against arbitrary values.

- **Spacing:** 4-point grid (4, 8, 12, 16, 20, 24, 32, 40, 48). Gutters 16 px on phone, 20 on iPad, 24 on desktop. Editor reading width at most 720 px. List rows at least 44 px tall.
- **Radii:** 10 controls, 14 cards, 20 grouped lists and popovers, 28 sheets. Use `corner-shape: squircle` where supported.
- **Labels and lines:** Apple's label ramp at 100, 60, 30 and 18 percent. Separators `rgba(60,60,67,.29)` in light and `rgba(84,84,88,.65)` in dark.
- **Accent:** derive it from the logo blue, tuned to 4.5:1 text contrast and 3:1 for UI on both themes. Start from the computed values in section 11. Offer the system colors below as selectable accents.

Starting values from memory (iOS 15 to 18), not looked up, and Apple may have refreshed them since. Check Apple's current Human Interface Guidelines color page and use the current ones.

| Token | Light | Dark |
| --- | --- | --- |
| Blue | #007AFF | #0A84FF |
| Green | #34C759 | #30D158 |
| Indigo | #5856D6 | #5E5CE6 |
| Orange | #FF9500 | #FF9F0A |
| Pink | #FF2D55 | #FF375F |
| Purple | #AF52DE | #BF5AF2 |
| Red | #FF3B30 | #FF453A |
| Teal | #30B0C7 | #40C8E0 |
| Yellow | #FFCC00 | #FFD60A |
| Gray 1 | #8E8E93 | #8E8E93 |
| Gray 2 | #AEAEB2 | #636366 |
| Gray 3 | #C7C7CC | #48484A |
| Gray 4 | #D1D1D6 | #3A3A3C |
| Gray 5 | #E5E5EA | #2C2C2E |
| Gray 6 | #F2F2F7 | #1C1C1E |
| Background | #FFFFFF | #000000 |
| Grouped background | #F2F2F7 | #000000 |
| Elevated surface | #FFFFFF | #1C1C1E |

### Light and dark

Follow the system, with a manual override that syncs across devices. Set the theme before first paint (an inline script on `<html data-theme>`), so there is no flash. Set `color-scheme`, a `theme-color` for each scheme, and the iOS status bar style.

### Components

Build each with every state: default, hover (hover-capable devices only), pressed, focus-visible, disabled, loading, error. Show all of them on a `/design` gallery page in light and dark.

- **Controls:** button (filled, tinted, plain, destructive), icon button, switch, checkbox, radio, segmented control, text and search fields, stepper, slider, date and time pickers (popover on desktop, sheet on touch).
- **Structure:** list and grouped list rows (disclosure, swipe actions, reorder), navigation bar (large and inline), tab bar, sidebar, toolbar.
- **Overlays:** sheet, popover, menu, context menu, alert, action sheet, toast, tooltip (hover only), banner, command palette.
- **Content:** badge, avatar, progress, skeleton, empty state, calendar grid, event chip, color picker, emoji and icon picker, file chip.
- **Editor chrome:** slash menu and a selection toolbar that sits above the iOS keyboard.

### Layout rules

- No horizontal page scroll from 320 to 2560 px, and it works at 200 percent text zoom.
- Respect safe areas on every edge (`viewport-fit=cover`, `env(safe-area-inset-*)`), landscape included.
- Use `100dvh`, never `100vh`. Handle the on-screen keyboard with `visualViewport` so inputs and toolbars stay visible.
- Align icon and text on a shared baseline and optical center. Use container queries so panes adapt inside iPad Split View and Stage Manager windows.
- Ship a dev-only layout inspector with toggles for the 4-point grid, a safe-area overlay, and an outline on any touch target under 44 by 44 px.

## 9. Motion and feedback on every click and touch

Every interactive element answers within 80 ms of the pointer going down, and every state change animates. No interaction is silent.

### Rules

- One `Pressable` primitive wraps every button, row, card, chip, icon button and tab. It drives a pressed state from pointer events, not from `:active` alone (iOS Safari is unreliable with it): scale to 0.97 with a tint or opacity change, spring back on release, and cancel cleanly when the finger drags away.
- Animate `transform` and `opacity` only. Use interruptible springs from Motion. Tokens: durations of 80, 150, 250 and 350 ms, plus `--spring-snappy`, `--spring-soft` and `--ease-standard`.
- Hold 60 fps on iPhone 15 and iPad A16, both 60 Hz screens. Profile in Safari Web Inspector and drop any effect that misses the budget.
- `prefers-reduced-motion` and an in-app Reduce Motion switch replace movement with short fades, remove parallax and turn off springs on large surfaces.
- Hover effects apply only under `@media (hover: hover)`, so touch screens never get stuck hover states. Keyboard focus shows a 2 px accent ring with a 2 px offset.

### Interaction catalog (build all of these)

| Interaction | Feedback |
| --- | --- |
| Button, row, card or chip tap | Press scale and tint, spring on release |
| Switch | Knob spring, track color crossfade |
| Checkbox and task complete | Check draws in 200 ms, row fades and strikes, optional haptic |
| Segmented control | Sliding indicator |
| Tab change | Icon bounce, content crossfade |
| Navigation push and pop | Slide with parallax on phone, crossfade on desktop |
| Sheet present and dismiss | Spring, drag with rubber-band and detents, backdrop dim |
| Menu and popover | Scale from the anchor 0.96 to 1 with a fade |
| Context menu (long-press or right-click) | Item lifts, backdrop blurs |
| List insert, remove, reorder | Layout animation, neighbors slide |
| Drag and drop | Lift (scale 1.02, shadow), drop indicator, edge auto-scroll |
| Calendar event drag and resize | Ghost block, 15-minute snap, live time label |
| Calendar view change | Slide between days or weeks, month-to-day zoom |
| Swipe actions | Rubber-band, full-swipe commit |
| Pull to refresh | Sync spinner that follows the pull |
| Toast | Slide in, progress on auto-dismiss, Undo |
| Save and sync | "Saved" check micro-animation, rotating arrows only while syncing |
| Error | Short shake and red tint on the field |
| Loading | Skeleton shimmer, never a blank screen |
| Page open | Subtle shared-element transition of icon and title |

### Haptics

Hide them behind `haptic(kind)`. On iOS Safari 17.4 and later, a programmatic toggle of an `<input type="checkbox" switch>` has been reported to give a light tap. Feature-detect it, make it optional in Settings, and make it a no-op elsewhere. Do not promise haptics on Windows or desktop browsers. No sounds by default.

### Proof

Add a Playwright test that scans every interactive element, fires `pointerdown`, and fails if no computed style changes within 100 ms. Add a lint rule that forbids a raw `<button>` outside the `Pressable` primitive.

## 10. Devices, viewports and platform behavior

### Target devices

| Target | Viewport (CSS px) | Notes |
| --- | --- | --- |
| iPhone 15 | 393 × 852 portrait, 852 × 393 landscape, 3× | A16, 60 Hz, Dynamic Island. Safe areas are roughly 59 top and 34 bottom in portrait, and 59 left and right with 21 bottom in landscape. Read them from `env()`, never hardcode them. |
| iPad (A16) | 820 × 1180 portrait, 1180 × 820 landscape, 2× | 60 Hz, Touch ID, hardware keyboard, trackpad and Apple Pencil (USB-C) support. In Split View and resizable windows the width can be anything from about 320 to 1180, so layout follows the container, not the device. |
| Windows PC | 1536 × 864 typical (1080p at 125 percent), 1280 × 720 small, 2560 × 1440 large | WebView2 inside the Tauri window. Minimum window 800 × 600. Mouse, keyboard, precision touchpad and touch. |
| Browsers | Last two versions of Chrome, Edge and Firefox. Safari 17 or later on iOS, iPadOS and macOS | Safari on iPhone and iPad has priority. Use progressive enhancement for CSS that Safari lacks. |

The iPad (A16) panel (2360 × 1640 px, 60 Hz) was checked against published specs on 2026-10-10. Confirm every number on my real devices with a Diagnostics screen in Settings that shows `innerWidth`, `innerHeight`, `devicePixelRatio`, safe-area insets, display mode, pointer and hover capability, persistent-storage status and the OS version.

### Breakpoints

Breakpoints apply to the width of the container that holds a pane, through container queries, not to the window alone.

| Class | Container width | Layout |
| --- | --- | --- |
| Compact | under 600 | Bottom tab bar, one column, push navigation, sheets with detents |
| Regular | 600 to 1023 | Collapsible sidebar plus content. List and detail side by side in landscape |
| Wide | 1024 to 1439 | Three panes: sidebar, list, detail |
| Extra wide | 1440 and up | Three panes plus an optional inspector. The editor column stays at 720 px or less |

### Screenshot matrix

Render every screen in light and dark at each size. Use the bold rows in the daily loop and the full set before each phase report.

| Name | Size | DPR | Engine | Input |
| --- | --- | --- | --- | --- |
| **phone-small** | 320 × 640 | 2 | WebKit | touch |
| **iphone15-portrait** | 393 × 852 | 3 | WebKit | touch |
| iphone15-landscape | 852 × 393 | 3 | WebKit | touch |
| ipad-portrait | 820 × 1180 | 2 | WebKit | touch |
| **ipad-landscape** | 1180 × 820 | 2 | WebKit | touch |
| ipad-split-narrow | 375 × 820 | 2 | WebKit | touch |
| ipad-split-half | 580 × 820 | 2 | WebKit | touch |
| window-min | 800 × 600 | 1.25 | Chromium | mouse |
| **laptop** | 1536 × 864 | 1.25 | Chromium | mouse |
| desktop | 1920 × 1080 | 1 | Chromium and Firefox | mouse |
| **wide** | 2560 × 1440 | 1 | Chromium | mouse |

Emulation checks layout. It is not proof that something works on the device (section 13).

### iPhone and iPad: Safari tab and Home Screen web app

- **Manifest and meta.** `display: standalone`, `id`, `start_url` with a source parameter, `scope`, icons (section 11), `shortcuts` (new page, new event, new journal entry), and `theme_color` and `background_color`. Add a `theme-color` meta tag per color scheme and the iOS tags (`apple-mobile-web-app-title`, `apple-touch-icon`, status bar style). Pick the status bar style on a real device, because it decides whether content shows under the clock, and record the result in `docs/PLATFORM-DIFFERENCES.md`.
- **Install.** iOS 26 and iPadOS 26 open every Home Screen site as a web app unless "Open as Web App" is switched off, and older versions need the manifest or meta tag, so ship both. iOS has no `beforeinstallprompt`: show a one-time coach sheet in Safari tabs with the Share, Add to Home Screen steps, and never show it again after it is dismissed.
- **Storage.** A Home Screen web app has its own storage, separate from Safari tabs (verify on the device), so never assume a session carries over. Call `navigator.storage.persist()`. If the local database is empty but I am signed in, resync automatically (section 6).
- **Touch.** `touch-action: manipulation` on controls, `-webkit-tap-highlight-color: transparent`, `-webkit-touch-callout: none` only on custom long-press surfaces and never on editor text, `overscroll-behavior: none` on the app shell with scrolling inside panes, no zoom lock, and inputs at 16 px or more.
- **Keyboard.** Follow `visualViewport` resize and scroll. The selection toolbar docks above the on-screen keyboard and the caret is never hidden under it. With a hardware keyboard on iPad: the full shortcut set, a sane Tab order, and Esc closes the top overlay.
- **Pointer and Pencil.** A trackpad or mouse on iPad produces hover, and keyboards come and go, so detect the pointer type per event, not once at startup. Handle `pointerType === "pen"`. The USB-C Apple Pencil probably reports no pressure (verify), so the sketch tool falls back to velocity-based line width.
- **Limits.** No background sync, background fetch or reliable timers once the app is suspended. Reminders when the app is closed rely on Web Push (P2), and the app says so. Web Push and badges work only in the Home Screen web app, after a tap.
- **Rendering.** `backdrop-filter` only on bars and sheets, no animated blur, no animated `box-shadow` (fade a pseudo-element instead), virtualized long lists, input latency under 50 ms on the 60 Hz A16 devices.

### Windows desktop app: Tauri 2 and WebView2

- **Installer.** NSIS `.exe`, per-user install (`installMode: currentUser`, no admin prompt), Start menu entry, clean uninstall, WebView2 bootstrapper only when the runtime is missing. File name `<AppName>_<version>_x64-setup.exe`.
- **Window.** Default 1280 × 800 centered, minimum 800 × 600. Remember size, position and maximized state. Keep the native frame so Snap Layouts, accessibility and DPI scaling behave. The title bar follows the app theme, not only the system theme. Mica is optional and only if it is stable.
- **Single instance.** A second launch focuses the first window and forwards any deep link to it.
- **Sign-in return.** System browser plus a custom-scheme deep link (`<scheme>://auth/callback`) with PKCE, with a loopback redirect as the fallback. Never show an OAuth page inside the app webview.
- **Keyboard and pointer.** `Ctrl` shortcuts on Windows and `Cmd` on Apple devices, with the right glyph in labels. Do not break standard text editing or `Alt` menu behavior. Thin, themed scrollbars. Keep the native text-field context menu so spell check works.
- **Safety.** Tauri capabilities deny by default and allow only the plugins in use. External links open in the default browser through an allowlist. Strict CSP, no remote code.
- **Updates.** Tauri updater (section 12). Notify, and never restart while there are unsaved or unsynced changes.
- **Later.** Tray icon, start with Windows, global quick-capture hotkey and native notifications are P3.

### Accessibility

WCAG 2.2 AA, tested with VoiceOver on iOS and iPadOS and Narrator on Windows. Touch targets at least 44 × 44 CSS px (WCAG 2.2 requires only 24 × 24, so 44 is the Apple bar). Everything works by keyboard alone, with visible focus that is never hidden behind a bar. Honor `prefers-reduced-motion`, `prefers-contrast`, `prefers-reduced-transparency` and `forced-colors`. Text scales to 200 percent. One `aria-live` region announces sync status and toasts. Apple's system blue (`#007AFF`) is only 4.02:1 on white, so the logo-derived accent in section 11 is also the better accessibility choice.

### Performance budgets

- Initial route JavaScript at most 250 KB gzipped. The editor and calendar are lazy chunks of at most 250 KB gzipped each. Fonts subset, `font-display: swap`.
- Warm start to interactive at most 1.5 s on the iPhone 15 and on my Windows PC. Typing latency at most 16 ms a keystroke on a 5,000-block page. Search across 10,000 items at most 50 ms. Windows installer at most 20 MB.
- Enforce them with Lighthouse CI and the seeded-workspace test in section 13, and fail the build on a regression.

## 11. Brand and logo

My logo is my handwritten signature, attached to this message as `Kimpor_s_E-Sign.png`. Refine it into a small brand system. Keep it recognizably mine, and change color, weight and construction wherever that helps.

### What the file is

Measured on 2026-10-10 from the attached file:

- 1360 × 1162 px, RGBA, transparent background. The ink spans 846 × 402 px (about 2.1 to 1) and sits centered on the canvas.
- A hairline: the stroke is about 10 px wide, around 1.2 percent of the signature's width.
- Ink color `#2B5F9E`, a denim blue (hue 213°, saturation 57 percent, lightness 39 percent).
- One continuous cursive line: a tall opening K, a run of connected letters, and a looping descender that exits as a long rising diagonal tail.

Two consequences to design for:

- A hairline signature disappears below roughly 96 px wide, so the app icon and favicon need a heavier, simplified mark.
- `#2B5F9E` is 6.49:1 on white but only 3.23:1 on black and 2.62:1 on `#1C1C1E`, so dark mode needs a lighter blue.

### Keep the signature private by default

A clean, transparent signature is easy to misuse. Treat the original file as private.

- Keep it in `brand/source/`, which is gitignored. Never commit it, and never commit a high-resolution trace of the full signature to a public repository.
- The public repository and every public page (sign-in, splash, README, social image) use only the derived monogram.
- The full signature ships nowhere public unless I opt in. If I do, ship it as a simplified SVG trace, knowing that assets in the web bundle are public.
- Ask me this in your first round of questions, with the default "keep it private".

### Deliverables

1. **Vector masters** in `brand/svg/`: `mark.svg` (monogram, regular weight), `mark-bold.svg` (icon weight), `mark-mono.svg` (one color, `currentColor`), `lockup.svg` (mark plus app name), and `signature.svg` only if I opt in.
   - Build them by tracing my strokes, never by retyping letters in a font. Upscale the PNG, threshold the alpha channel, trace with VTracer (MIT) or Potrace (check the license fit), then rebuild the result as one smooth stroked centerline path: skeletonize, order the points, fit Béziers. That makes weight a parameter: hairline as drawn, regular at about 3 percent and bold at about 6 to 8 percent of the mark's height. If centerline extraction misbehaves, fall back to an outline trace with an offset stroke.
   - Under 150 nodes per stroke, round caps, no specks, and no self-intersection artifacts at the K joint. Keep the slant and the long tail, which are the distinctive parts.
2. **Three monogram directions**, each rendered at 1024, 180, 64, 32 and 16 px on light, dark and the icon gradient:
   - **A (default):** the opening K in bold weight, with the signature's tail as a single accent sweep.
   - **B:** the K alone, with geometric cleanup.
   - **C:** the looping descender and tail as an abstract symbol.

   Score them on legibility at 16 and 32 px, distinctness from the Notes, Calendar and Notion icons, behavior in one color, and fidelity to my hand. Put the contact sheet and your pick in the Phase 0 report. Use A unless it fails at 32 px.
3. **App icon.** A 1024 × 1024 master: white mark on a blue gradient from `#3C7BC8` (top) to `#1E4A85` (bottom), which keeps the white mark at 4.3:1 or better. The rounded square uses a continuous corner (radius about 22 percent of the side), drawn from scratch. Do not copy Apple's template, icon or any SF Symbol.
4. **Exports**, generated by one script (`pnpm brand:build`) from the SVG masters:

| Asset | Size and format | Notes |
| --- | --- | --- |
| Favicon | `favicon.svg` (adapts to dark with `prefers-color-scheme` inside the SVG), `favicon.ico` with 16, 32 and 48, `favicon-32.png` | Bold mark, no gradient |
| Apple touch icon | 180 × 180 PNG | Full-bleed opaque square. iOS applies the rounded mask, so no baked corners and no transparency |
| PWA icons | 192 and 512 PNG (any), 512 PNG (maskable) | The maskable icon keeps the mark inside the central 80 percent |
| Social | 1200 × 630 Open Graph image, 1280 × 640 GitHub social preview | Monogram only, unless I opt in |
| Windows app | `icon.ico` with 16, 24, 32, 48, 64, 128 and 256, plus the PNG set that `tauri icon` makes from a 1024 × 1024 source | Check at 100, 125, 150 and 200 percent display scaling |
| NSIS installer | header 150 × 57 and sidebar 164 × 314 bitmaps, installer icon | Match the app theme |
| Tray icon (P3) | monochrome 16, 20, 24 and 32, light and dark variants | |
| iOS splash (optional) | `apple-touch-startup-image` for 1179 × 2556 and 1640 × 2360 | Add only if I see a white flash at launch on my devices |

### Color tokens from the logo

These are computed starting values (2026-10-10). Put them in the token file, keep the contrast test in CI, and tune only if a test fails.

| Token | Light | Dark | Use | Contrast |
| --- | --- | --- | --- | --- |
| `--brand-seed` | `#2B5F9E` | same | Reference only, measured from my file | 6.49:1 on white |
| `--accent` | `#2268BF` | `#5A9CED` | Links, icons, focus ring, text on a surface | 5.53:1 on `#FFFFFF`. 7.41:1 on `#000000`, 6.01:1 on `#1C1C1E`, 4.92:1 on `#2C2C2E` |
| `--accent-fill` | `#2268BF` | `#236DC7` | Filled buttons and selected states with a white label | White label 5.53:1 light, 5.14:1 dark. Against surfaces 3.31:1 or better |
| `--accent-tint` | `--accent` at 12 percent | `--accent` at 18 percent | Tinted buttons, selected rows | |

The accent options in Settings (Apple system colors) keep working as alternatives, and each must pass the same contrast test.

### Where the mark appears

- A `<Logo variant="mark | lockup" />` component that uses `currentColor` and tokens, so it works in both themes.
- Sign-in screen, onboarding, About, empty states, README banner, Open Graph image. Not in the editor chrome, where it would compete with content.
- **Splash.** The monogram's strokes draw on with `stroke-dashoffset` in about 900 ms, hold 150 ms, then crossfade into the app in 250 ms. Cold start only. It plays only while the app is genuinely loading and never adds waiting time. Reduce Motion replaces it with a 150 ms fade.
- Clear space equals the height of the K stem. Minimum sizes: mark 16 px, lockup 96 px wide. Name set in Inter, weight 600, slightly tight tracking.

### Never

Never use the Apple logo, SF Symbols or a Notion-style cube or "N". Never ship a raster-only logo. Never alter my signature beyond tracing and cleaning without showing me first.

### Acceptance

I see a correct icon, with no black corners, on the iPhone and iPad Home Screens, in the Windows taskbar at 100 and 150 percent scaling, in the Start menu, in the installer, and in browser tabs in light and dark.

## 12. Repository, CI and releases

### Repository

- My GitHub username is `KangKimpor`. Confirm the signed-in account with `gh auth status`, then create the repository with the GitHub CLI (`gh repo create`) or a GitHub connector if one exists. If neither is signed in, give me the exact `gh auth login` steps and work in a local repository until I finish.
- Defaults: **public**, **MIT license**, repository name taken from the chosen app name. Why public: Actions on standard runners are free and unlimited in public repositories, branch protection and security scanning are free there, the Tauri updater can read public release files, and the project can apply for free Windows code signing later.
- If I say "private repo": Actions is capped at 2,000 minutes a month (Windows minutes count double), the update files must be hosted on the Vercel site instead of GitHub Releases, and branch protection is probably unavailable on the free plan (check). Record the choice in an ADR.
- Never commit secrets, `.env` files, my original signature file or personal data. Add `.env.example`, a `gitleaks` scan in CI and a pre-commit hook. The Supabase publishable key is public by design, so every table needs row-level security.
- Repository settings: description and topics, social preview image, wiki and projects off, `main` protected with a required passing CI check where the plan allows it, squash merges, merged branches deleted, Dependabot (weekly, grouped), CodeQL and secret scanning.
- Files: `README.md` (what it is, light and dark screenshots from the device matrix, install steps for the web, iPhone, iPad and Windows, a Mermaid architecture diagram, scripts), `LICENSE`, `SECURITY.md`, `CLAUDE.md`, and `docs/` with `FREE-TIER.md`, `PLATFORM-DIFFERENCES.md`, `SETUP-CHECKLIST.md`, `VERIFICATION.md`, `DEVICE-TEST.md`, `RELEASING.md` and `adr/`.
- Workflow: trunk-based, a pull request for every change even though I work alone (it gives a preview deploy), Conventional Commits, squash merge.

### Workflows

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `ci.yml` | Pull request, push to `main` | Install with cache, lint, typecheck, unit tests, build the web app and the desktop frontend, start local Supabase and run the SQL and RLS tests, run Playwright on Chromium and WebKit (end to end, axe, screenshot matrix), Lighthouse CI budgets, license and secret scans. Runs on `ubuntu-latest` to save minutes |
| `desktop.yml` | Tag `v*`, and pull requests labeled `build-desktop` | On `windows-latest`, build the NSIS installer with Tauri, install it silently, launch it and check that the window appears, then upload it. A tag also publishes a GitHub Release through `tauri-apps/tauri-action` with the installer, checksums and the updater `latest.json`. Artifact retention 7 days |
| `release.yml` | Push to `main` | Release Please opens a release pull request with the version bump and changelog |
| `supabase.yml` | Manual, and after a release | Dry-run the migrations, then apply them and deploy the Edge Functions, behind an environment that needs my approval where the plan allows it |
| `keepalive.yml` | Daily | Calls a no-op Edge Function so the free project does not pause. Public repositories lose scheduled workflows after 60 days without repository activity (verify), so document the mitigation |
| `backup.yml` | Weekly | Exports my data to a private repository or an encrypted artifact, with a token I supply (section 6) |

### Web hosting

- Vercel Hobby from the GitHub repository: production from `main`, a preview for every pull request. Use the Vercel connector or CLI if one is available, otherwise give me the click path.
- Headers: strict CSP, long immutable caching on hashed assets, `no-cache` on `index.html` and the service worker.
- Add Supabase redirect URL patterns for production and for previews.
- The default domain is `*.vercel.app`. A custom domain costs money, so it is optional.

### Windows releases

- Generate the Tauri updater key pair in Phase 0. The private key and its password become repository secrets, the public key goes in `tauri.conf.json`, and I back up the private key myself.
- The update feed is `latest.json` on the latest release. Check on launch and every 6 hours, ask before installing, and never restart with unsynced changes.
- Until the installer is signed, Windows SmartScreen will warn on the first install ("More info", then "Run anyway"). Say so in the README.
- **Free signing (Phase 3, optional).** SignPath Foundation signs open-source projects at no cost. It asks for an OSI-approved license, a public repository, no proprietary code, multi-factor authentication, automated builds from source and a project-reputation review, so it may decline a brand-new project. The Microsoft Store is the other route: individual registration is free and Microsoft signs and hosts MSIX packages, but Tauri produces NSIS and MSI by default, so check packaging before promising it. If neither works, ship unsigned.

### Build prerequisites on my Windows PC

All free: Node LTS, pnpm, Rust through rustup, Visual Studio Build Tools with the C++ workload, the WebView2 runtime (already on Windows 11), the GitHub CLI and the Supabase CLI. Docker Desktop is needed only for local Supabase (free for personal use). CI builds the installer, so a local Rust toolchain is optional if I only want to install and test.

## 13. Testing, verification and device checklist

### Automated tests

| Layer | Tool | What it must cover |
| --- | --- | --- |
| Unit | Vitest, fast-check | Merge rules (property-based), hybrid logical clocks, fractional indexing, recurrence and exceptions, DST and time zones, Markdown and ICS round trips, Khmer and Chinese search tokenization, design-token contrast ratios. At least 85 percent line coverage on `packages/core`, and no coverage chasing elsewhere |
| Integration | Vitest, local Supabase, Deno tests | Sync convergence with three simulated clients (section 6), RLS tests proving another user cannot read or write my rows, Edge Functions against recorded Google fixtures and a local Radicale CalDAV server |
| End to end | Playwright (Chromium and WebKit, touch and mouse projects) | Sign-in with a test user, create and edit pages with the slash menu, offline edit then reconnect across two browser contexts, calendar create, drag, resize and undo, journal entry, search, theme switch, import and export, the install flow |
| Visual | Playwright screenshots | The matrix in section 10, light and dark, baselines made on CI. Small diffs fail the build |
| Accessibility | axe-core, keyboard-only scripts | Every route in both themes, plus reduced motion, forced colors and 200 percent zoom |
| Performance | Lighthouse CI, a seeded-workspace test | The budgets in section 10. The seed has 2,000 pages, 20,000 blocks, 5,000 events and 365 journal entries, with Khmer and Chinese text mixed in |
| Windows | `windows-latest` | The installer installs silently, the app launches and shows its window, then exits cleanly. Add `tauri-driver` tests if they prove stable |
| Feedback | Playwright | The pointerdown test and the lint rule from section 9 |

### Looking at your own output

After every UI change run `pnpm shots`. It renders the matrix and writes one contact sheet per screen. Open the images and read them. Check:

- Nothing is clipped, overlapping, or under a notch, home indicator or keyboard.
- Icon and text share a baseline and optical center, and padding sits on the 4-point grid.
- Touch targets are at least 44 × 44, and nothing important is within 8 px of a screen edge without a safe-area reason.
- Long titles, Khmer and Chinese text, empty, loading and error states, and 200 percent text all hold up.
- Dark mode has no pure-white surfaces, no low-contrast text and no unreadable shadows.

Fix and re-render until it is clean. In reports, list any remaining defect with its screenshot name.

### Verification ledger

Keep `docs/VERIFICATION.md` with one row per feature: Feature, Automated test, Verified by me on a device, Status. Statuses are `tested`, `device-verified` and `unverified`. A feature with no row is not done, and "Verified by me" stays empty until I confirm it.

### Manual device checklist

Write `docs/DEVICE-TEST.md` from this list, with a checkbox, date, OS version and Pass, Fail or Notes for each line. I run it at the end of Phase 1 and re-run the relevant parts after each later phase.

**A. iPhone 15, in a Safari tab and then as a Home Screen web app**

- [ ] First paint has no flash of the wrong theme in light and dark.
- [ ] Add to Home Screen with "Open as Web App" on. It launches with no Safari chrome, the right icon and name, and a clean launch screen.
- [ ] Nothing sits under the Dynamic Island or home indicator in portrait and landscape, and the status bar reads correctly.
- [ ] Sign in with Google and with an email code, both inside the installed app.
- [ ] Type English, Khmer and Chinese on the system keyboard. The slash menu and shortcuts never fire mid-composition, nothing jumps when the keyboard opens, and the toolbar sits above it.
- [ ] Slash menu, mentions, checklists, long-press drag reorder, undo and redo all work.
- [ ] Airplane mode: edit a page, add an event and a journal entry, reconnect, and see all three on another device within a minute.
- [ ] Calendar: month to day, long-press then drag to create, resize, the Undo toast, and a time-zone sanity check.
- [ ] Switch dark mode from Control Center while the app is open: the app follows. A manual override survives a relaunch.
- [ ] Every tap shows feedback at once. With Reduce Motion on there are no springs.
- [ ] Rotate. Background the app for 10 minutes, return, then kill and reopen it. State is intact and sync resumes with nothing lost.
- [ ] Web Push (P2): the permission prompt follows a tap, and a notification arrives with the app closed.
- [ ] Haptics, if enabled: a checkbox gives a light tap.
- [ ] Scrolling a 1,000-block page and a 200-event month stays smooth.

**B. iPad (A16)**

- [ ] Portrait and landscape layouts, the sidebar and the three-pane view.
- [ ] Split View at two widths: layout adapts, nothing overflows.
- [ ] Hardware keyboard: Cmd+K, the shortcut list, Tab order, Esc closes overlays.
- [ ] Trackpad or mouse: hover states appear only with a pointer, and disappear when it is detached.
- [ ] Apple Pencil (P3): sketch and Scribble work, with the pressure fallback if the Pencil reports none.
- [ ] Drag and drop of images and files from Files and Photos. Resize the window, if iPadOS allows it.

**C. Windows**

- [ ] Download the installer, see the SmartScreen steps from the README, install, and find the Start menu entry.
- [ ] Sign in through the system browser and land back in the running app through the deep link.
- [ ] Minimize, maximize and Snap Layouts work, and the window remembers its size and position.
- [ ] Display scaling at 100, 125 and 150 percent: nothing blurry, nothing clipped.
- [ ] Light and dark follow the system and the manual override, including the title bar.
- [ ] Offline editing, then reconnect and sync.
- [ ] Update flow: install version N, publish N+1, and accept the update.
- [ ] Uninstall leaves no leftovers. Tray, hotkey and notifications (P3) work after install.

**D. Across devices**

- [ ] An edit on one device appears on another in under 5 seconds when both are online.
- [ ] Two devices edit the same paragraph offline and both edits survive the merge. Two devices change the same event title offline and the later one wins.
- [ ] Theme and accent settings sync.
- [ ] Delete on one device and find the item in Trash on the others, and restore it.
- [ ] Connect a second Google account, disconnect it, and check its events are gone and its tokens are revoked (P2).

## 14. Phases and hard stops

Work one phase at a time. At the end of each, stop, send the report in section 15, and wait for me to say "continue". Give me a rough size for each phase (small, medium, large) in your first reply, not dates.

### Phase 0: Decisions, skeleton and brand (no product features)

Deliver:

1. Tool inventory, the verified free-tier ledger (`docs/FREE-TIER.md`), the five names, and the batched questions with defaults (section 3).
2. The repository (section 12): monorepo skeleton, CI green, a Vercel preview, and a Windows installer built by CI.
3. ADRs for the editor, sync layer, desktop sign-in, hosting, and the baseline data model, each backed by a short time-boxed spike: editor (touch drag, Khmer and Chinese IME, slash menu, Yjs, bundle size), sync (two clients converge offline), and Tauri (deep-link sign-in and CORS).
4. Design tokens, the `Pressable` primitive and a `/design` gallery of the core controls in light and dark.
5. The brand package from section 11, with the three concepts and your pick.
6. `docs/SETUP-CHECKLIST.md`: every account step I must do, with exact click paths. Cover Supabase, Google Cloud (consent screen set to "In production"), Vercel, GitHub secrets and the Tauri update key.
7. `CLAUDE.md`, `docs/PLATFORM-DIFFERENCES.md` and `docs/VERIFICATION.md`, started.

Exit when: CI is green; the preview URL opens on my iPhone and iPad and installs to the Home Screen; I can install the Windows build; the theme switch and the logo work; and each spike has a go or no-go.

### Phase 1: Core product (P1)

Deliver everything marked P1 in section 4, plus:

- Supabase Auth (Google and email code) including the desktop deep-link return, row-level security, and the local-first store with the sync engine and its status UI.
- The shell for phone, tablet and desktop, the motion primitives and the P1 rows of the feedback catalog (section 9).
- The PWA install flow and offline shell, the Windows installer with a working updater, import and export (Markdown, JSON, ICS), and Settings with storage meters.
- All tests in section 13 for the P1 scope, the sync convergence suite included. A draft project `SKILL.md`.

Exit when: the P1 acceptance tests pass, there are zero known alignment defects in the screenshot matrix, and I have run the device checklist.

### Phase 2: Power features (P2)

Deliver everything marked P2: Google Calendar with several accounts and two-way sync, ICS subscriptions and holiday calendars, databases (table, list and board views, typed properties, filters, sorts, groups, saved views and the tasks template), version history and templates, Web Push reminders, Notion export import and CSV import, the backup workflow, usage meters at 70 percent warnings, and an accessibility and performance pass.

Exit when: the Google account flow works end to end on all three devices (a token that survives past 7 days is proven by checking the consent screen status), the P2 tests pass, and I have re-run the relevant device checklist items.

### Phase 3: Completion and polish (P3)

Deliver everything marked P3: Apple and iCloud CalDAV, generic CalDAV and Outlook, calendar and gallery views, relations and rollups, columns and math, the sketch canvas and locked notes, the optional end-to-end encrypted journal with its recovery key, "On this day", and the Windows extras (tray, hotkey, notifications). Then the free code-signing attempt (section 12), final polish, README screenshots and the `v1.0.0` release.

Exit when: the feature list in section 4 is either done or listed as a documented gap, the full device checklist passes, and the free-tier ledger still holds.

### Definition of done for every feature

It works in light and dark at every size in section 10, by keyboard and by touch. It gives motion feedback and honors Reduce Motion. It works offline and syncs. It has tests and a row in `docs/VERIFICATION.md`. It adds nothing that costs money.

## 15. Reporting, priorities and your first reply

### Report at every stop

1. What I can do now, in three to seven bullets.
2. Evidence: the CI run, the preview URL, the installer link, and test counts.
3. What is unverified, and every known gap or defect.
4. What I must do by hand, as a numbered list.
5. Decisions that need me, each with your default.
6. The plan and size for the next phase.

### Priorities when things conflict

My data and privacy first, then the hard constraints in section 2, then accessibility, then the Apple look, then motion, then scope and speed. If a lower item would break a higher one, cut the lower one and tell me.

### Not in scope

Real-time collaboration or sharing with other people (the schema leaves room), AI features, native App Store apps, a web clipper, analytics, and anything that costs money.

### Known traps (do not rediscover them)

- Supabase Free pauses after a week of inactivity, has no automatic backups and no branching, and caps Realtime at 2 million messages a month and 256 KB a message. Send small change nudges, not payloads, and debounce them.
- Google refresh tokens die after 7 days while the consent screen is in "Testing". Calendar scopes are sensitive, so an unverified app in production shows a warning screen and is capped at 100 users. That is fine for me.
- On iOS, Safari tabs and the Home Screen web app have separate storage, there is no background sync, and Web Push works only from the installed app after a tap.
- Magic-link emails open in Safari and strand the session outside an installed web app. Use email codes.
- Tauri's webview origin differs from the web origin, so Edge Functions need CORS for both. Do not register the service worker inside Tauri.
- `100vh` is wrong on iOS. Use `100dvh`, `visualViewport` and safe areas. `:active` is unreliable on iOS Safari, so drive pressed states from pointer events.
- `contenteditable` on iOS is fragile: selection handles, autocorrect and IME composition all need device testing. Never run slash-menu or shortcut logic while `isComposing` is true.
- Scheduled GitHub workflows can be disabled after 60 days of inactivity in public repositories (verify the current rule).
- Apple's system color values drift between iOS versions. Read the current HIG page before locking the token table in section 8.

### Your first reply

Keep it short, and send it before you build anything. It contains:

1. The tools, connectors, plugins and skills you have, and what is missing.
2. Five candidate app names that are free as a GitHub repository name and an npm scope.
3. At most eight questions in one batch, each with a default. Include "keep my full signature private" and "public repository".
4. Any hard constraint in section 2 that you believe cannot be met, and why.
5. The first ten concrete actions of Phase 0, and a rough size for each phase.
