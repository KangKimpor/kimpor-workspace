# ADR 0007: Direct main updates and evidence-based releases

2026-10-10. The user explicitly requested all phases, all available user actions,
and direct pushes to main. This supersedes the original phase stops and PR-first
workflow. Implementation, verification and commits proceed without another
approval request. No unrelated repository or account is overwritten.

Publishing is authorized, but capabilities are separate: this GitHub integration
cannot create the intended repository (403), hosting/backend credentials are
unavailable, and no physical device is connected. Prepare concrete source,
workflows and evidence; record these blockers accurately and push when access
becomes available. Account permission failures are not user permission failures.
October 11 update: the user saved secure browser sign-in; TinyFish created the
public repository and configured Pages. Verified source is pushed directly to
main, and real CI/baseline/Windows jobs are running. Initial API create failures
are historical, while backend and physical-device gates remain separate.

Desktop tags generate installers, checksums and signed Tauri update feeds. The
release stays 0.0.1 until actual Quality/visual baseline/Windows installation,
live cloud and physical-device gates pass. No artificial v1.0.0 or successful CI
record is created. Release Please automation is deferred; manual tags use the
existing desktop release workflow and the user's direct-main preference.
