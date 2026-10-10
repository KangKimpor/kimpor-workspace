# Free-tier ledger

Checked **2026-10-10** against vendor-owned pages. Seven live page captures, requested with `maxAge: 0`, are saved in [vendor-pages.json](evidence/vendor-pages.json). Values below are current observations, not perpetual guarantees. No service has been provisioned for this project.

The user’s recorded “Find ways around it” accepts current free plans, offline local editing, quota controls, exports and replaceable hosting. No inspected vendor guarantees perpetual free hosting. No paid plan/trial has been provisioned; account-level allowances and card requirements remain unverified.

## Service limits

| Service | Verified allowance or condition | Authorized control / implementation boundary | Official source |
| --- | --- | --- | --- |
| Supabase Free | 2 active projects; 500 MB database per project; 1 GB file storage; 50 MB maximum upload; 5 GB egress and 5 GB cached egress; 50,000 MAU. | Warn at 70%; stop additional cloud uploads before capacity is exhausted; preserve unsynced local work. | [Pricing](https://supabase.com/pricing) |
| Supabase Realtime | 200 peak concurrent connections; 2 million messages/month; 256 KB/message. | Debounced change nudges; no document payload broadcasts; meter traffic. | [Pricing](https://supabase.com/pricing) |
| Supabase Edge Functions | 500,000 invocations included. | Backoff, foreground batching and provider request budgets. | [Pricing](https://supabase.com/pricing) |
| Supabase operations | Projects pause after 1 week of inactivity; no automatic backups or branching on Free; custom SMTP supported. | Export locally; show waking/restricted states; keepalive is best-effort, never a guarantee. | [Pricing](https://supabase.com/pricing) |
| Supabase quota exceedance | Vendor notifies; continued excess can cause restrictions; restrictions can lift after quota renewal or usage correction. | No auto-upgrade, paid plan or disabling of a spend cap. Explicitly show blocked cloud sync. | [Billing FAQ](https://supabase.com/docs/guides/platform/billing-faq) |
| Vercel Hobby | Free for personal, non-commercial use; 100 GB fast data transfer/month; 1 million CDN requests; 100 deployments/day; 200 projects. | Static SPA; disable analytics and unrelated services; remain on Hobby. | [Hobby plan](https://vercel.com/docs/plans/hobby) |
| Vercel quota exceedance | In most cases an exceeded feature cannot be used until 30 days have passed; some features have different pause periods. | Local desktop app continues; previously cached PWA may continue subject to browser storage retention. No guarantee of first-time web access during a host restriction. | [Hobby plan](https://vercel.com/docs/plans/hobby) |
| GitHub Actions | Standard hosted runners are free for public repos. Larger runners always cost money. GitHub Free includes 500 MB artifact storage and 10 GB cache/repository. Private repos include 2,000 minutes/month. | Public repository by default; standard runners only; short artifact retention; cap cache at included allowance; verify storage budget before CI. | [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) |
| GitHub schedules | Public-repository scheduled workflows disable after 60 days without repository activity. | Show a maintenance reminder and document manual re-enabling. Scheduled keepalive and backups are best-effort. | [Workflow schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) |
| Google Calendar API | Standard usage has no additional cost; per-minute project/user quotas apply. | Enable only Calendar API; do not enable paid Cloud products; consult project quotas and back off on 403/429. | [Calendar usage limits](https://developers.google.com/workspace/calendar/api/guides/quota) |
| Google OAuth | External apps in Testing issue refresh tokens expiring after 7 days except basic identity-only scope sets. Tokens can also expire after six months without use. | Separate sign-in from Calendar authorization; production consent status; re-authorization UI. | [OAuth 2.0](https://developers.google.com/identity/protocols/oauth2) |
| Windows unsigned builds | Code signing is not required to execute the app. Browser-downloaded unsigned builds can trigger SmartScreen. | Ship unsigned by default; document warning; no paid certificate purchase. | [Tauri Windows signing](https://v2.tauri.app/distribute/sign/windows/) |
| SignPath Foundation | Free signing is conditional on OSI licensing, no proprietary components, MFA, verified build provenance and project reputation/control. Every release needs manual signing approval. | Optional Phase 3 application; unsigned fallback if declined. | [SignPath terms](https://signpath.org/terms) |
| iOS web app platform | iOS/iPadOS 26 default Home Screen additions to web apps, with an “Open as Web App” toggle. Manifest remains useful. | Ship manifest/meta; require real-device checks. | [WebKit Safari 26](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) |

## Corrections and unresolved checks

- The current GitHub billing page publishes runner prices directly, including Windows x64 at $0.010/minute. Do not carry over the prompt's “Windows minutes count double” statement without confirming how the account's current allowance is calculated. Public standard-runner minutes are explicitly free; artifact/cache limits still need care.
- The Supabase pricing page does not explicitly state its credit-card requirement. A vendor blog says the Supabase free tier requires no credit card: [official blog](https://supabase.com/blog/observability-for-every-supabase-project-with-grafana-cloud). Actual account provisioning and its plan must still be checked.
- The inspected Vercel Hobby page confirms a free plan but does not explicitly state whether every signup path avoids card verification. Verify the connected team's plan and selected services before creating a project. Do not enroll in a Pro trial.
- The Google OAuth page's 100-refresh-token limit is per Google account/client. It is **not** evidence for the separate 100-user cap on unverified applications. Verify that cap on consent/verification documentation before the OAuth ADR.
- SMTP provider is undecided. Built-in Supabase mail limits and a no-card provider must be verified before promising email-code delivery.
- Microsoft Store/MSIX is optional Phase 3, has not been reverified and is not a dependency of the proposed unsigned NSIS release.
- Provider-free quotas are shared account resources, not guaranteed dedicated app capacity. Usage meters must distinguish measured totals from estimates. Neither local usage estimates nor warning badges alone enforce a cloud cap.
- No free cloud service allows unlimited attachments. Local disk/browser storage is also finite and may be evicted. A full export remains necessary even with sync.

## Libraries and licenses

Version/license metadata from the official npm registry is in [npm-latest.json](evidence/npm-latest.json). Exact selected versions are installed and locked in pnpm-lock.yaml. `pnpm run licenses` audits the installed tree and saves [dependency-licenses.json](evidence/dependency-licenses.json); see THIRD-PARTY-NOTICES.md. Research “latest” observations are not dependency compatibility guarantees.

The observed main stack packages use MIT, Apache-2.0, BSD-3-Clause or ISC. `axe-core` is MPL-2.0 (test dependency); the installed self-hosted Inter font is OFL-1.1. Build-only libvips bundles use LGPL-3.0-or-later and are not distributed with the web/native client. Do not describe the whole proposed dependency tree as MIT. Audit transitive dependencies after installation and preserve notices.

Use only TipTap's open-source core/extensions unless a separately reviewed license allows otherwise. Avoid Potrace's GPL implementation. The npm package named `vtracer` must not be assumed to be the requested MIT VisionCortex tracing tool merely because names match; verify the actual upstream tool before brand work.


## Phase 0 enforcement boundary

Quota classification/fail-closed write contracts are tested; no live cloud meter, upload gate, backup or keepalive has been implemented. Product quota enforcement belongs in Phase 1. CI workflows use standard public runners and 1/7-day artifact retention, but have not run remotely because repository access is blocked. No service has been upgraded or unrelated project altered.
