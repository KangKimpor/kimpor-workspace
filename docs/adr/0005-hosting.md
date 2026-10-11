# ADR 0005: Portable hosting and Pages preview fallback

2026-10-10. Vercel Hobby is the preferred personal/noncommercial host. This
session exposes the installed plugin/skills but no callable deployment tool or
CLI credential, and has not established the team's plan. Do not enroll in a trial.

Configure `apps/web/vercel.json` for Git import and publish the Phase 0 preview
with free GitHub Pages from the public KangKimpor/kimpor-workspace repository, within
the recorded portable-hosting authorization. Cloudflare Pages is an alternative.
BASE_PATH=/kimpor-workspace/ prefixes assets, manifest, SW and navigation. Only a
reviewed main commit is published. The initial preview was manually dispatched
before full Quality passed; subsequent pushes publish only after Quality succeeds.
Public route, manifest, SW and offline checks pass. No analytics are enabled.

Vercel config supplies CSP/cache response headers. Pages cannot set custom
headers; its fallback uses a CSP meta tag and host caching. Meta CSP does not
enforce frame-ancestors. Host moves change origin: IndexedDB does not transfer.
Export/import or Phase 1 authenticated resync is required. Future vendor pricing
and perpetual uptime are not guaranteed.
