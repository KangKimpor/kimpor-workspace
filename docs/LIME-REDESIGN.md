# Lime workspace redesign

The supplied brief ends at section 1.6; its seven requirements and three
reference images define this implementation. Preserve source schemas, property
IDs, account isolation and the existing phone/tablet/desktop container layout.

Ordered phases: (0) plan and baseline, (1) tokens and Today, (2) Projects,
(3) Calendar, (4) editor/build update visibility, (5) remove Templates,
(6) durable Trash purge, (7) layout/accessibility audit and documentation.

Design: pale neutral canvas, white rounded cards, lime primary actions with dark
text, black schedule pill, restrained typography using the existing bundled
font. Dark mode uses charcoal surfaces and the same lime action treatment.
Projects uses a full-width task table and labeled view tabs; Calendar retains
the existing month/week/day/agenda engine and uses a full-height month grid.

Baseline on 2026-10-14: clean main at 645df5a; git fetch succeeded;
frozen-lockfile installation succeeded; pnpm check passed 76 tests, 89.26%
core line coverage, 220.2 KiB initial gzip and 44 contrast pairs. Existing Vite
warnings concern recurrence interop and AccountGate's mixed import modes.
The host reports pnpm 11.25.0; the repository pins 11.19.0.

The frontend-design, Ponytail and Plugin Management skills are available.
The named design and engineering skills are unavailable; token, accessibility,
test-plan, review and deployment checks are performed with repository tooling.

Purge verification must cover subtree/attachment/document/history cleanup,
account isolation, retries, stale-device resurrection and transactional rejection
of live pages. Layout verification must cover light/dark desktop1980, iPhone 15,
iPad portrait/landscape and the remaining existing screenshot profiles, with
overflow, touch targets and alignment assertions. Local screenshots are evidence
only; existing CI visual baselines and thresholds remain unchanged.

No Pages deployment, live migration, merge or visual-baseline approval is
authorized by this brief. Backend rollout and CI baseline review are final human
steps after the pull request is ready.

## Components and interaction contracts

- `Today`: schedule is a single Calendar action with real event times; counts
  use current tasks and projects. The agenda dot never consumes a flex column.
- `DatabaseEditor`: All tasks opens first, followed by source views. Keyboard
  arrows/Home/End move between tabs. Search and inline edits preserve source
  IDs and schemas; wide tables scroll inside their own pane. Missing table
  views are supplied for presentation, without changing imported definitions.
- `CalendarModule`: Today/period navigation shares the month heading's center
  line. Four view buttons replace the duplicate native picker. Month height
  follows the workspace container; the selected day stays available on phones
  and in the desktop sidebar. First-day, time-zone and recurrence logic remain.
- `AppUpdateNotice`: an available update occupies space below the toolbar.
  Activation flushes editors to durable storage before requesting SKIP_WAITING.
  Desktop builds register no service worker.
- `Trash`: native confirmation names the destructive scope. Purge includes
  nested pages/tasks, linked events, bodies, encrypted shards, history and files.
  Only Trash roots qualify. Persistent deletion IDs suppress stale devices;
  offline operations remain in the existing owner-bound transactional outbox.
  Old backup IDs cannot recreate purged items in the same workspace.

Default accent remains keyed `blue` for compatibility and is labeled Lime in
the interface. Existing font packages and accent preferences are reused. New
foreground/background pairs live in tokens.css and retain contrast thresholds.
Pressable targets, focus outlines, safe areas, reduced motion and IME handling
are preserved. Theme pairs, responsive overflow and touch targets are audited
by `pnpm layout:audit`; its fixture screenshots never replace CI baselines.

## Backend rollout for human approval

1. Apply only `202610140001_permanent_deletion.sql` to the existing project via
   the incremental migration path. The generated dashboard schema is for a
   fresh project and refuses an existing workspace.
2. Deploy the changed `attachments`, `maintenance` and `delete-account` Edge
   Functions before deploying the client. Retained purge notifications must
   remain available to stale devices. Database deletion is atomic; physical
   Storage cleanup retries through the existing 15-minute maintenance job.
3. Verify a test account's purge, stale-device pull, file cleanup and cloud reset
   against the deployed backend. Local SQL and browser fixtures do not prove
   production Storage cleanup, account/provider behavior or physical hardware.
4. Generate the 510-image candidate through the Visual baselines workflow and
   review it before replacing any baseline. Keep the strict pixel thresholds.
   Approve merge and Pages publication separately after backend readiness.

Rollback: retain the migration and deletion ledger. Reverting the UI cannot
restore purged content. Retain maintenance until the file queue is drained;
existing independent backup copies are outside Trash's deletion scope.

## Local verification, 14 October 2026

`pnpm check` passes 79 unit tests, 89.5% core line coverage, 221.5 KiB initial
gzip and 48 contrast pairs. Both web and desktop frontend builds pass the
obsolete-status guard. SQL bootstrap plus all eleven migrations, existing
ownership checks and permanent-deletion checks pass in isolated PostgreSQL
18.6 on this Windows host; no live project was contacted. Deno 2.5.5 checks all
eight Edge Functions and passes seven backend contract tests.

The layout audit passes 442 populated/empty screen cases: thirteen states in
each of seventeen profiles and both themes. It checks document/root/main
overflow, nominal 44px targets (0.5px measurement tolerance), toolbar center
alignment, desktop month height, agenda gutter and the full-width project pane.
See `evidence/lime-layout-audit.json` and local fixture screenshots under
`docs/screenshots/lime-layout/`. Minor final color-label copy and native checkbox
accent changes do not change measured geometry. These captures are evidence,
not approved visual baselines.

All 28 targeted browser regressions pass in Chromium, desktop WebKit, Firefox
and phone WebKit; the 30-case responsive matrix and 18 account entry fixtures
pass. These cover task views/search/status editing, month selection, Trash
cancel/restore/purge/reload and editor persistence through simulated app updates.
The final complete browser suite passes all 150 cases, including the existing
accessibility, multilingual persistence, offline, import, protection and gesture
checks. Final self-review also adds an owner check around the destructive UI
operation's editor flush and avoids showing an old account's deletion result
in a newly selected account.

JavaScript licenses and Gitleaks's 69-commit history scan pass. Existing build
warnings about recurrence interop and AccountGate import modes remain. No new
runtime dependency was added. Production Storage deletion, live sync/providers,
physical iPhone/iPad and the native Windows runtime were not tested by this work.
