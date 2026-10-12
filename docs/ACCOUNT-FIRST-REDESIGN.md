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
