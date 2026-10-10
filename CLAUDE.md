# VeloraDesk working memory

Updated 2026-10-10 (UTC). Read TAKEOVER.md and docs/PHASE-0-REPORT.md for open gates.
Current phase: **Phase 0 foundation; local implementation, remote exit gates pending**.
Do not implement Phase 1 until the user says “continue” after the Phase 0 report.

## User decisions

- VeloraDesk, public MIT repo `KangKimpor/veloradesk`, unsigned Windows installer.
- “Find ways around it” already authorizes current free plans, local-first operation,
  optional Supabase, quota limits, exports and portable hosting. Do not re-ask.
- Actual signature JPEG was supplied. Full source and intermediate outline traces
  are private in ignored `brand/source/`. Public app uses derived monogram A.
- No subscription, paid trial, card signup or paid signing is required. Current
  vendor allowances do not guarantee forever availability or unlimited storage.
- Finish Phase 0, report tested behavior and gaps, then stop at the phase boundary.

## Commands

Node 24, pnpm 11.19.0; exact package versions and pnpm-lock.yaml are committed.
`pnpm install --frozen-lockfile`; `pnpm brand:build`; `pnpm dev`.
`pnpm check` runs lint, typecheck, ten core tests with scoped coverage, web build,
then gzip budgets. `pnpm run licenses` audits installed transitive dependencies.
**Use `run licenses`: bare `pnpm licenses` is a pnpm built-in command.**
`pnpm e2e`; `pnpm shots` needs a preview server on 4173. Browser install:
`pnpm exec playwright install --with-deps chromium webkit firefox`.
`pnpm build:desktop` produces assets without a service worker. On Windows with
Rust 1.99.0/Visual Studio C++ tools, `pnpm --filter @veloradesk/desktop build`.

## Map and conventions

- apps/web: responsive gallery `/design`, lazy `/spikes/editor`, PWA assets.
- apps/desktop/src-tauri: native frame, NSIS currentUser, scoped capabilities,
  single instance, deep link, theme/window state and provisioned updater public key.
- packages/ui: semantic light/dark tokens, generated BrandMark, Pressable.
- packages/core: HLC/field merge, quota/callback contracts, platform adapter,
  Dexie transactional Yjs study persistence. Integrations package is an interface.
- scripts: tracing, deterministic brand exports, capture matrix, budgets/licenses,
  Pages packaging and Windows smoke checks. ADRs explain go decisions and gates.
- All UI buttons use Pressable; all CSS colors live in tokens.css. Touch targets
  44px. Safe areas use env(). Use currentColor, reduced motion and explicit focus.
- Native APIs stay behind packages/core/src/platform.ts. Desktop registers no SW.
  BASE_PATH prefixes navigation/assets/manifest/SW for subpath hosting.
- Gitignore private sources, .env, keys, personal data, generated test results.
  Never commit private updater key/password or private/full signature traces.

## Evidence boundaries and gotchas

Tests/coverage are listed in docs/VERIFICATION.md. Scoped core contract coverage
is not whole-app coverage. Same-origin tab communication and disconnected Yjs
simulations are not cloud sync. Synthetic composing key events are not native IME.
Separate draggable rows are not full editor-block dragging. Physical iPhone/iPad
and Windows installation/performance are still user checks.

WebKit lost inherited dark text after container-query layout. Resolve saved theme
before React mounts; body/app/main-shell explicitly set semantic color. Screenshot
capture checks and regression tests cover the affected portrait/landscape widths.
Radix sheets restore focus to a saved opener; motion buttons retain event handlers.
TipTap slash Heading uses setHeading, not toggle, after removing the slash.
Import core subpaths to keep editor/Dexie/Yjs out of initial JS. Fontsource is
self-hosted via its explicit Latin variable woff2 file, not nonexistent latin.css.

This rootless environment needed official Debian browser libraries placed inside
Playwright MiniBrowser's own lib directories. Local runs use
`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`; all three real browser engines
launch. CI installs ordinary system dependencies with `--with-deps`.
Rust was installed under ~/.cargo/bin; Cargo.lock is generated. Native Windows
build/installer/CI remain unrun until the repository is accessible.

## Remote gates

GitHub CLI identifies KangKimpor, but both GraphQL and REST repo creation returned
403 “Resource not accessible by integration”. No origin, remote PR, successful CI,
installer artifact or deployed preview is claimed. User was asked once to create
an empty public repo and allow the connection access. Continue local work while
waiting; then push main bootstrap + feature branch, open PR, run CI and Windows
smoke, protect main, enable Pages, merge only after checks pass.

Vercel is installed as a plugin but this session exposes no callable deploy tool
or credential; do not invent a deployment. Supabase is not callable in this
session; unrelated existing cloud projects have never been modified. Preferred
host remains Vercel Hobby. GitHub Pages is the prepared free portable fallback.
Updater private material exists only locally in ignored secrets/; upload repository
secrets when access is available and arrange the user's separate backup.

## Visual and performance gates

Lighthouse desktop budget assertions pass locally. Visual baselines must be recorded on the actual GitHub runner: apply record-visual-baseline to the foundation PR (or dispatch Visual baselines once it exists on main), inspect its artifact, commit docs/visual-baselines, remove label and rerun Quality. visual:check intentionally fails if no approved baseline exists; do not skip it to claim Phase 0 passed. Scripts and the Windows target license audit are implemented.
