---
name: kimpor-workspace-project
description: Develop, test, and maintain the local-first Kimpor Workspace workspace.
---

# Kimpor Workspace project skill (draft)

Read CLAUDE.md for current authorization, architecture, and evidence gates. The user
authorized all phases and direct pushes to main on 2026-10-10. Do not reinstate
the original prompt's phase stops or PR requirements.

Use the unified Page model for pages, notes, journals, databases, and rows. Write
to the Dexie store before network calls. Never require cloud access for local
editing. Sync ordinary fields by HLC, rich text by Yjs, and encrypted documents
as immutable ciphertext updates. Keep each account's local and remote rows isolated.

All UI buttons use Pressable. Use semantic tokens, 44px targets, safe-area insets,
visible focus, and reduced motion. Gate shortcuts and slash actions during IME
composition, including keyCode 229. Put native APIs behind the platform adapter.
Web builds register a service worker; desktop builds never do.

Keep the full signature and updater private keys out of Git. Never log OAuth
tokens, provider secrets, recovery keys, passphrases, or private journal bodies.
Provider credentials remain encrypted on the server and have no client-read policy.

Install with `pnpm install --frozen-lockfile`. Run `pnpm check`, `pnpm run licenses`,
`pnpm licenses:cargo`, and the relevant Playwright tests. Use `pnpm build:desktop`
and `pnpm licenses:deno` for the corresponding assets and backend dependency audit.
Native Windows compilation and installer tests run on Windows.
The rootless local browser environment needs
`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`; CI installs regular browser libraries.

Before publication, run the history secret scan and review actual screenshots.
Never claim cloud OAuth, physical devices, signing, or updater delivery are verified
from a local browser simulation. Record remaining gates in docs/VERIFICATION.md
and the current phase report. Public v1.0.0 requires the release gates to pass.
