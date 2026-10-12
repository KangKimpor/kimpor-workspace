# Account-first redesign

Requested 2026-10-12. Work directly on main, in verified phases, free services only.

1. Account entry: persistent sessions, code-only email entry, same-window Google
   start, invisible cache/outbox and additive adoption after the account pull.
   Preserve the existing sync engine and account ownership.
2. Projects: task names first, type defaults and metadata-only mapping of existing
   databases. Preserve all task records and document bytes. Fixtures only in Git.
3. Layout: container breakpoints below 600, 600–1023 and 1024+; phone tabs,
   tablet/sidebar splits, keyboard-aware writing, simpler Calendar and Journal.
4. Feedback and verification: transform/opacity transitions, reduced motion,
   device profiles, reviewed actual-runner baselines and unchanged budgets.
5. Documentation and deployment: source-specific evidence, passing phase checks,
   direct main commits, free deployment and explicit hardware/access limits.

## Fixed gates

`pnpm check` must pass before every phase commit. Pixel changed ratio ≤0.001,
contrast and 250 KiB gzip graph budgets are unchanged. Windows aggregate resident
memory must remain ≤150 MiB; the previous rendered-app run failed this gate.

## Account configuration

Read-only API and browser audit confirm six-digit/600-second email settings,
one confirmed account, no Google identity, Google disabled and no custom SMTP.
Templates still contain confirmation links and cannot be edited with the default
sender. Google Cloud opened signed out. No identity setting was changed.

Brevo's current free pricing lists 300 emails/day, subject to sender verification
and account approval: https://www.brevo.com/pricing/ (checked 2026-10-12).
Custom SMTP and OAuth secrets must stay in secure provider settings. Real Google
linking must be checked against the existing confirmed account before identity
changes. These steps remain pending access; fixture tests cannot prove them.

## Evidence

Phase 1 passes `pnpm check`: 68 unit cases, 88.51% core line coverage,
217.1 KiB initial gzip graph and all 44 contrast pairs. Nine configured-auth
browser fixtures pass across Chromium desktop and WebKit iPhone/iPad: pasted
code, wrong code, resend countdown, persisted session and same-window Google.
Native persistence still checks exact multilingual text after restart; removed
save-status waits cannot substitute for that assertion. No release budget changed.

The preceding
92 browser/312 visual result is historical, not proof of this redesign. Physical
phones/tablets/Windows scaling, real consent and real code delivery are unverified.

## Phase 2

Projects replaces Workspace in navigation. New project opens five type choices;
quick add starts with focused Task name and collapses project/date/notes under
Details. Today groups by time and completion moves tasks to Done. New weekly
checklist tasks roll to the next week on completion. Project views keep title
first and show at most three secondary fields; remaining properties stay in the
row's Details and project More controls.

The existing four databases map deterministically to two weekly-report and two
rework views. Mapping uses account records for presentation and preserves source
field IDs, schemas, task fields and Yjs bytes. An independent private API comparison
confirmed all 62 tasks and 69 current pages unchanged. Only aggregate evidence is
public in evidence/account-redesign-integrity.json.

Twenty Projects/editor-protection/app-lock browser cases pass across Chromium,
WebKit, Firefox and narrow phone WebKit. Google Cloud project creation succeeded
without billing, but its consent wizard stalled twice before client creation.
Google remains disabled, real identity linking untested. Brevo opened signed out;
SMTP setup is pending secure access. No identity or task records were rewritten.

## Phase 3

The workspace switches by its own container width: phone below 600px, compact
72px tablet sidebar from 600–1023px, and 240px desktop sidebar from 1024px.
The editor presents a title and body, with properties in Details. Phone and
portrait tablet use five writing controls above the visual viewport keyboard;
desktop uses a selection toolbar or Formatting from the page menu. Hidden block
handles no longer allocate scroll/resize observers. Navigation retains pending
multilingual edits and restores the preceding pane.

Journal has one Write/Continue action, entry previews, Search and optional History.
Month Calendar has one view selector, selectable 44px dates and a selected-day
list without daily add buttons. Due tasks appear by their original task name;
opening them opens their task, and moving one changes its existing due field.
Sheets use transform-based drag feedback and spring between the two detents.
The 4pt spacing tokens, safe-area padding, full-height scroll area and compact
sidebar Settings access were checked at all five requested viewport sizes.

Keyboard tests simulate visualViewport changes; these are not physical keyboard,
safe-area or Dynamic Island verification. The Google browser was signed in but
exhausted its included credit before saving Branding or creating a client.
Audience is External; Google remains disabled. Custom SMTP is still unconfigured.
No account identities, task records or export bytes were changed by dashboard work.

Phase 3 final `pnpm check` passes: 72 unit cases, 88.86% core line coverage,
219.3 KiB initial graph and all 44 contrast pairs. The 16 targeted product and
responsive cases passed after correcting the final phone formatting/navigation
issue (the two encryption cases were rerun on the final build). Earlier fixture
checks cover attachments, journal resume, calendar selection, sheet detents,
cache persistence and accessibility. Full final cross-engine and visual evidence
belongs to Phase 4, not these development checks.

## Phase 4 source and fixtures

The five requested viewport profiles now run in light and dark, alongside the
original Chromium, WebKit, Firefox and narrow-phone suites. The matrix contains
138 app cases and 18 account-entry fixtures. The final app run passed 137 cases;
the Settings contrast check sampled the opening fade and passed when rerun after
waiting for opacity 1. All contrast assertions and 44 semantic-pair checks remain
unchanged. The editor now waits for its collaboration view to initialize before
accepting text, and formatting requests survive editor protection changes.

The screenshot matrix is 15 screens × 17 profiles × 2 themes = 510 captures,
including sign-in/code entry, the requested sizes, Split View, 1366/1920 desktop
scaling and 1980×1080/1200. All captures use fixtures and have no horizontal
page overflow. Local review is not an approved CI baseline. Actual-runner
recording/review and the unchanged 0.1% comparisons remain required.

Imported projects receive missing type-default views only for display. Source
field IDs and schema objects remain unchanged; week groups use existing dates or
Anytime. A second private read-only comparison confirms all 69 pages, four schemas
and 62 document byte sequences unchanged. Aggregate evidence is in
account-redesign-final-integrity.json; no exports or user contents are public.

Main Windows builds are explicitly development fixtures for the unchanged
rendered UI, Unicode persistence and aggregate 150 MiB RAM gates. Tagged builds
require real account readiness. Public Pages also requires live code delivery,
code-only templates and same-owner Google linking; fixture success cannot enable
production. Current provider configuration is incomplete, so deployment is held.
