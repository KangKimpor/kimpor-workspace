# Kimpor Workspace — local session handover

Updated 12 October 2026, Cambodia time. The user requested this handover so work can continue in a local session. **The project is not finished or newly deployed.**

## Start here

Repository: https://github.com/KangKimpor/kimpor-workspace — branch `main`.
Current cloud checkout: `/workspace/veloradesk`. Use your own local clone; this cloud path, browser profiles and private credentials do not transfer automatically.

Read `CLAUDE.md`, `README.md`, `docs/PLATFORM-DIFFERENCES.md`, `docs/VERIFICATION.md`, this file, and `docs/ACCOUNT-SETUP.md` before editing. Check for applicable `AGENTS.md` files. Plan first.

```sh
git clone https://github.com/KangKimpor/kimpor-workspace.git
cd kimpor-workspace
git switch main
git pull --ff-only
pnpm install --frozen-lockfile
pnpm hooks:install
pnpm check
pnpm exec playwright install --with-deps chromium webkit firefox
pnpm dev
```

Use Node 24 and pnpm 11.19.0. On Windows, install Playwright browsers with the supported platform command; Linux `--with-deps` installs system libraries. Test fixture builds intentionally have no production account connection. Never use real user data for tests or screenshots.

## Authorization and nonnegotiable constraints

- The user authorized work in phases, direct commits/pushes to `main`, deployment and available account/dashboard setup. No repeated approval is needed for this scope.
- Free plans only. Do not add billing, paid trials, browser wallet top-ups or subscriptions.
- Run **`pnpm check` before each phase commit**. Do not weaken tests to make them pass.
- Visual: maximum changed-pixel ratio **0.001 (0.1%)**, pixelmatch threshold **0.1**. Review actual CI captures; never pretend local captures came from CI.
- Preserve all **44 contrast pairs**, each initial/additional JavaScript graph **≤250 KiB gzip**, Windows app plus WebView2 aggregate resident memory **≤150 MiB**.
- Keep 44px targets, visible focus, reduced motion and IME/keyCode229 guards.
- Preserve original account owner, records, source property IDs and Yjs document bytes. Do not delete/recreate accounts or change identity-linking policy to bypass setup.
- No actual task content, account emails, exports, credentials or original signature image in Git, tests or screenshots. Fixtures only. Private files and unsigned historical delivery bundles must not be packaged.
- Use short UI labels, no explanatory helper paragraphs, fewer controls/clicks. Product name: **Kimpor Workspace**. Public A monogram derives from the supplied signature; keep the original image private.

## What is already implemented and pushed

UI source commit: **`7e713e1fcf30e3dcacf639f5450e968d6f682fbe`**. This handover commit also includes non-UI helper/configuration changes described below.

- `9702f62`: persistent account entry; six-digit email SDK verification, same-window Google start, invisible cache/outbox, safe guest adoption after pulling the account. Existing sync engine retained.
- `1d1078c`: task-name-first Today/projects, optional quick-add Details, five project types, presentation mapping of imported databases without source rewrites.
- `c6d5efc`: responsive shell, clean writing, keyboard-aware toolbar, Journal and Calendar redesign.
- `10aea20`: expanded viewport/auth tests, motion, editor readiness/formatting request handling, ephemeral default project views, release-readiness guards.
- `ec3984e`, `ad87039`, `7e713e1`: narrow Calendar title correction, settled screenshot waits, Settings backup controls simplified, remaining local-first copy removed, provider checklist and native limits recorded.

Layouts use root container width: <600 phone; 600–1023 tablet; ≥1024 desktop. Phone tabs: Today, Projects, Calendar, Notes, Journal. Tablet sidebar is 72px with optional expansion; desktop 240px. Portrait single pane; wide list/detail. Writing has title/body, compact five-control keyboard row, collapsed Details and no Saved/status/breadcrumb clutter. Desktop uses slash/selection controls. Journal uses Write/Continue and History; Calendar has one view selector and no daily plus buttons. Task names lead Today/projects/Calendar/search.

Target profiles include iPhone 15 393×852; iPad 820×1180 and 1180×820 plus splits; Windows 1366×768 and 1920×1080 with 150% scaling; prior 1980×1080/1200 request too. Browser emulation is not physical verification.

The original migrated account contains four databases and 62 task documents. Read-only private comparisons at 07:52 UTC confirmed all 69 pages, four schemas and 62 body byte sequences unchanged. Public aggregate: `docs/evidence/account-redesign-final-integrity.json`. Type mapping is presentation only (two weekly-report and two rework defaults); do not rewrite source schemas to force a view.

