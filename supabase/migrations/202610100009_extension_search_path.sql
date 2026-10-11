-- Managed Supabase installs pgcrypto in extensions; local PostgreSQL may use
-- public. Resolve the hash dependency in either layout without moving an
-- existing extension, replacing the RPC, or changing its ownership grants.
alter function public.push_changes(jsonb) set search_path = public, extensions, pg_temp;
