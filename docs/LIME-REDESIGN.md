# Lime workspace redesign — updated brief

Continuation dated 15 October 2026. This supersedes the earlier report based on the unfinished prompt. The complete `kimpor-workspace-redesign-prompt.md` is the design brief; `message (9).txt` is historical context. Work continues on `redesign/lime-workspace` in PR #15. No main push, live migration, merge, baseline approval or Pages publication is included.

## Owner priority: web first

On 15 October 2026 the owner explicitly paused Windows 11 EXE work. Finalize the web app first. Windows executable implementation, packaging, installation and native acceptance are a later **final stage**, after web finalization and further owner direction. Keep the current work focused on web behavior, responsive layouts, browser verification and the reviewed web/backend rollout. Desktop asset builds already completed are evidence only; they do not mean native work is active.

## Requirement coverage

| Requirement | Implementation | Evidence and release boundary |
|---|---|---|
| R1 | Neutral/ink/lime tokens, Urbanist with Khmer fallback, responsive shell/dock, schedule timeline, Today counts/filter chips/project and task cards | `tokens.css`, `Today.tsx`, `today.css`; contrast, task and layout checks. Reference image files were unavailable; the complete brief's measured values were used. |
| R2 | Project cards, persisted description, table-first new projects, preserved imported property/view IDs and labels, keyboard tabs, Filter/Sort/Properties dialogs, column visibility, sticky table, inline creation, phone cards and wide row peek | `WorkspaceApp.tsx`, `projects.ts`; preset/core, project and responsive browser tests. Existing native date inputs remain for platform keyboard/date-picker support. |
| R3 | Period/date chooser, searchable view menu, mini month/sidebar drawer, Sunday default without overwriting stored preferences, full-height desktop month, clipped multi-day spans, overflow list, keyboard grid navigation, compact phone month/agenda and single-column time views | `CalendarModule.tsx`, `CalendarMonth.tsx`, `calendar-redesign.css`; recurrence/DST/provider/ICS unit tests, browser tests and layout audit. Tasks mode is read-only and backed by due dates. |
| R4 | Removed editor save-device wording and associated styles; update toast flushes editors before activating a web update | `rich-editor.css`, existing `AppUpdateNotice.tsx`; simulated app-update and multilingual offline browser regressions. Native build excludes service-worker registration. |
| R5 | Removed Templates controls; legacy `__template` properties are not a visibility filter and remain exportable ordinary pages | `WorkspaceApp.tsx`, store exports; no destructive migration of legacy pages. |
| R6 | Search/type filters, selection, Restore/Delete forever/Empty Trash, alertdialog with Cancel focused, server acknowledgement before local cleanup, restore refusal refresh, owner guards, descendant/data cleanup, permanent markers and Storage retry queue | `TrashPanel.tsx`, `store.ts`, `cloud.ts`, additive migration `20261014112842_acknowledged_purge.sql`; core, SQL and Deno tests. **Cloud rollout remains pending approval.** Linked calendar events survive. |
| R7 | Explicit 1980 target; 17 profiles × 2 themes; geometry, target, accessibility, month keyboard and menu checks; board, phone cards, auth fixtures and safe-area simulations | `tests/layout-audit.spec.ts`, `scripts/layout-audit.mjs`, `playwright.config.ts`; generated `docs/evidence/lime-layout-audit.json`. Strict approved visual baselines remain a separate human step. |

## Decisions and limits

- Urbanist is the sole new runtime dependency. Legacy package scopes, storage keys, imported schemas and property IDs stay intact. The default accent becomes `lime`; the old blue default migrates once, and later explicit choices remain available.
- Interactive month event lanes use 44 px rather than 24 px. A 308 px mini calendar accommodates seven 44 px date targets; 256 px cannot do so. These changes honor the brief's touch/accessibility requirement.
- Short phones scroll complete month rows within the compact grid, preserving full date targets above the floating action and dock. Desktop date-number activation opens Day; phone activation keeps the selected-day agenda.
- A shared small menu uses existing Pressable/React portal code. Filter/Sort/Properties reuse the existing Sheet focus-management contract, anchored beside the triggering desktop control and presented as phone sheets.
- Week grids retain two separate 44 px event/open and resize targets. On narrow tablet panes the week scrolls horizontally inside its marked region; phone week/day remains a single column. Calendar headings stick below the safe-area-aware app header.
- Native date inputs are retained instead of introducing a custom calendar widget. Existing device keyboard and date semantics are more reliable; display formatting follows the platform.
- Cell activation reuses the full validated event dialog rather than maintaining a second quick-create form; recurrence and time-zone controls remain available in that same flow.
- Permanent deletion is deliberately online-only for cloud owners. The unsent purge-intent behavior in the earlier partial implementation is superseded. The UI first flushes editors and syncs normal changes, then asks the strict RPC. No offline destructive intent is queued.
- Linked events are retained even when their page is purged. Opening the missing link explains that the page is no longer available. Purging a project removes its descendant pages/rows/database definition, documents, encrypted bodies, history and file metadata, and queues private file deletion.
- Missing optional design/engineering skills were handled with repository checks and direct review. Plugin Management and Graphify were consulted; Graphify had no matching redesign memory. No plugin installation was needed.

