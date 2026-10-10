# ADR 0001: Keep the app useful without a cloud subscription

Date: 2026-10-10. Accepted after the user's instruction: “Find ways around it”. This resolves the previous feasibility stop.

## Options

1. Depend entirely on a hosted free backend: simplest, but service pauses stop work.
2. Local-first storage with replaceable free sync/hosting: chosen.
3. Self-host on the existing Windows PC: possible future adapter, but remote access, uptime and maintenance depend on that PC. Not needed for the initial product.

## Decision

Use Dexie/IndexedDB as local authority and bundle the Windows frontend. The PWA caches its shell after first online load. No sign-in is required for local mode. Cloud auth/sync is an optional connection, not an application launch dependency. Cached content is editable offline; provider requests queue and replay when connected.

Supabase Free remains the default sync backend. Warn at 70% of verified quotas and stop cloud operations before known caps, keeping local edits and their pending state. A missing/paused backend never discards the outbox. Authoritative provider usage must be distinguished from estimated client usage; do not pretend client meters account for unrelated account traffic. Export/import provides recovery independent of one provider.

Keep the web build static. Vercel Hobby is the default; the identical assets can move to Cloudflare Pages or GitHub Pages with path configuration. No paid trials, larger CI runners, paid signing, commercial TipTap extensions or auto-upgrades. Standard public GitHub Actions builds the unsigned NSIS installer. Private user content never belongs in the public repository.

## Limits

This promises an architecture without required subscriptions, not control over vendors' future terms, perpetual device storage, network access without a network, or guaranteed uptime. Fresh PWA installs still need a host; existing caches may be evicted. A host move changes browser origin and storage, so export before migration and restore/reconnect afterward. Physical-device tests remain necessary.

## Evidence and fallback

Existing [free-tier ledger](../FREE-TIER.md). Cloudflare Pages Free: 500 builds/month, one concurrent build, 20,000 files, 25 MiB per asset: https://developers.cloudflare.com/pages/platform/limits/ (checked 2026-10-10). GitHub Pages: free on public GitHub Free repositories, 1 GB site maximum and 100 GB/month soft bandwidth limit: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits (checked 2026-10-10). No alternative service has been provisioned.

If a provider becomes unsuitable, use local mode and exports while replacing its adapter. No automatic paid migration. The supplied signature source and intermediate outlines remain private in ignored brand/source/. Public assets now use the traced monogram A; regular builds use only public masters.
