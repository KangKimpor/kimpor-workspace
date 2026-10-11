# Releases

The user authorized direct updates to main. Each push runs Quality and the Windows
installer workflow; no PR or repeated approval is required. Run the local checks,
inspect the screenshot evidence and record remaining gaps before pushing.

Provision the first visual baseline through Actions → Visual baselines → Run
workflow on main. Inspect the actual runner's captures and contact sheets, commit
the reviewed docs/visual-baselines artifact to main, then rerun Quality. Missing
baselines deliberately fail the gate. Do not replace them automatically to hide
an unreviewed UI change.

The Windows workflow builds from Cargo.lock, installs the per-user NSIS package,
checks rendered workspace and multilingual note restart through Windows UI Automation,
then the window, callback, single instance, normal exit, uninstall and budgets,
then uploads evidence and the size-checked installer candidate. A candidate is
retained even when the runtime memory gate fails; the job and tagged release remain
blocked. The first real Windows run passes functional checks but uses 251.6 MiB
combined resident memory against the project's 150 MiB gate. A tag requires the private
Tauri updater signing key/password in repository secrets, enables signed update
artifacts and publishes the installer, signature, SHA256SUMS.txt and latest.json.
Only the public updater key belongs in source. Authenticode signing is separate;
the initial installer is unsigned.

Tag a tested main commit only after its release gates pass. Version is currently
0.0.1 and there is no verified v1.0.0 release. Native compilation does not prove
the installer or N→N+1 updater works. The live cloud and physical device checklist
remain separate requirements; see VERIFICATION.md and DEVICE-TEST.md.

Web preview deploys after main's CI passes. Pages uses
BASE_PATH=/kimpor-workspace/; Vercel uses apps/web as its project root and its
checked-in vercel.json. See SETUP-CHECKLIST.md for account access and configuration.

Browser evidence retains for one day and installer artifacts for seven days.
Release assets are persistent public downloads. Private backups and original
signature files must never enter public source or artifacts. Use standard free
runners and free plans; no paid signing or larger paid runner is required.
