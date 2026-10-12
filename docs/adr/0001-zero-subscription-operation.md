# ADR 0001: Keep the app useful without a cloud subscription

Date: 2026-10-10. Accepted after the user's instruction: “Find ways around it”. This resolves the previous feasibility stop.

## Updated decision: 2026-10-12

The account is authoritative. Supabase Free holds the workspace; Dexie/IndexedDB
is an invisible cache and outbox. First launch requires sign-in, sessions persist,
and first sign-in pulls the account before safely adopting cache additions.
The existing HLC/Yjs sync engine is retained. A missing or paused backend retains
pending writes and presents only a failure indication with Retry. Export/backup
remains available in Settings. This supersedes the original storage and optional
sign-in choice; the zero-subscription constraint still applies.

Keep the web build static on free GitHub Pages. Alternative free hosts can serve
the same assets with path configuration. No cards, paid trials, larger runners,
paid signing, commercial editor extensions or automatic upgrades. Standard public
GitHub Actions builds development NSIS fixtures; production requires account and
release gates. Private user content never belongs in the public repository.

## Limits

This promises an architecture without required subscriptions, not control over vendors' future terms, perpetual device storage, network access without a network, or guaranteed uptime. Fresh PWA installs still need a host; existing caches may be evicted. A host move changes browser origin and storage, so export before migration and restore/reconnect afterward. Physical-device tests remain necessary.

## Evidence and fallback

Existing [free-tier ledger](../FREE-TIER.md). Cloudflare Pages Free: 500 builds/month, one concurrent build, 20,000 files, 25 MiB per asset: https://developers.cloudflare.com/pages/platform/limits/ (checked 2026-10-10). GitHub Pages: free on public GitHub Free repositories, 1 GB site maximum and 100 GB/month soft bandwidth limit: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits (checked 2026-10-10). No alternative service has been provisioned.

If a provider becomes unsuitable, keep pending writes and exports while replacing its adapter. No automatic paid migration. The supplied signature source and intermediate outlines remain private in ignored brand/source/. Public assets now use the traced monogram A; regular builds use only public masters.