## Immediate priority: real CI editor persistence failure

**Fix this before approving a release or describing writing as complete.**

Actual CI run: https://github.com/KangKimpor/kimpor-workspace/actions/runs/38231262045
Source: `7e713e1`. Playwright report: **138 cases: 136 expected passes, one flaky, one unexpected failure**.

Both problematic cases are `writing uses compact or selection controls and preserves the body` in `tests/responsive-matrix.spec.ts`:

- `windows1920-dark`: fails initially and on retry.
- `windows1920-light`: fails initially, passes retry.
- At line 45, after navigating away, returning to Notes and reopening the note, `Document editor` is empty instead of containing the fixture's multilingual body.

This is a potential persistence/initialization regression, not permission to remove the assertion or increase retries. The earlier full local run passed 137/138 plus a Settings fade rerun; that does **not** override this newer CI evidence. Auth and visual comparison steps were skipped after this failure.

Reproduce:

```sh
pnpm exec playwright test tests/responsive-matrix.spec.ts --grep 'writing uses' --project windows1920-light --project windows1920-dark
```

Inspect `apps/web/src/RichTextEditor.tsx`, `editor-lifecycle.ts`, `WorkspaceApp.tsx` and store/Yjs session initialization. Existing editor handling deliberately starts `editable:false`, enables it after TipTap `onCreate`, hides the view until ready, and queues formatting requests in the parent so they survive protection remounts. `useEditor` does not reliably update editable from changing options with the same document dependency. Preserve encryption, navigation flushes and owner checks while fixing the underlying race. Investigate before choosing a fix.

Browser evidence artifact **11738533073** (`browser-evidence`, 5,470,580 bytes) contains the report and traces. Download from the run page or:

```sh
gh run download 38231262045 -R KangKimpor/kimpor-workspace -n browser-evidence -D ../kimpor-ci-browser
```

The cloud copy is `/workspace/veloradesk-validation/handover-browser-evidence/`. Keep downloaded browser reports outside the repository: their bundled viewer JavaScript would otherwise be picked up by ESLint. Never commit traces containing real data; these are disposable fixtures.

## Visual baselines: captured, NOT yet approved or installed

Successful final-source candidate:
https://github.com/KangKimpor/kimpor-workspace/actions/runs/38231262270

- Source `7e713e1`.
- Artifact **11738374195**, `visual-baseline-candidate`, **66,803,700 bytes**.
- Matrix: **15 screens ×17 profiles ×2 themes =510 screenshots**, 30 contact sheets.
- Download, verify ZIP integrity/provenance, inspect `visual-baselines/source.json`, review all contacts and individual target screenshots, then copy approved PNGs/source.json into `docs/visual-baselines/`.
- Committed baselines are still the historical **312 captures/source `5384f41`**. Current comparisons will not pass until genuinely reviewed replacements are committed.

```sh
gh run download 38231262270 -R KangKimpor/kimpor-workspace -n visual-baseline-candidate -D .private/ci-baseline
```

The first candidate (38223471702/source10aea20) was reviewed and rejected: 320px Calendar title wrapped and some WebKit captures retained old tab tint or blank/unsettled rows. Corrected screenshots wait for selected-day event visibility and 350ms settled paint. The corrected source has a 22px narrow Calendar title. Candidate38230551152/sourcead87039 also succeeded, but final7e713e1 removes more old study copy. **Review the final candidate, not the rejected one.**

If the editor fix changes captured UI, record another actual CI candidate after that fix; do not silently reuse incompatible baselines. Run `pnpm check` before the baseline phase commit, push to main, then require actual full CI including pixel comparisons. Keep the threshold unchanged.

Artifact storage is limited to the free 500 MB allowance; last active aggregate was about433 MB. Archive a redundant artifact locally, verify exact source/ID, SHA-256 and ZIP CRC before deleting its remote copy. Record an aggregate receipt. Do not delete the only current candidate or other repositories' artifacts. The earlier verified archive receipt is `docs/evidence/account-redesign-artifact-archives.json`.

## Windows remains blocked

Latest source7e run:
https://github.com/KangKimpor/kimpor-workspace/actions/runs/38231262067 — failed at installed-app smoke checks; inspect its artifact for exact current measurements.

Measured source10aea20 run38223202981 passes rendered workspace, multilingual note restart, callback forwarding, normal exit and uninstall. **399,253,504 resident bytes** exceeds **157,286,400 bytes (150 MiB)**; idle CPU0%. Receipt: `docs/evidence/account-redesign-windows.json`. Earlier apparent low-memory passes preceded the stronger rendered-app check and are not current acceptance evidence.

