# Kimpor Workspace implementation report

Updated 2026-10-12. Public app: https://kangkimpor.github.io/kimpor-workspace/.
Public main: https://github.com/KangKimpor/kimpor-workspace. Version 0.0.1.

## Delivered behavior

Today, Calendar, Notes, Journal and Workspace share durable local records and a
Yjs editor. Five database views, typed properties, filters, templates, versions,
search, recurrence, files, math, sketching, app lock and optional document
protection are implemented. Navigation flushes pending titles, bodies and files.
Writing shows five controls with an on-demand formatting panel. Tablet and phone
writing hides the document list, large note icon and duplicate header actions.
Journal has a Today card, dated entry previews, search and optional writing history.
Calendar keeps month selection in place with a selected-day agenda, compact view
selection on touch widths and optional event details. It has one primary event
action and no per-day plus buttons.
Desktop sidebar collapse, phone edge-back, sheet sizing and Today title collapse
are implemented. Referenced Notion ZIP files are encrypted and hierarchy retained.

The dedicated free Supabase project has ten migrations, eight functions, owner
RLS, private Storage, Auth redirects and successful maintenance cron. Actual API
checks and published Chromium/WebKit UI checks pass cloud upload/download,
offline reconnection, foreign-owner isolation and exact attachment bytes.
The requested private Notion migration was uploaded to its confirmed owner:
four databases and 62 tasks, with all field/document bytes and a cold client pull
verified. The source workspace was not modified. Private data stays out of Git.

## Evidence

- Local quality checks and final core run: 66 core tests plus one web startup regression, 88.29% core line coverage (85% gate),
  backup test, seven cloud-management tests, build, bundle limits and 44 contrast pairs.
- Ten SQL migrations and seven Deno fixtures/eight entry points passed before
  this frontend update; these backend sources are unchanged.
- Main 36bdd59: actual Quality 38160971705 passes 67 unit cases, all 80 browser
  cases and 312/312 pixel comparisons at the unchanged 0.1% gate. CodeQL and
  Pages deployment 38160971910 pass. See interface-quality-ci.json.
- Four additional browser regressions verify imported timed dates display their
  stated day while preserving the full timestamp and offset on export.
- The eight added navigation/import cases pass Chromium, WebKit, Firefox and
  phone WebKit. Final full-source browser/viewport results live in evidence files.
- Published cloud-interface-live.json records actual two-engine live UI behavior
  on deployment 38158472168; cross-engine title appearance was 2,558 ms in that
  sample. All four privately imported databases also open in fresh desktop
  Chromium and phone WebKit sessions; later owner edits are preserved.
- Windows 38160971752: installed release app rendered Today, saved/reopened Khmer
  and Chinese text, handled protocol/single-instance/normal exit/uninstall.
  Aggregate working set was 404,180,992 bytes; the 150 MiB gate failed. CPU was 0%.
  The UI Automation timing includes harness setup and is not a pure launch metric.

## Remaining release gates

No physical iPhone/iPad/Windows or Pencil/IME/VoiceOver verification, native PKCE,
calendar provider consent/seven-day token retention, closed-app push receipt or
N→N+1 signed updater proof is available. Windows memory and maximum 16 ms typing
frames fail. Full editor/gallery/database virtualization, 30-day Trash purge,
uploaded covers, native touch tree reordering, opt-in journal location/weather,
a real database files picker, general region/language editing and richer Notion
layout/history fidelity remain partial or absent. Formula/timeline are stretch.

Default free Auth email is limited to project-team addresses. Google sign-in is
hidden until configured. The GitHub deployment secret still needs repair even
though direct deployment succeeded. Backup workflow files are not proof that a
real owner's backup schedule and keys are configured. This is not a completed v1
or a claim that every original phase requirement is finished. See VERIFICATION.md.
