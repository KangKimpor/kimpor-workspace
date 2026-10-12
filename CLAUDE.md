# Kimpor Workspace working memory

Updated 2026-10-12 UTC. Account-first UI phases are pushed; the first actual CI candidate was rejected for narrow Calendar wrapping and unsettled WebKit paints. The corrected source requires a replacement recording. Read
docs/ACCOUNT-FIRST-REDESIGN.md and docs/VERIFICATION.md before editing.

## Authorization and decisions

The user explicitly authorized completing all phases, doing available account
steps and pushing directly to main. This supersedes BUILD-PROMPT.md's phase stops
and PR-before-merge rules. Do not request the same authorization again.

Kimpor Workspace, public MIT, KangKimpor/kimpor-workspace, derived A monogram, unsigned Windows
initially. Original signature and updater key/password are private and ignored.
Only current free plans, no cards, paid trials or subscriptions. Unconfigured
builds are for development and fixture tests. Service capacity is finite.

## Commands

Node 24; pnpm 11.19.0; exact versions in pnpm-lock.yaml.
`pnpm install --frozen-lockfile`; `pnpm dev`; `pnpm check` (lint, types, core tests
and coverage, backup CLI test, web build, bundle and contrast budgets).
`pnpm run licenses` (not bare pnpm licenses); `pnpm licenses:deno`; `pnpm licenses:cargo`.
`pnpm e2e` runs Chromium, WebKit, Firefox and phone WebKit. Preview on 4173 before
`pnpm shots` and `pnpm lighthouse`. PostgreSQL: `bash scripts/sql-test.sh` with
Docker. Backend: pinned Deno 2.5.5 via scripts/deno-install.sh, then check/test with
supabase/functions/deno.json. Managed host TLS uses DENO_TLS_CA_STORE=system.
`pnpm build:desktop` has no SW; Windows/Rust/VS C++ build via desktop package.

## Map

- apps/web: WorkspaceApp, RichTextEditor, CalendarModule, AccountPanel,
  ImportExportPanel, ApplicationLock, notifications, search worker and appearance.
  `/design` and `/spikes/editor` preserve the foundation studies.
- packages/core: unified models, Dexie store, field HLCs, auth/cloud/sync,
  encrypted envelopes/files, export/import, rational ordering and platform APIs.
- packages/integrations: RRULE/DST/ICS, provider boundary, stable remote IDs.
- apps/desktop/src-tauri: native window/tray/hotkey/deep link/autostart/notifications,
  explicit updater consent and save-before-quit. Windows GNU cargo check passes;
  Windows MSVC/NSIS build and install/protocol/single-instance/exit/uninstall
  checks pass on the real Windows runner. The aggregate 150 MiB resident-memory
  gate failed repeatedly (first run 251.6 MiB). Run 38121695281 then passed at
  143.9 MiB; this variable result is not a demonstrated memory fix. New Windows
  checks require rendered UI and note/reload persistence before measuring memory.
- supabase: owner RLS and service-only RPC migrations, eight Edge Functions,
  encrypted provider credentials, attachments, maintenance, backups and health.
- scripts/workflows: browser matrix, budgets/licenses, secret scan, desktop build,
  SQL/Deno checks, manual backend deploy, encrypted weekly backup, daily health.

## Invariants and gotchas

The user renamed the product Kimpor Workspace on October 11; see ADR 0008. Keep
legacy storage/crypto/export/provider identifiers and private @veloradesk package
names for compatibility. New desktop OAuth uses kimpor-workspace with the legacy
veloradesk scheme accepted under the same validation. Public downloads use the new
name. Local browser libraries are under /workspace/veloradesk-validation/browser-libs
after the environment restart; set LD_LIBRARY_PATH to its usr/lib/x86_64-linux-gnu
when running local WebKit. CI uses normal installed dependencies.


The account is authoritative. IndexedDB is an invisible cache and outbox.
First sign-in pulls the account before additive cache adoption; account fields
win collisions and compatible Yjs documents merge. Never restore an older export
over account data. Lists are cached synchronous reads; writes and cursor
application are transactional. Capture owner before awaits and recheck after
network calls. patchPage(properties) replaces properties; pass existing keys
when changing one value. Per-property HLCs preserve concurrent independent edits.
Never mutate an idempotency payload after it may have reached the server.

Yjs bodies merge; materialize the lazy `default` XML fragment before treating it
as a typed root. Plain documents compact by explicit known IDs and snapshot CAS.
Protected bodies merge after decryption and supersede only decrypted known shards,
so unseen offline peers survive. Keep latest wrapVersion when persisting after
passphrase recovery. Old copies of wrappers/data keys cannot be revoked.
File ciphertext uses a per-file key kept in the owning Yjs body. Keys and private
bodies must not enter title/search/provider metadata. Protection purges plaintext
local versions/index/outbox and remote document rows. App lock is interface privacy.

Register editor flushers for body, title, file reads and protection operations.
Read freshly created pages from store.listPages in openPage; a render closure can
miss a new row. Attachment insertion includes a following paragraph to prevent
later block insertion from replacing the selected atom. Optional Realtime nudges
must never roll back durable writes. Reminders are centrally scheduled; 0 means
None. All-day reminders use 09:00 in startZone.

