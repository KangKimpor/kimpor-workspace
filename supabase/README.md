# Optional cloud backend

Local editing needs no project, account or environment values. Ten reviewed
migrations and eight canonical Edge Functions are deployed to the dedicated
Free/NANO project kimpor-workspace (`nlcpjdokfvawlpzyfytx`, Singapore). All 18
public tables have RLS. Actual temporary Auth grants, push/pull, idempotency, owner
isolation, protected-body purge and private Storage checks pass; synthetic users
and files were removed. The 15-minute cron reached maintenance with HTTP 200.

Public GitHub URL/key variables and VAPID public material configure web/native
builds by default. Set `KIMPOR_CLOUD_READY=false` for an explicitly local-only build.
Default free email is restricted to project-team addresses and uses PKCE links.
Real email delivery, provider consent, closed-app push and user backups remain
separate gates; see the evidence ledger.

## Client and server configuration

Copy root `.env.example` to an ignored `.env.local` and set the public
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and optional
`VITE_VAPID_PUBLIC_KEY`. Vite only exposes public client configuration. Restart or
rebuild after changing it. Never expose service-role keys with a VITE prefix.

The following belong in Supabase Dashboard → Edge Functions → Secrets:

| Variable | Purpose |
| --- | --- |
| SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY | Built-in project variables; authenticated owner verification and service-only database access |
| ALLOWED_ORIGINS | Exact comma-separated web origins, approved previews and native origins `http://tauri.localhost,https://tauri.localhost,tauri://localhost`; no wildcard |
| CREDENTIAL_ENCRYPTION_KEY | Base64-encoded random 32-byte AES key; back up privately; provider credentials use owner-bound authenticated encryption |
| OAUTH_STATE_SECRET | Independent strong random secret signing one-time Calendar OAuth state |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | Calendar OAuth web client, separate from Supabase identity sign-in |
| OUTLOOK_CLIENT_ID / OUTLOOK_CLIENT_SECRET | Optional Microsoft web application credentials |
| CALENDAR_ALLOWED_HOSTS | Exact lowercase trusted HTTPS hostnames for non-Apple CalDAV and ICS; iCloud discovery permits its checked caldav hosts |
| MAINTENANCE_SECRET | Independent strong secret for maintenance and database keepalive |
| VAPID_SUBJECT / VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY | Optional Web Push sender identity and keys; public key also supplied to the client |
| BACKUP_SECRET / BACKUP_OWNER_ID | Independent backup secret and the one intended Auth user UUID; never accept an arbitrary owner from a backup request |

Use a password manager or private secret file to generate/store these values.
Do not print keys in workflow logs. Key rotation requires a planned provider
credential migration; replacing the AES key makes existing credentials unreadable.

## Deployment

Use a dedicated Free project. The configured GitHub Cloud deployment workflow
requires a complete `SUPABASE_ACCESS_TOKEN` (private sbp_ PAT) and targets only
`nlcpjdokfvawlpzyfytx`. The first browser-transferred value returned HTTP 401 and
was not usable. A replacement full private PAT was verified and used for the
actual deployment locally; the GitHub secret still needs repair. The workflow uses the Management HTTPS query API (experimental)
without a DB password. It checks project identity and the reviewed schema checksum,
applies all ten migrations atomically to an empty workspace, or verifies the
exact existing migration stamps without changing them. Partial/unknown histories
are refused. It configures six-digit Auth, saves new server keys in Supabase Vault
without rotating existing keys, and configures maintenance/VAPID. CLI 2.120.0
deploys canonical functions through the official API; live owner/Storage tests use
temporary confirmed QA users, send no mail and clean up their data. Reports never
contain private keys. Run `pnpm test:cloud` for deployment safety checks.

The browser PAT has a 24-hour expiry; renew it privately for later deployments.
For future incremental migrations use the CLI path with a privately stored DB
password, review the dry run, and update the reviewed manifest deliberately:

Equivalent CLI commands:

```sh
pnpm dlx supabase@2.120.0 link --project-ref YOUR_PROJECT_REF
pnpm dlx supabase@2.120.0 db push --dry-run
pnpm dlx supabase@2.120.0 db push
pnpm dlx supabase@2.120.0 functions deploy --import-map supabase/functions/deno.json
```

The user authorized this deployment when access becomes available. Confirm the
linked project identity; never apply this schema to an unrelated database.

