# Kimpor Workspace working memory

Updated 2026-10-11 UTC. Phase 1–3 local implementation is ready for continued
verification and deployment. Read docs/PHASES-1-3-REPORT.md and docs/VERIFICATION.md.

## Authorization and decisions

The user explicitly authorized completing all phases, doing available account
steps and pushing directly to main. This supersedes BUILD-PROMPT.md's phase stops
and PR-before-merge rules. Do not request the same authorization again.

Kimpor Workspace, public MIT, KangKimpor/kimpor-workspace, derived A monogram, unsigned Windows
initially. Original signature and updater key/password are private and ignored.
Only current free plans, no cards, paid trials or subscriptions. Local work never
requires cloud. Free-service availability and storage are finite.

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


IndexedDB is authoritative. Lists are cached synchronous reads; writes and cursor
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
explicit local-only switch. Default free email sign-in is restricted to project
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
Current local core suite: 66 tests, 88.29% line coverage. Prior main 7459156 has
successful CI (68 browser/312 visual) and Pages deployment. Current simplification
requires fresh visual baseline review and source-specific browser evidence.
Mobile editor tools collapse to five primary controls; Journal has Write today
and a compact week/history; Calendar has no per-day plus controls. Sidebar
collapse, phone edge-back/save and sheet detents have eight passing browser cases.
Keep the original 0.1% visual threshold and record actual runner provenance.
