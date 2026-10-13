# Account configuration and remaining verification

Verified 2026-10-13 in the existing Supabase project `nlcpjdokfvawlpzyfytx`.
The redesigned local production build used the live site's public publishable
configuration. No credentials, private identities or user content belong in Git.

- Google is enabled. The owner completed Google sign-in in the new screen.
  Supabase still contains one user with the original owner ID and Email/Google
  identities. The Google consent app remains External / Testing; broader Google
  availability has not been established.
- Existing custom Brevo SMTP is enabled: `smtp-relay.brevo.com`, port `587`,
  sender name **Kimpor Workspace**, per-user interval **30 seconds**. The stored
  SMTP credential was neither read nor replaced.
- Confirmation and magic-link subjects are **Kimpor Workspace code**. Both
  template bodies are exactly `{{ .Token }}`; OTP length is **6**, expiry **600s**.
- The owner received a code-only email and entered its code directly into the
  new local sign-in screen. Successful real sign-in was observed afterward.
- Read-only SQL comparisons before and after Google and email sign-in matched
  complete page/database/update/snapshot row hashes: **69 pages, four databases,
  62 document bodies**. Owner IDs and hashes remained private.

The aggregate receipt is `evidence/account-auth-readiness.json`. Do not recreate
OAuth clients, SMTP keys or the original account. Manual identity linking remains
disabled. No paid plan, trial or billing resource was added.

The human approved PR #7 merge and `KIMPOR_AUTH_READY=true` on 2026-10-13.
Quality CI 38337462873 passes 138 app cases, 18 account fixtures and 510 strict
visual comparisons; Pages 38338654296 deploys source 4fc8726. Deployed Google
sign-in and reload preserve the original owner; a public-origin email recheck
is awaiting the owner. A fresh audit identifies four added pages and one prior
soft-delete before publication; original database/document bytes still match.
See evidence/web-publication-2026-10-13.json. Account readiness does not establish
native memory, physical devices, live calendar providers or updater acceptance.
