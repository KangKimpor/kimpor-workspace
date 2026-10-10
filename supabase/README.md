# Optional cloud backend

Local editing needs no project, account or environment values. Eight migrations
and eight Edge Functions implement the optional cloud boundary. Isolated
PostgreSQL ownership/idempotency/compaction/privacy/quota checks and Deno provider
fixtures pass locally. No live Supabase project has been created or migrated.

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
requires `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF`.
It links CLI 2.120.0, shows a dry run, applies all migrations and deploys functions.
Equivalent commands:

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

Supabase Auth → Email template uses `{{ .Token }}` so installed web apps receive
a six-digit code. Configure the actual site URL, allowed return URLs and Google
identity provider. Desktop sign-in returns to `veloradesk://auth/callback` through
the system browser. Live native/provider exchange remains a release gate.

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
in Database → Cron. Verify the actual scheduled request in logs.

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

Then import that JSON in Settings. The CLI round-trip/tamper/wrong-key test passes;
a real cloud backup/restore remains unverified. Source exports/imports are bounded
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
actual Supabase gateway, Storage server, Realtime or OAuth services. Live isolation,
quota, background schedule and provider consent tests remain necessary.
