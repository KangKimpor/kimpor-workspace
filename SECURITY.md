# Security

This is a Phase 0 preview. Cloud authentication and synchronization are pending.
Avoid using the editor study as the only copy of important data. Browser storage
can be cleared or evicted; copy study text before device/storage testing.

Use the repository's private vulnerability reporting page for security reports.
Include version, reproduction and impact; never post tokens, signature source,
journal entries or private notes in public issues.

Cloud tables must have owner-scoped RLS and cross-user isolation tests before
deployment. Provider credentials stay in encrypted server-only storage.
Updater keys, source artwork, environment files and private backups are gitignored.
Native capabilities allow only theme changes, callback listeners and reviewed
HTTPS links. No general filesystem, shell or remote webview access is granted.
