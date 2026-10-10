# Setup checklist

Updated 2026-10-10. Defaults/free-service workarounds are already accepted. The
signature is supplied and traced; no repeated onboarding questions are needed.
Phase 0 runs locally without cloud credentials. Future account steps are marked.

1. **Unblock the repository.** This session's GitHub integration cannot create
   repositories (403). Visit https://github.com/new → owner KangKimpor → name
   `veloradesk` → Public; leave README, .gitignore and license unchecked → Create
   repository. In the connected GitHub app's selected-repository access, include
   veloradesk if necessary. Reply “created”; the prepared branch can then be pushed.

2. **CI and Pages.** After push, repository → Pull requests → the foundation PR;
   labels `build-desktop` and `record-visual-baseline`. The builder reviews and
   commits the CI baseline candidate; remove its label and rerun Quality. Missing
   baselines intentionally fail. Quality and Windows installer must pass. Settings →
   Actions → General: standard hosted runners, short retention. Settings → Pages →
   Source → GitHub Actions. Enable the checked-in Web preview workflow. The
   expected Pages origin is `https://kangkimpor.github.io/veloradesk/`; it is **not
   deployed yet**. Direct routes are `design/` and `spikes/editor/`. Settings →
   Rules → Rulesets (or Branches): require a PR and the actual successful Quality
   check for main. Account → Settings → Billing and licensing → Budgets and alerts:
   verify storage/cache allowances and prevent paid overage. Public standard runner
   minutes are free; artifact storage still has limits.

3. **Preferred Vercel hosting, optional fallback from Pages.** Confirm personal
   Hobby plan (no Pro trial), then Add New → Project → Import
   `KangKimpor/veloradesk` → root `apps/web`, framework Vite, output `dist`.
   Use the install/build commands in `apps/web/vercel.json`; production branch
   main, free `*.vercel.app` domain, Analytics/Speed Insights disabled. This session
   lacks deployment credentials. Changing host origin changes browser local data.

4. **Updater backup and secrets.** Key pair already generated; private material
   stays in ignored `secrets/tauri-updater.key` and separate password file. Back
   them up separately in encrypted/password-manager storage before losing this
   workspace. Public key is in tauri.conf.json. Repository → Settings → Secrets
   and variables → Actions → New repository secret: `TAURI_SIGNING_PRIVATE_KEY`
   and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Upload without printing private
   values. Update artifacts/latest.json and actual N→N+1 verification are Phase 1;
   initial installer stays unsigned. Updater signing is not Windows Authenticode.

5. **Install the real preview/installer.** Once their actual URLs exist, open on
   Safari → Share → Add to Home Screen, keep “Open as Web App” on where shown.
   Download CI's x64 NSIS artifact, check SHA256, install and launch on Windows.
   Fill `docs/DEVICE-TEST.md` with date/OS and results. No installer exists yet.

6. **Supabase, Phase 1.** Dashboard → organization → New project → name
   `veloradesk`, nearby region, Free plan; save database password in password manager.
   Stay within two active Free projects; never migrate unrelated existing data.
   Project → Connect / Settings → API: copy URL and publishable key into ignored
   `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`). These are
   optional now. Do not put service-role/secret keys in client variables. Local
   SQL and RLS isolation tests must pass before applying live migrations.

7. **Auth, Phase 1.** Supabase → Authentication → Sign In / Providers → Google.
   Google console → project selector → New Project → VeloraDesk → Google Auth
   Platform → Branding, Audience and Data Access → External → In production when
   setup is complete. Clients → Create client → Web application. Add redirect
   `https://<actual-project-ref>.supabase.co/auth/v1/callback`; put client ID/secret
   in Supabase's provider settings only. Authentication → Email templates: show
   `{{ .Token }}` for a six-digit code. URL Configuration: allow actual production
   and approved previews plus the tested desktop `veloradesk://auth/callback`
   return. Complete PKCE/state replay validation before live Windows OAuth.
   Settings → SMTP: verify an actual free no-card sender and delivery limits.
   Provider signup/plan/email behavior remains unverified; never promise it.

8. **Calendar, Phase 2.** Google APIs & Services → Library → Google Calendar API →
   Enable. Separate provider authorization from identity sign-in. Add the actual
   Edge Function callback after implementing the integration ADR; store Calendar
   client secret only server-side. Verify production consent and unverified-user
   limits. No paid API/billing attachment is needed for standard Calendar usage.

9. **Deployment credentials, when needed.** Supabase deployment access token and
   DB password go in a restricted GitHub environment; least privilege and branch
   restrictions. Backups need a separate private/encrypted destination and scoped
   credentials in Phase 2. Never upload personal data to this public app repository.
   iCloud passwords/Outlook consent/free code-signing application are Phase 3.

No npm scope registration/publishing is required for private workspace packages.
All future account steps remain pending until performed against the actual account.
