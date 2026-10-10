# Resume VeloraDesk Phase 0

This file supersedes the incoming handoff, preserved in
[docs/archive/2026-10-10-incoming-takeover.md](docs/archive/2026-10-10-incoming-takeover.md).
Read [CLAUDE.md](CLAUDE.md), [the report](docs/PHASE-0-REPORT.md), and the original
[BUILD-PROMPT.md](BUILD-PROMPT.md). Do not restart feasibility or ask for accepted decisions.

The source is restored, dependencies repaired, gallery/editor functional,
signature-derived public assets generated, contracts/tests/scripts and Tauri/CI
scaffolds authored. See the verification ledger for actual checks and limits.
Full signature source and updater private material stay in ignored directories;
a public source export intentionally omits both.

The next independent gate is remote access: `gh repo view KangKimpor/veloradesk`.
Creating the repo failed with integration permission 403; user was asked to create
an empty public repo and grant selected-repository access. There is no remote URL
or installer to verify yet. Do not treat a pending user request as completed.

When access exists:

1. Push the minimal main bootstrap and `feat/phase-zero-foundation` commits; open a
   reviewable PR and add `build-desktop`. Use the checked-in workflows, standard
   free public runners and short artifact retention.
2. Upload updater key/password from ignored secrets/ to `TAURI_SIGNING_PRIVATE_KEY`
   and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` without printing them. Confirm backup.
3. Run Quality and Windows installer jobs; fix actual failures. Native smoke must
   install per-user, find the window, register/forward the callback and exit cleanly.
4. Protect main using actual successful check names, enable Pages source Actions,
   merge after checks pass, and confirm direct gallery/editor URLs and cached
   offline reload under `/veloradesk/`. If Vercel becomes callable, verify Hobby
   before deploying the configured project. No paid trials.
5. Record real PR/run/preview/artifact links in the report and setup checklist.
   Ask user to install on iPhone/iPad and Windows using DEVICE-TEST.md.
6. Stop and report Phase 0. Device, live OAuth, full editor dragging and cloud sync
   are explicit open gates. Do not start Today/Calendar/Notes/Journal product work.

Use regular small Conventional Commits. No secrets, private sources or personal
backups in artifacts or git. Do not claim workflow files as successful CI, a
prepared URL as a deployed preview, or a generated key as live signed updates.