Main native builds are explicit development fixtures. Tagged native releases require verified production account configuration. Do not change the memory calculation to only the Rust host/private bytes, trim memory artificially, suppress the failure, or tag v1. Native profiling and real hardware verification remain necessary. Typing16ms and N→N+1 updater acceptance are also unverified/not met.

## Account/provider setup remains incomplete

Supabase project: **`nlcpjdokfvawlpzyfytx`**.
Google Cloud project: **`kimpor-workspace-auth`**.

Google project and External audience were created free, but browser automation did not finish saving Branding or create a Web OAuth client. Signing into dashboards does not configure providers. Last verified provider audit: Google disabled, no custom SMTP, link-based templates; OTP length6/expiry600 already set. Receipt: `docs/evidence/account-auth-readiness.json` (all live-readiness flags false).

Read `docs/ACCOUNT-SETUP.md` for exact steps:

1. Finish Google Branding, create Web client, origin `https://kangkimpor.github.io`, callback `https://nlcpjdokfvawlpzyfytx.supabase.co/auth/v1/callback`. Save ID/secret directly in Supabase Google provider.
2. Brevo FREE: 300 emails/day, verified sender, SMTP key. Supabase host `smtp-relay.brevo.com`, port587, dashboard SMTP login/key, verified sender/name Kimpor Workspace. No paid upgrade.
3. Confirmation and magic-link bodies **only `{{ .Token }}`**, six digits,600-second expiry. Email send frequency30 seconds to match the app's resend countdown. `configureAuth` now refuses default SMTP, writes token-only templates and verifies saved values without changing Google identity settings.
4. Prove actual code delivery and Google consent with the same original account email. Privately compare ownerID and imported bytes. Do not use admin-generated sessions or fixtures as linking/delivery proof.
5. Update the readiness receipt only after verification; set GitHub repository variable `KIMPOR_AUTH_READY=true`, then dispatch Web preview. The old connector token could not manage repository variables (403); a local owner login may.

The user had signed into Google/GitHub and requested Brevo secure sign-in. TinyFish browser profile was `prof_0fb8dd42c28245e0`; browser included credit was exhausted (negative balance, no auto-reload). **Do not buy a top-up**. Plugin Management found no direct Google OAuth/Brevo setup connector. A local authenticated browser and local owner credentials are the practical next route. Old secure handoff URLs and scoped Supabase management token have expired; obtain fresh secrets securely, not in chat/Git.

## Live deployment and checks

Live site: https://kangkimpor.github.io/kimpor-workspace/ — still the previous working UI. New account-required UI publishing is intentionally held to avoid locking out users before provider setup. No tagged release or completed v1 is claimed.

- `pnpm check`: latest source/helper checks pass:73 core tests,88.91% core line coverage,44 semantic contrast pairs,~219.8KiB initial gzip, all graphs≤250KiB.
- Local auth fixtures18/18 pass; these do not prove live delivery/consent.
- Final Settings cleanup: desktop/phone accessibility both themes passes (two tests).
- CodeQL7e713e1 run38231262239 succeeds.
- Actual full CI7e713e1 remains failing on the persistence case described above.
- Physical iPhone/iPad/Windows, keyboard IME, VoiceOver/Narrator, Pencil, real email/Google/nativeOAuth and updater remain unverified.

The handover commit includes a CI timeout allocation increase from25 to45 minutes for138 app cases,18 auth cases and510 comparisons; every assertion, contrast/bundle/pixel/memory gate remains unchanged. It also includes the verified Management API `smtp_max_frequency:30` setting and its test. Fresh Actions runs after this commit should be assessed separately from the source7e evidence.

## Suggested next-session sequence

1. Pull main, read the required docs, plan, reproduce and fix desktop body persistence; verify save/reopen/reload/protection without weakening assertions.
2. Review the final actual baseline artifact; recapture if the fix changes UI. Install genuinely approved baselines and record provenance/review evidence.
3. Run `pnpm check`, commit/push the phase; require full source-specific CI (138 app +18 auth +510 comparisons), preserving budgets.
4. Complete Google/Brevo/Supabase securely using the local logged-in browser; prove same-owner linking and real email delivery; preserve imported data.
5. Profile the native resident-memory failure and perform physical acceptance. Do not present Windows/v1 as finished while gates fail.
6. Publish only when real account readiness and required checks pass; update README/CLAUDE/verification with actual run IDs and remaining limits.

No private cloud credentials, exports or original logo image are included in this handover. Do not assume `.private/` contents or cloud execution sessions are available locally.
