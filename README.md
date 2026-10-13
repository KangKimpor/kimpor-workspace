# Kimpor Workspace

An account workspace for tasks, projects, calendars, notes and journals.

[Open Kimpor Workspace](https://kangkimpor.github.io/kimpor-workspace/).
The redesigned account screen is published from `4fc8726`; final-source Quality
CI passes 138 app cases, 18 account fixtures and 510 visual comparisons.
The Supabase Free account holds the workspace. IndexedDB is an invisible cache
and outbox; the existing HLC and Yjs engine synchronizes changes.

Version 0.0.1 is a development candidate. Windows memory and typing budgets,
physical verification and signed updater acceptance remain open. See
[verification](docs/VERIFICATION.md) for evidence and limits.

## Run

Use Node 24 and pnpm 11.19.0:

```sh
pnpm install --frozen-lockfile
pnpm hooks:install
pnpm dev
```

Production requires `VITE_SUPABASE_URL` and a publishable key. An unconfigured
build is reserved for development and fixture tests. `KIMPOR_CLOUD_READY=false`
is a development/test deployment flag and has no interface control.

## Accounts

The entry screen supports Google and six-digit email codes. Sessions persist;
Sign out is in Settings. First sign-in adopts existing cache additions after
pulling the account, preserving account metadata and merging compatible Yjs text.
Email codes require a verified custom SMTP sender. Google requires an OAuth web
client. Real code-only email delivery and Google sign-in to the original account
were verified on 2026-10-13 without changing imported records or document bytes.
Google's consent app is still in Testing and supports the configured owner only.
Secrets stay in provider configuration and GitHub secrets.

## Features

- Tasks and projects; pages, folders, favorites, search and shared rich text.
- Calendar views, recurrence, time zones, reminders and ICS import/export.
- Notes, journals, sketches, document encryption and recovery keys.
- Databases with table, list, board, calendar and gallery views.
- ZIP backup/restore and Markdown, JSON, CSV and Notion ZIP import/export.
- Supabase Auth/sync, private attachments and calendar provider adapters.

Encryption protects document bodies and file keys. Titles, dates, tags and other
metadata remain visible to the server. App lock hides the interface.

## Verify

```sh
pnpm check
pnpm run licenses
pnpm licenses:deno
pnpm licenses:cargo
bash scripts/sql-test.sh
pnpm exec playwright install --with-deps chromium webkit firefox
pnpm e2e
pnpm e2e:auth
```

The pixel comparison limit is 0.1%. Initial and additional JavaScript graphs
must each stay under 250 KiB gzip. Contrast and the 150 MiB Windows resident-memory
gate remain unchanged. Capture provenance must come from the actual CI runner.

## Install and deploy

Safari: Share → Add to Home Screen. Windows uses the Tauri package.
`pnpm build:desktop` builds embedded assets; installers are currently unsigned.
Main publishes through free GitHub Actions and GitHub Pages after passing CI
and verified account readiness. The redesigned sign-in passed live account checks;
final-source visual CI and deployment remain pending. The live site currently
uses the previous UI.
See [remaining secure setup](docs/ACCOUNT-SETUP.md).

[Setup](docs/SETUP-CHECKLIST.md) · [free plans](docs/FREE-TIER.md) ·
[platforms](docs/PLATFORM-DIFFERENCES.md) · [working memory](CLAUDE.md) ·
[redesign phases](docs/ACCOUNT-FIRST-REDESIGN.md).

The public A monogram derives from the handwritten signature. The original
signature remains private. MIT licensed; see [notices](THIRD-PARTY-NOTICES.md).
