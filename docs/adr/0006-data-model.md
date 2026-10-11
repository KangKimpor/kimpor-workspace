# ADR 0006: Unified pages and owner isolation

2026-10-10. One pages table supports page/note/journal/database/row types, parent,
database_id, journal_date, properties, per-field clocks, schema_version and
fractional order. Rich text uses page_doc_updates/page_doc_snapshots; versions
are Phase 2. Rows reuse the page editor and sync representation.

Other tables: databases, calendars, events, attachments, tags, user_settings,
push_subscriptions and tombstones. All exposed rows include user_id; foreign-key
relationships also enforce owner consistency. Deletes retain restorable soft trash; automatic 30-day purge is a documented gap.
Yjs operations append idempotently and compact; scalar records carry field clocks.
Events retain remote_id/etag, UTC, IANA zone and wall-clock intent. All-day dates
remain date-only; recurrence/DST tests are Phase 1.

connected_accounts is server-only by privilege/RLS, with no client read grants.
Credentials remain encrypted server-side. Storage uses owner-qualified paths.
All exposed tables need RLS using auth.uid() = user_id and SQL isolation tests.
Ten reviewed migrations apply in both managed Supabase and isolated PostgreSQL. Actual gateway and private Storage checks pass with two temporary owners, including denied foreign writes/downloads and credential reads. pgcrypto lives in the extensions schema on the managed service; function search paths include it. Separate module tables were rejected as duplication.
