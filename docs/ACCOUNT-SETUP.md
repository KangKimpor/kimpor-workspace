# Remaining secure account setup

The redesign source is on main. Publishing is held because real email delivery
and Google linking have not passed. Signing in to dashboards does not configure
their provider credentials. No passwords, SMTP keys or OAuth secrets belong in
chat, source, tests, screenshots or artifacts.

1. Google Cloud: in project `kimpor-workspace-auth`, close Cloud Shell if it covers
   Save, finish Branding, then create a **Web** OAuth client. Origin:
   `https://kangkimpor.github.io`. Redirect:
   `https://nlcpjdokfvawlpzyfytx.supabase.co/auth/v1/callback`. Save its ID/secret
   directly in Supabase Authentication → Google. Preserve automatic same-email
   linking; do not delete/recreate the existing account or enable manual linking.
2. Brevo: use the free plan (300 emails/day, official pricing checked 2026-10-12),
   verify a sender and generate an SMTP key. In Supabase SMTP, use
   `smtp-relay.brevo.com`, port `587`, the dashboard's SMTP login, its key as the
   password, the verified sender and name **Kimpor Workspace**. Approval/sender
   verification must finish before testing delivery. No paid upgrade is needed.
3. Supabase: confirmation and magic-link email bodies must contain only
   `{{ .Token }}`, with six digits and 600-second expiry. The deployment helper
   now refuses the default sender and writes token-only templates after SMTP is
   configured. The prior private management credential expires; use a fresh
   appropriately scoped credential in secrets for subsequent configuration.
4. Verify delivery to the account and real Google consent with the same email.
   Compare the returned owner ID privately with the original account, and retain
   all imported pages, fields and body bytes. Do not substitute a generated admin
   session or browser fixture for delivery/Google proof. Update the aggregate
   readiness receipt only with verified results, then enable repository variable
   `KIMPOR_AUTH_READY=true` and run Web preview. The current GitHub tool token
   cannot manage repository variables, so this dashboard step remains necessary.

The browser's included automation credit was exhausted before saving Branding or
creating a client. Plugin Management found no direct Brevo/Google OAuth setup
connector. No paid top-up, trial or subscription was requested. Physical iPhone,
iPad, real Google consent, email delivery and native OAuth remain unverified;
the Windows 150 MiB gate remains strict; run 38223202981 passed rendered workspace, Unicode/restart and lifecycle checks, then exceeded its memory limit.
