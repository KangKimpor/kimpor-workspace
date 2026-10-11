# ADR 0008: Kimpor Workspace

2026-10-11. The user chose **Kimpor Workspace** instead of the working name
VeloraDesk. Use `kimpor-workspace` for the intended public repository, deployment
path and download filenames. Windows displays Kimpor Workspace and its executable
is `KimporWorkspace.exe`. The selected signature-derived A mark remains in use.

Preserve existing IndexedDB databases, local settings, internal workspace package
names, export-format identifiers, encryption associated data and provider identity
hashes. Renaming those identifiers could orphan local work, prevent decryption or
duplicate synchronized records. They are compatibility details, not public branding.
The desktop bundle identifier also remains stable. New OAuth requests use
`kimpor-workspace://auth/callback`; the old `veloradesk` scheme is accepted with
the same strict state, expiry, host and parameter checks for older returns.

Historical reports and raw evidence keep their original names and timestamps.
Current screenshots, manifests, installer assets, notices and release workflows
use the new name. No deployment or successful remote push is inferred from this
rename; the integration still rejects creation of the intended repository.
