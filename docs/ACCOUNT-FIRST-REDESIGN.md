# Account-first redesign

Source phases were pushed directly to main on 2026-10-12 after `pnpm check`.
The original imported account remains intact: private read-only comparison found
69 pages, four database schemas and 62 document bodies unchanged, including all
original fields and body bytes. Project defaults are presentation views, not a
rewrite of the imported databases. See the aggregate integrity receipt.

Account entry uses persistent sessions, SDK email code verification and same-window
Google start. The existing sync engine retains its invisible cache and outbox.
First sign-in pulls account data before safely adopting guest drafts. Fixtures
cover first launch, wrong code, paste, resend, success, Google start and session
persistence; fixtures do not prove real email delivery or Google account linking.

The shell uses container widths with phone tabs, tablet sidebar expansion and
landscape list/detail, plus a 240px desktop sidebar. Writing hides navigation,
properties and status; five controls follow the simulated keyboard. Journal has
Write/Continue and History; Calendar has one view control and no per-day plus.
Task names lead Today, project views, Calendar and Search. Backup controls use
Export ZIP and Import, with JSON controls under More.

Local checks: 73 core cases, 88.91% core line coverage, 44 semantic contrast pairs,
and all initial/additional graphs below 250 KiB gzip. The final pre-baseline full
browser run passed 137 of 138 cases; its Settings contrast sample hit the opening
fade. Waiting for the sheet to settle passed the remaining case without changing
contrast rules. All 18 account fixtures passed. Final source-specific CI results
and the reviewed 510-image baseline receipt are recorded separately.

The first 510-image actual CI candidate (38223471702) was not approved: review
caught a narrow Calendar heading wrap and unsettled WebKit paint. The corrected
candidate waits for selected-day data and settled painting. The visual threshold
remains 0.001 changed pixels with pixelmatch threshold 0.1.

Installed Windows CI source 10aea20 passed render, multilingual note restart,
callback forwarding, normal exit and uninstall, then failed resident memory:
399,253,504 bytes versus the unchanged 157,286,400-byte budget. Idle CPU was 0%.
See `evidence/account-redesign-windows.json`. No release tag or v1 completion is
claimed. The Windows memory issue needs native profiling; physical iPhone/iPad,
IME, accessibility hardware and native OAuth remain unverified.

Publishing the account-required UI remains held until verified SMTP, token-only
email templates, real code delivery and same-owner Google linking pass. The older
working deployment remains live. Follow [the secure setup checklist](ACCOUNT-SETUP.md).
No paid plan, top-up, trial or billing account was added. Actual task content,
account emails, exports and credentials were excluded from Git and screenshots.

## Phase history

The following checks predate the final baseline; they are retained as phase evidence.

## Phase 1

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
