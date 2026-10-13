# Releases

Each main push runs Quality and the Windows installer workflow. Run the local
checks, inspect screenshot evidence and record remaining gaps. The current
human approved PR #7 publication, PR #8 merge/follow-up publication and, on
2026-10-13, a 450 MiB aggregate idle
RAM cap after profiling found 324 MiB in a minimal same-host fixture. Historical
handover approvals are context, not new authority for credentials or access.

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
blocked. Historical runs exceeded the former 150 MiB gate. The current approved
cap is 450 MiB (471,859,200 bytes), measured across the Tauri host and every
descendant WebView2 process. The collection must contain both host and WebView2;
the process-tree fixture verifies nested descendants and excludes unrelated
WebView2 processes. Merged source `1438595` run `38344354265` passes at
386.8 MiB aggregate resident memory, 258 ms window startup and 0% sampled idle
CPU, including functional install/restart/exit/uninstall checks. Startup and CPU
caps stay 2 seconds / 2 percent. A tag requires the private
Tauri updater signing key/password in repository secrets, enables signed update
artifacts and publishes the installer, signature, SHA256SUMS.txt and latest.json.
Only the public updater key belongs in source. Authenticode signing is separate;
the initial installer is unsigned.

Tag a tested main commit only after its release gates pass. The checked-in default
version remains 0.0.1; the tag workflow overrides it. Public release v0.0.4 is
published from cebe846 with a signed updater, installer, signature, checksums and
the repaired dot-normalized asset URLs. The owner reports successful production
update/restart and retained notes/session; final main 9ac0972 Windows CI passes.
See VERIFICATION.md for the exact automated and reported evidence. Authenticode
remains unsigned, and there is no verified v1.0.0 release. Native compilation does not prove
the installer or N→N+1 updater works. The live cloud and physical device checklist
remain separate requirements; see VERIFICATION.md and DEVICE-TEST.md.

Web preview deploys after main's CI passes. Pages uses
BASE_PATH=/kimpor-workspace/; Vercel uses apps/web as its project root and its
checked-in vercel.json. See SETUP-CHECKLIST.md for account access and configuration.

Browser evidence retains for one day and installer artifacts for seven days.
Release assets are persistent public downloads. Private backups and original
signature files must never enter public source or artifacts. Use standard free
runners and free plans; no paid signing or larger paid runner is required.
