# ADR 0009: Guarded HTTPS deployment to the dedicated Free project

Status: Accepted and deployed; live API and public browser checks passed.
Date: 2026-10-11.

The dedicated Free/NANO project kimpor-workspace, nlcpjdokfvawlpzyfytx, was
provisioned without a card. Dashboard SQL input did not reach its editor model.
The browser could not transfer a complete personal access token; an actual
Management API project read returned HTTP 401. A saved GitHub secret name alone
does not establish a valid credential.

Cloud deployment now uses the Supabase Management HTTPS query endpoint and
pinned CLI 2.120.0 API bundling. This avoids a DB password and a direct IPv6-only
database connection. The query endpoint is experimental and may change; the
incremental CLI path remains documented in supabase/README.md.

The workflow is serialized, manually dispatched or release-triggered, and
constrained to the exact project reference, name and healthy state. It verifies
the generated schema checksum. Fresh deployments apply all ten migrations in
one transaction; an existing database is accepted only with the exact reviewed
migration history. Partial, unstamped or differing histories require the reviewed
incremental migration path. Existing encryption keys are never silently rotated.

New server secrets are generated inside the runner and saved privately in
Supabase Vault and Edge settings. Reports contain names, public VAPID material,
configuration booleans and counts; API error bodies are omitted. Temporary QA
accounts exercise real Auth/PostgREST/Edge/Storage ownership, never send email,
and are deleted with their files after checks. These checks do not establish
physical-device sync latency, user email delivery, Google consent or background
push receipt.

After direct HTTPS deployment and verified live ownership tests, Pages/native
builds consume the saved public Supabase variables by default. An explicit
KIMPOR_CLOUD_READY=false disables cloud for a local-only build. The original
incomplete GitHub secret is still separate from the valid private deployment
credential. Short-lived tokens must be renewed privately before later deployments.