## Verification approach

The untouched-main baseline from the prior session was `645df5a`: frozen install and `pnpm check` passed, 76 tests, 89.26% core line coverage, 220.2 KiB initial gzip and 44 contrast pairs. The partial redesign started this continuation at 221.6 KiB. Current command results are recorded in `VERIFICATION.md` and the PR.

The layout test uses synthetic local content, fixed time, both themes, simulated safe areas and the existing 17 browser profiles. It checks horizontal overflow, targets, overlap, escaped controls, truncation, selected left edges, equal month rows, dock clearance and serious/critical axe violations. It waits for Pressable springs to settle before measuring. Sign-in and email-code use a separately built mock auth origin, never a real account. JSON receipts are generated only from passing tests; an incomplete matrix exits unsuccessfully.

Imported self-linked project roots remain visible in Trash; ancestor traversal is shared with the sidebar count and has a dedicated regression.

The audit does not establish physical-device acceptance, every prose spacing value, screen-reader quality or fidelity to unavailable reference images. Human review of the 510 strict visual baseline candidates remains required. The 18 audited application/auth states produce 612 local captures; these are not replacements for that baseline set.

PostgreSQL tests were executed in a disposable local PostgreSQL 17 instance with all 12 migrations and synthetic owners. This provides actual SQL execution despite Docker being unavailable. Ownership, strict acknowledgement/refusal, restore wins, stale peers, retained events and Storage cleanup queue assertions pass. Deno checks all eight Edge Functions; eight contract tests include failed Storage cleanup retaining its retry work. No live data was deleted.

Read-only live checks after the owner unpaused Supabase report `ACTIVE_HEALTHY`, PostgreSQL 17.11 and a successful database query. The permanent-deletion table and new `purge_entities(jsonb)` RPC are absent in production. Healthy status is not evidence that the new backend is deployed.

## Visual self-review

`SHOT_SCREENS=today,calendar pnpm shots` completed 68 captures. Reviewed the four `docs/screenshots/contact-today-{light,dark}.png` and `contact-calendar-{light,dark}.png` sheets, plus full-size Today/Calendar captures at desktop1980, iPhone 15 and iPad. Fresh final-build captures in `.private/redesign-{today,calendar}-{desktop1980,iphone15,ipad}-{light,dark}.png` confirm the navigation icon paint, ink controls and single-line current-time marker. The 12 final module/theme, Trash and Today navigation regressions pass across all four browser projects.

Also inspected `project-table.png` from the desktop1980-light and iphone15-portrait-light layout-audit output, and desktop1980-dark `sign-in.png`. The phone table becomes cards with a native editable title field; longer titles scroll within that field. The original brand mark is retained on sign-in.

The three reference image files were unavailable, so exact visual comparison remains unverified. Observable departures from the prose reference are documented above: 44 px event lanes, a 308 px mini calendar, native date fields and the full event dialog. Sparse fixture content intentionally leaves open space. The audit checks selected alignment/gutter relationships and simulated insets, not every spacing value or physical device inset. Human baseline and device review remain required. Capture metadata rewritten by `pnpm shots` was restored; no approved baseline images were changed.

## Rollout after approval

1. Review PR #15, the SQL/ADR and changed function deployment bundles. Take the normal encrypted backup and verify the recovery path.
2. Apply **both** pending migrations in order: `202610140001_permanent_deletion.sql`, then `20261014112842_acknowledged_purge.sql`. The second migration corrects the earlier implementation's event cascade and adds strict acknowledgements. Do not stop after the first.
3. Deploy the changed `attachments`, `maintenance` and `delete-account` Edge Functions from the existing branch, using the established CLI/dashboard path. The local dashboard bundle includes all 12 migrations and eight functions; regeneration is checked in CI.
4. With synthetic signed-in test content, verify two-client deletion/refusal, offline blocking, missing-page event guidance, file cleanup retries and account isolation. Real owner content is unnecessary.
5. Run the Visual baselines workflow or request its candidate with the existing PR label, review all 510 captures, and commit only the human-approved images. Do not relax comparison thresholds.
6. Merge and publish Pages only after explicit approval. Refresh installed web copies via the update toast/Install settings; complete iPhone/iPad web acceptance. Keep Windows 11 EXE work deferred until the web app is finalized.

No live migration or deployment has been performed in this continuation.
