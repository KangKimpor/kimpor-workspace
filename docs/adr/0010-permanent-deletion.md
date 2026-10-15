# ADR 0010: Acknowledged permanent deletion

Status: implemented on the redesign branch; production rollout pending human approval.

Trash remains a reversible soft delete. Delete forever and Empty Trash need a durable server decision so stale offline clients cannot recreate private content. A local success indication before the server accepts the request would misrepresent an offline or restored item.

For a cloud owner, flush editors and synchronize ordinary changes first. Require an online matching session, then call `purge_entities(items jsonb)`. The security-definer RPC derives ownership from `auth.uid()`, fixes its search path, validates immutable request IDs/payloads, and refuses pages whose merged Trash marker is absent. A concurrent restore therefore wins. Replays use receipts; existing permanent markers make a retried deletion idempotent. Normal push rejects/suppresses purged IDs and children linked to purged pages.

Only after acknowledgement does the store transaction remove local descendants, database records, bodies, encrypted shards, history, attachments and related outbox entries. A refusal triggers a pull before explaining the restore. An account switch aborts local cleanup. Local-only owners use the same transaction without a cloud call. Cloud purge is never queued offline.

Deleting a page does not delete linked calendar events or calendars. Missing page links show explanatory guidance. Private file paths go into the server cleanup queue before attachment metadata is removed. Maintenance retries failed Storage deletion and clears queue entries only after success. Markers contain identifiers rather than private content and remain owner-readable under RLS.

Rejected alternatives: client-only deletion cannot protect other devices; retention timers do not satisfy an explicit irreversible action; an offline purge intent can defeat a newer restore; cascading through event links deletes independent calendar content.

Apply the two pending migrations in order: `202610140001_permanent_deletion.sql` and `20261014112842_acknowledged_purge.sql`. Deploy attachments, maintenance and delete-account functions from the reviewed branch. Core/SQL/Deno tests cover local cascade, cloud acknowledgement/refusal, stale writes, owner isolation and cleanup retries; production Storage and two real signed-in devices remain rollout acceptance.
