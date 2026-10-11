# Large workspace benchmark

The production browser benchmark imports 2,000 notes and 365 additional journal
pages, exactly 20,000 blocks (including a 5,000-block note), 5,000 events and
mixed Khmer/Chinese/English text. It also queries the built production search
worker with 10,000 synthetic items. No personal data or account is used.

```sh
pnpm build
pnpm --filter @veloradesk/web preview --port 4173
# In another terminal, with Playwright browsers/dependencies installed:
pnpm performance
```

`BASE_URL` changes the preview origin; `BENCH_PROFILES=chromium` selects one
profile; `BENCH_REPORT` changes the output file. Optional `BENCH_CPU_REPORT`
enables Chromium profiling; profiling runs are separate from the final timings.
The default output is [seeded-performance.json](evidence/seeded-performance.json).
The command exits nonzero when a functional assertion or budget fails.

## October 11 local result

| Measurement | Chromium, 1536 × 864 | Phone WebKit, 393 × 852 |
| --- | ---: | ---: |
| Full import | 35.6 s | 32.0 s |
| Cached reload to Today | 165 ms | 322 ms |
| Open 5,000-block note with editor code already loaded | 2,026 ms | 2,082 ms |
| Typing, median / p95 / maximum | 32.7 / 119.4 / 219.9 ms | 34 / 125 / 170 ms |
| Warm worker search, median / p95 / maximum | 6.5 / 8.9 / 12.1 ms | 12 / 28 / 35 ms |
| Initial indexing plus first worker query | 68.7 ms | 41 ms |

Both profiles pass the scrolling, nested branch expansion, opening the last note,
text-size change, visible handle count and keyboard reordering assertions. The first viewport
mounts 20 note rows, 21 tree rows and 20–21 editor drag handles. No page errors
occurred. Warm start and warm search meet their sampled targets. **Typing misses
the required 16 ms maximum; this remains a release/performance gap.** These are
local browser timings, not results on the user's iPhone, iPad or Windows PC.

Typing is measured from keydown to the next animation frame for 20 individual
letters, 150 ms apart, with normal autosaving enabled. This includes frame
scheduling and competing saves, and does not establish physical input-to-display
latency or native IME performance. Warm search measures worker round trips after
the initial index/query; it does not include the palette's UI or a cold index.

Long regular lists and the flattened tree position only their visible rows plus
overscan. Fractional row heights and fixed container heights keep scrolling stable
in WebKit. Lists observe actual row-height changes when text size changes. Editor
drag handles are windowed and refreshed once per frame, retaining their index in
the full document with fresh drop geometry; mention
suggestions read the page library only while open. Store lists detach each result
once rather than cloning every field separately; the mutation-isolation regression
test protects that behavior. The actual ProseMirror document, galleries and
database view bodies are not fully virtualized.

Earlier measurements and failed attempts remain in evidence. Some earlier runs
profiled the CPU, included background editor saves during search, or exposed a
benchmark sort assumption and the WebKit scroll anchoring defect. Their results
are retained as historical evidence, not counted as passing final checks.

## Delta persistence follow-up

Main 7459156 persists plain editor Yjs deltas, lazily captures the initial snapshot
and batches quiet autosaves at 500 ms; navigation still flushes immediately.
seeded-performance-delta.json and seeded-performance-batched.json preserve the
measured results. The 500 ms run recorded typing median/max 16.7/152.8 ms in
Chromium and 17/49 ms on the emulated phone while other browser work was active.
These samples are not an isolated before/after comparison and do not pass the
16 ms maximum. No threshold was weakened.
