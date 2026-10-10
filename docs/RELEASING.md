# Releases

Create a PR with Conventional Commits and require Quality before squash merge.
Add build-desktop to exercise the standard Windows runner's install/window/
single-instance/exit smoke checks. Review screenshots and record gaps.

First provision visual baselines: add record-visual-baseline to the foundation PR,
inspect the Visual baselines artifact's contact sheets/full captures, and commit
the approved docs/visual-baselines directory. Remove the label, rerun Quality and
require its visual comparison before merging. Missing baselines deliberately fail
the gate. Do not regenerate them automatically to hide an unreviewed UI change.

Tag a tested reviewed main commit (initially v0.0.1). The desktop workflow builds
using Cargo.lock, checks the 20 MiB budget and SHA256, and publishes a prerelease.
Web preview deploys after main's CI passes. Pages uses BASE_PATH=/veloradesk/;
Vercel uses the setup checklist. No larger paid runner or paid signing is used.

Updater signing is separate from Authenticode. Back up the gitignored private
key/password and upload them as repository secrets; only its public key is in
config. createUpdaterArtifacts is false in Phase 0. Phase 1 must add signed
artifacts/latest.json and test N → N+1 with unsynced-change protection.
Never call this scaffold self-updating until that passes.

Artifacts retain browser evidence 1 day and installer 7 days. Release assets
are persistent public downloads. Never put private backups in public artifacts.
