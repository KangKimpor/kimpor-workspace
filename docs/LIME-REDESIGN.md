# Lime workspace redesign

The supplied brief ends at section 1.6; its seven requirements and three
reference images define this implementation. Preserve source schemas, property
IDs, account isolation and the existing phone/tablet/desktop container layout.

Ordered phases: (0) plan and baseline, (1) tokens and Today, (2) Projects,
(3) Calendar, (4) editor/build update visibility, (5) remove Templates,
(6) durable Trash purge, (7) layout/accessibility audit and documentation.

Design: pale neutral canvas, white rounded cards, lime primary actions with dark
text, black schedule pill, restrained typography using the existing bundled
font. Dark mode uses charcoal surfaces and the same lime action treatment.
Projects uses a full-width task table and labeled view tabs; Calendar retains
the existing month/week/day/agenda engine and uses a full-height month grid.

Baseline on 2026-10-14: clean main at 645df5a; git fetch succeeded;
frozen-lockfile installation succeeded; pnpm check passed 76 tests, 89.26%
core line coverage, 220.2 KiB initial gzip and 44 contrast pairs. Existing Vite
warnings concern recurrence interop and AccountGate's mixed import modes.
The host reports pnpm 11.25.0; the repository pins 11.19.0.

The frontend-design, Ponytail and Plugin Management skills are available.
The named design and engineering skills are unavailable; token, accessibility,
test-plan, review and deployment checks are performed with repository tooling.

Purge verification must cover subtree/attachment/document/history cleanup,
account isolation, retries, stale-device resurrection and transactional rejection
of live pages. Layout verification must cover light/dark desktop1980, iPhone 15,
iPad portrait/landscape and the remaining existing screenshot profiles, with
overflow, touch targets and alignment assertions. Local screenshots are evidence
only; existing CI visual baselines and thresholds remain unchanged.

No Pages deployment, live migration, merge or visual-baseline approval is
authorized by this brief. Backend rollout and CI baseline review are final human
steps after the pull request is ready.