Use Pressable for buttons, semantic tokens, 44px targets, visible focus, safe areas,
reduced motion and IME guards including keyCode 229. Closed phone sidebar must be
hidden from keyboard/accessibility. Native APIs stay behind platform.ts. Web and
native CSP allow only configured Supabase network surfaces; desktop registers no SW.
Provider secrets have no client-readable grants. Never log passwords/tokens/keys.

## Evidence and outstanding access

Whole-core line coverage exceeds 85%; this is not browser/native/backend coverage.
Simulated clients and provider fixtures are not live multi-device/provider proof.
No physical-device manual verification has been supplied. Managed local browsers
need PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1; CI installs normal libraries.

The user completed secure GitHub browser sign-in. TinyFish created the public
KangKimpor/kimpor-workspace repository; origin is configured and main was pushed
directly. Real Quality, Visual baselines, CodeQL and Windows jobs are available.
The first Quality run caught the PostgreSQL image's temporary-server readiness
race; scripts/sql-test.sh now waits for the final TCP listener and passes locally.
GitHub Pages is configured with GitHub Actions as its source. Track actual run and
deployment outcomes in the evidence ledger; never infer success from a dispatch.
Never force-push unrelated history.
The dedicated Supabase Free/NANO project kimpor-workspace
(nlcpjdokfvawlpzyfytx, Singapore) is deployed: ten migrations, eight active Edge
functions, owner RLS/private Storage, Auth redirects and maintenance cron verified.
Public Pages has cloud configured by default; KIMPOR_CLOUD_READY=false is the
development/test flag, with no UI control. Default free email sign-in is restricted to project
team addresses. One real owner account was created and confirmed during the
requested private Notion migration. Do not put its email, tasks or exports in Git.
Private migration files and deployment token are in .private; never archive them
with source. The migration copied four databases/62 tasks and verified all
properties/Yjs bytes plus a cold pull. 124 empty Drive/Figma template blocks retain
source links; empty PDF placeholders have no file bytes. No Notion source changed.
The GitHub Supabase deployment secret still needs credential repair; direct HTTPS
deployment succeeded independently. Provider consent, native PKCE and physical
push receipt remain unverified. No paid resources or trials were used.

Actual Windows run 38127531039 renders Today, creates/reopens a multilingual note,
handles protocol/single-instance/exit/uninstall, but fails aggregate resident RAM
at 409,358,336 bytes against 150 MiB. Do not weaken this gate or call v1 complete.
Current redesign: 73 core tests, 88.91% core line coverage, 219.8 KiB initial
JS graph and 44 contrast checks pass. The final app run passes 137/138 cases; its
Settings contrast check sampled a fade and passes after waiting for opacity 1.
All 18 light/dark account fixtures pass. The 510-capture matrix has 15 screens,
17 profiles and both themes, including sign-in/code, scaling and Split View.
Actual baseline run 38223471702 records UI source 10aea20; do not approve local
screenshots or infer CI success from dispatch. Preserve the 0.1% visual gate.

The editor accepts text only after its collaboration view initializes. Formatting
requests are queued across protection changes. Container layouts are phone <600,
tablet 600–1023 with default 72px icons and optional expansion, desktop >=1024
with 240px sidebar/list/detail. Missing imported type-default views are display
only; field IDs, source schemas and document bytes are preserved. Private comparison
at 07:52 confirms all 69 pages/four schemas/62 documents unchanged.

Google project kimpor-workspace-auth exists and audience is External. Branding
was not saved and no client was created by automation. Its included credit was
exhausted; no paid top-up. Plugin Management found no direct Brevo/Google OAuth
setup connector. SMTP, token-only templates, real delivery and same-owner Google
linking remain pending. See docs/ACCOUNT-SETUP.md. The deployment helper now refuses
the default sender, and its SMTP path writes only {{ .Token }} at six digits/600s.
Production requires account-auth-readiness.json proof plus KIMPOR_AUTH_READY=true.
Do not mark these booleans true from fixtures or a generated admin session. The
GitHub tool token cannot manage repository variables. Main native builds are
development fixtures; tagged builds require real readiness. Keep rendered Unicode
persistence and the aggregate 150 MiB RAM gate unchanged; no v1 release claim.

Latest rendered Windows development fixture (38223202981 / 10aea20): lifecycle and Unicode restart pass, resident memory 399,253,504 bytes exceeds the unchanged 150 MiB gate. Details: docs/evidence/account-redesign-windows.json. The final narrow Calendar and backup-control corrections pass pnpm check; desktop/phone Settings accessibility also passes.

## Local-session handover, 12 October 2026

Read HANDOVER.md first. Actual UI-source7e713e1 CI38231262045 has136 expected passes, one flaky and one unexpected failure: desktop1920 dark editor body is empty after navigation/reopen (tests/responsive-matrix.spec.ts:45); light variant passes only on retry. Fix this before release/baseline acceptance; do not weaken persistence assertions. Final510-image candidate38231262270/artifact11738374195 succeeded but is NOT reviewed/copied; committed baselines remain historical312. Native7e run38231262067 fails smoke checks. Deployment remains held. The handover commit includes smtp_max_frequency30 and CI45-minute capacity for the larger suite, without changing any acceptance thresholds.
