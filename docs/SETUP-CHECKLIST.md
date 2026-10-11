# Setup and release gates

Updated 2026-10-11. All phases and direct main pushes are authorized. The source,
brand, workflows and local verification are prepared. This checklist records
configuration that cannot be completed without connected account access or hardware;
it does not reintroduce approval stops.

1. **Repository access.** The intended target is public MIT
   `KangKimpor/kimpor-workspace`. Completed October 11: the user saved secure browser
   sign-in, TinyFish created the empty public repository, and verified local source
   was pushed directly to main. The CLI integration confirms admin/push access.
   Origin is configured; never overwrite unrelated history.

2. **Real CI baseline.** Completed: run 38105170530 captured 312 images from the
   actual GitHub runner. All 26 contact sheets were reviewed; the exact artifact
   and source.json are committed in docs/visual-baselines. Provenance and archive
   checksum are in docs/evidence/ci-baseline-review.json. Quality includes the 0.1%
   pixel gate. Runs 38121052501 and 38122879255 pass all 68 browser cases and
   all 312 comparisons. A settled Calendar tab image has separate review/provenance.
   Windows installer runs on main using a standard free hosted runner. Check both
   actual runs and the installer smoke evidence. Keep artifact retention short;
   verify account storage budgets. No branch/PR requirement is imposed here.

3. **Static hosting.** Vercel → personal Hobby team → Add New → Project → import
   KangKimpor/kimpor-workspace → root apps/web → Vite → dist → production main. The
   checked-in vercel.json supplies install/build commands, routing and headers.
   Use the free vercel.app domain, no Pro trial or paid analytics/services. No
   deployment credential is connected. Alternative: GitHub → Settings → Pages →
   Source GitHub Actions, then run Web preview after Quality passes. Pages source
   is configured and Web preview run 38105256978 deployed successfully.
   https://kangkimpor.github.io/kimpor-workspace/ returns HTTP 200. Public Chromium
   and WebKit checks pass direct routes, the manifest, service-worker control and
   controlled offline editing/reload; see docs/evidence/pages-public.json.
   Sites was also inspected: native publishing tools exist, but the required
   site-workflow.mjs source/packaging helper is absent in this runtime. A working
   Sites runtime could host the static app without changing its local data model.

4. **Dedicated Supabase Free project.** Deployed and verified: kimpor-workspace
   (nlcpjdokfvawlpzyfytx), Singapore, Free/NANO, no card. Ten migrations, eight Edge
   functions, owner RLS, private encrypted attachments and maintenance cron pass
   actual live checks. Public URL/key variables configure Pages and native builds
   by default; explicit KIMPOR_CLOUD_READY=false disables cloud. Direct HTTPS
   deployment succeeded with a valid private PAT. Repair the separately saved
   GitHub SUPABASE_ACCESS_TOKEN before relying on later deployment jobs.

5. **Sign-in.** Production web/new-native/legacy-native redirects are saved;
   confirmation stays on and anonymous sign-in off. Default free email supports
   links and is restricted to project-team addresses. The requested migration
   owner received a sign-in email and its account is confirmed. General-public
   delivery needs a suitable sender. Google sign-in remains hidden until its
   provider credentials are configured. Native PKCE and six-digit custom-template
   delivery still require separate validation.

6. **Calendar accounts.** Google Cloud → APIs & Services → Library → Calendar API
   → Enable; Google Auth Platform → Audience → appropriate In production status;
   create a separate Calendar client and its actual Edge callback. Put secrets
   only in Edge settings. Google sensitive-scope review may still be required.
   Microsoft Entra → App registrations → web callback and Calendar permission
   for optional Outlook; iCloud account → Sign-In and Security → app-specific
   password for CalDAV. Explicitly configure trusted subscription/CalDAV hosts.
   Connect accounts through the app; test read/edit/etag/reconnect/disconnect and
   Google refresh-token survival after seven days. Outlook recurring writes remain
   a documented limitation. No provider account is connected here.

7. **Cloud schedules and quotas.** Enable pg_cron/pg_net, set Vault maintenance URL
   and secret, and verify the actual 15-minute job. Generate VAPID keys for optional
   push, request notification permission from installed apps, and verify receipt
   with the app closed. Configure GitHub health/backup secrets listed in the backend
   README. Export, encrypt, download, decrypt and import a real backup. Keep its key
   separately. Review database/storage/egress/Edge/Realtime usage in the provider
   dashboard; only storage meters are implemented in the app.

8. **Updater secrets.** The ignored local updater private key/password were
   generated in the earlier takeover. Preserve their separate private backup.
   GitHub → Settings → Secrets and variables → Actions → add
   TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PASSWORD without printing
   them. Public key is in tauri.conf.json. Native desktop workflow produces signed
   update packages/feed on semantic-version tags; Authenticode remains unsigned.
   Perform actual installed N→N+1 save/consent/signature tests before release.

9. **Physical device checks.** Connect Windows/iPhone/iPad hardware and complete
   docs/DEVICE-TEST.md with dates/OS/results. Desktop Commander currently reports
   no devices. Check NSIS install/uninstall, tray/hotkey/notifications, 125/150/200%
   scaling, native IME, VoiceOver/Narrator, iPad Pencil/touch/selection/Split View,
   Safari tab/Home Screen storage and safe areas. Emulation does not fill this gate.

10. **Signing and v1.0.0.** Optional SignPath Foundation requires a public repository,
    MFA, verified build provenance and reputation review. It cannot be applied for
    through this session's current access; a new project may be declined. Do not
    purchase a certificate or use paid developer enrollment. Ship unsigned if needed.
    Only tag v1.0.0 after the real CI/native/live cloud/device gates pass and the
    documented feature gaps are accepted. Manual tags use the desktop release
    workflow; Release Please automation is deferred under the direct-main preference.

No npm scope registration/publishing or paid account is needed. Local editing and
Settings → Export full ZIP remain available while external configuration is missing.