`verify_jwt=false` is deliberate: owner endpoints validate bearer tokens against
Auth internally, Calendar callback checks signed one-time state, and maintenance,
backup and health require their own secret. Anonymous public keys grant none of
those privileged actions. Credential tables and maintenance RPCs have no client
read/execute grants. Files live at owner-qualified private Storage paths.

## Auth and calendars

Auth Site URL and web/new-native/legacy-native return patterns are saved and
verified. Confirmation is on, anonymous sign-in off, and code length is six.
The Free/default sender rejects template customization and accepts only team
addresses. The app supports its state-bound PKCE email links; an existing custom
SMTP sender enables `{{ .Token }}` templates and six-digit codes. Google sign-in
stays hidden until the actual Auth settings enable it. Desktop returns through
`kimpor-workspace://auth/callback` in the system browser. Real delivery and native
exchange remain release gates.

Calendar OAuth is separate. Enable Google Calendar API, choose appropriate
production consent settings and register this exact web callback for Google and
Microsoft:

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/calendar-callback`

Provider tokens and CalDAV passwords stay encrypted server-side. Google has
incremental cursor reset/paging and conditional etag writes. Outlook currently
rejects recurring writes explicitly. CalDAV/iCloud discovery and read-only ICS
require trusted public HTTPS hosts. Real provider fixtures, revocation and
recurring-instance behavior still need live validation; see the verification ledger.

## Schedules, reminders and backups

Enable Database → Extensions → pg_cron and pg_net. Create Vault secrets named
`velora_maintenance_url` (the maintenance Edge URL) and
`velora_maintenance_secret` (the same MAINTENANCE_SECRET). Migration 0002 schedules
15-minute maintenance only when those extensions/Vault are present. If they were
enabled later, run its scheduling DO block or create the same `*/15 * * * *` job
in Database → Cron. This project has the active job and independently verified
successful runs at 08:30 and 08:45 UTC on October 11, with HTTP 200 responses.

Maintenance compacts known plain Yjs update IDs with a snapshot compare-and-swap,
polls a bounded number of provider accounts, and sends current recurring event
Web Push reminders when VAPID is configured. All-day reminders use 09:00 in the
event's start zone. Push is best-effort and requires a retained subscription;
iOS suspension/offline closed apps cannot be made reliable by this code.

GitHub's daily health workflow needs `KEEPALIVE_URL` (the keepalive Edge URL) and
`MAINTENANCE_SECRET`. Weekly backup needs `BACKUP_SOURCE_URL` (backup Edge URL),
`BACKUP_SECRET`, and `BACKUP_ENCRYPTION_KEY` (independent random 32-byte hex key).
The backup endpoint exports one owner-consistent snapshot including file bytes,
never provider credentials. The runner encrypts with AES-256-GCM before writing
any artifact. Missing configuration produces an explicit notice and no backup.

Back up the encryption key separately; the encrypted artifact is useless without
it. Restore locally:

```sh
node scripts/cloud-backup.mjs decrypt .private/workspace.json backup/workspace.enc
```

Then import that JSON in Settings. The CLI round-trip/tamper/wrong-key test passes.
On October 13, owner-approved Actions configuration and live health/backup runs
38390890987/38390895847 pass. The downloaded artifact authenticates/decrypts;
isolated core-store import/reopen preserves all exported pages, calendars,
databases, document bytes and original history. This uses fake-indexeddb and
does not verify a physical-browser restore or production import. The real
snapshot had no files/protected documents/settings; their live recovery stays
open. See ../docs/evidence/cloud-schedules-2026-10-13.json. Keep the separately
saved recovery key off the computer; that owner action remains outstanding.
Source exports/imports are bounded
at 100 MB, individual files at 10 MiB, and cloud document envelopes/updates at
1 MiB. Imported archives can contain sensitive plaintext; keep local exports private.

## Local verification

```sh
bash scripts/sql-test.sh
bash scripts/deno-install.sh
/tmp/velora-deno/deno check --config supabase/functions/deno.json supabase/functions/*/index.ts
/tmp/velora-deno/deno test --allow-env --config supabase/functions/deno.json supabase/tests/edge_test.ts
pnpm test:backup
```

The PostgreSQL harness mocks Auth/Storage prerequisites. It does not start the
actual Supabase gateway, Storage server, Realtime or OAuth services. Separate
live Auth/ownership/Storage/quota and cron checks now pass, recorded in
`docs/evidence/cloud-live.json` and `cloud-deployment.json`. Provider consent,
email, background push and physical-device latency still require live proof.
