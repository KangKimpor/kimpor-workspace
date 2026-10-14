-- Apply only to the new, dedicated Kimpor Workspace project.
-- All eleven migrations run atomically; an existing workspace aborts this script.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.pages') IS NOT NULL THEN
    RAISE EXCEPTION 'Workspace already exists; use the incremental CLI migration path';
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text);

-- 202610100001_workspace.sql
-- All mutations go through owner-bound RPCs. Publishable keys are intentionally public.
create extension if not exists pgcrypto;

create table public.pages (id text not null, user_id uuid not null references auth.users(id) on delete cascade, fields jsonb not null default '{}', schema_version integer not null default 1 check (schema_version = 1), updated_at timestamptz not null default now(), primary key(user_id,id));
create table public.calendars (like public.pages including all);
create table public.events (like public.pages including all);
create table public.databases (like public.pages including all);
alter table public.calendars add foreign key(user_id) references auth.users(id) on delete cascade;
alter table public.events add foreign key(user_id) references auth.users(id) on delete cascade;
alter table public.databases add foreign key(user_id) references auth.users(id) on delete cascade;
create table public.sync_changes (cursor bigint generated always as identity primary key, user_id uuid not null references auth.users(id) on delete cascade, change_id text not null, payload jsonb not null, created_at timestamptz not null default now(), unique(user_id,change_id));
create index sync_changes_owner_cursor on public.sync_changes(user_id,cursor);
create table public.sync_receipts(user_id uuid not null references auth.users(id) on delete cascade,change_id text not null,payload_hash text not null,primary key(user_id,change_id));
create table public.encrypted_doc_updates(user_id uuid not null references auth.users(id) on delete cascade,id text not null,page_id text not null,envelope jsonb not null,created_at timestamptz not null default now(),primary key(user_id,id));
create table public.page_doc_updates (id text not null, user_id uuid not null references auth.users(id) on delete cascade, page_id text not null, update_base64 text not null, created_at timestamptz not null default now(), primary key(user_id,id), foreign key(user_id,page_id) references public.pages(user_id,id) on delete cascade);
create table public.page_doc_snapshots (user_id uuid not null references auth.users(id) on delete cascade, page_id text not null, update_base64 text not null, through_cursor bigint not null, created_at timestamptz not null default now(), primary key(user_id,page_id), foreign key(user_id,page_id) references public.pages(user_id,id) on delete cascade);
create table public.page_versions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, page_id text not null, update_base64 text not null, created_at timestamptz not null default now(), foreign key(user_id,page_id) references public.pages(user_id,id) on delete cascade);
create table public.connected_accounts (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, provider text not null check(provider in ('google','outlook','caldav','ics')), label text not null, encrypted_credentials text not null, status text not null default 'connected', sync_state jsonb not null default '{}', last_sync_at timestamptz, created_at timestamptz not null default now());
create table public.calendar_oauth_requests (id text primary key, user_id uuid not null references auth.users(id) on delete cascade, provider text not null check(provider in ('google','outlook')), encrypted_verifier text not null, expires_at timestamptz not null, consumed_at timestamptz);
create table public.attachments (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, page_id text, path text not null, bytes bigint not null check(bytes>=0), mime text not null, created_at timestamptz not null default now());
create table public.tags (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null);
create table public.user_settings (user_id uuid primary key references auth.users(id) on delete cascade, fields jsonb not null default '{}', schema_version integer not null default 1 check(schema_version=1));
create table public.push_subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, endpoint text not null unique, subscription jsonb not null, time_zone text not null default 'UTC', created_at timestamptz not null default now());
create table public.reminder_deliveries (user_id uuid not null references auth.users(id) on delete cascade, event_id text not null, occurrence text not null, sent_at timestamptz not null default now(), primary key(user_id,event_id,occurrence));
create table public.tombstones (user_id uuid not null references auth.users(id) on delete cascade, table_name text not null, entity_id text not null, deleted_at timestamptz not null default now(), primary key(user_id,table_name,entity_id));

do $$ declare name text; begin
  foreach name in array array['pages','calendars','events','databases','sync_changes','page_doc_updates','page_doc_snapshots','page_versions','encrypted_doc_updates','attachments','tags','user_settings','push_subscriptions','tombstones'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid())=user_id)',name);
    execute format('revoke all on public.%I from anon, authenticated',name);
    execute format('grant select on public.%I to authenticated',name);
  end loop;
  foreach name in array array['connected_accounts','calendar_oauth_requests','reminder_deliveries','sync_receipts'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from anon, authenticated',name);
  end loop;
end $$;

create function public.notify_workspace(owner_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare latest bigint;begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    select max(cursor) into latest from public.sync_changes where user_id=owner_id;
    execute 'select realtime.send($1,$2,$3,$4)' using jsonb_build_object('cursor',latest::text),'change','workspace:'||owner_id::text,true;
  end if;
exception when others then
  -- Realtime is an optional hint; a delivery outage must not roll back durable writes.
  return;
end $$;
revoke all on function public.notify_workspace(uuid) from public;
grant execute on function public.notify_workspace(uuid) to service_role;

create function public.storage_usage() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare db_bytes bigint; file_bytes bigint; invalid_count bigint; begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select pg_database_size(current_database()) into db_bytes;
  if to_regclass('storage.objects') is null then raise exception 'Storage quota cannot be verified' using errcode='55000'; end if;
  execute 'select count(*) from storage.objects where metadata->>''size'' is null or metadata->>''size''!~''^[0-9]+$''' into invalid_count;
  if invalid_count>0 then raise exception 'Storage quota cannot be verified' using errcode='55000'; end if;
  execute 'select coalesce(sum((metadata->>''size'')::bigint),0) from storage.objects' into file_bytes;
  return jsonb_build_object('databaseBytes',db_bytes,'storageBytes',file_bytes,'databaseLimit',500000000,'storageLimit',1000000000,'warning',db_bytes>=350000000 or file_bytes>=700000000);
end $$;

create function public.merge_clock_fields(existing jsonb,incoming jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare result jsonb:=existing; item record; old_clock jsonb; new_clock jsonb; comparison integer; begin
  if jsonb_typeof(incoming)<>'object' then raise exception 'Invalid fields'; end if;
  for item in select key,value from jsonb_each(incoming) loop
    new_clock:=item.value->'clock'; old_clock:=existing->item.key->'clock';
    if jsonb_typeof(item.value)<>'object' or not (item.value?'value') or jsonb_typeof(new_clock)<>'object' or not (new_clock->>'wall' ~ '^[0-9]+$') or not (new_clock->>'counter' ~ '^[0-9]+$') or coalesce(length(new_clock->>'node'),0) not between 1 and 128 then raise exception 'Invalid field clock'; end if;
    if (new_clock->>'wall')::numeric>9007199254740991 or (new_clock->>'counter')::numeric>9007199254740991 then raise exception 'Clock exceeds safe integer'; end if;
    comparison:=case when old_clock is null then 1 when (new_clock->>'wall')::bigint>(old_clock->>'wall')::bigint then 1 when (new_clock->>'wall')::bigint<(old_clock->>'wall')::bigint then -1 when (new_clock->>'counter')::bigint>(old_clock->>'counter')::bigint then 1 when (new_clock->>'counter')::bigint<(old_clock->>'counter')::bigint then -1 when (new_clock->>'node') collate "C">(old_clock->>'node') collate "C" then 1 else -1 end;
    if comparison>0 then result:=jsonb_set(result,array[item.key],item.value,true); end if;
  end loop; return result;
end $$;

create function public.push_changes(changes jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare owner uuid:=auth.uid(); change jsonb; table_name text; merged jsonb; locked boolean; quota jsonb; acknowledgments jsonb:='[]'; hash_existing text; change_hash text; begin
  if owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
  -- Serializes budget checks and field merges across devices. No credentials or user IDs are trusted from the caller.
  perform pg_advisory_xact_lock(20261010);
  quota:=public.storage_usage();
  if (quota->>'databaseBytes')::bigint+octet_length(changes::text)*3>=500000000 or (quota->>'storageBytes')::bigint>=1000000000 then raise exception 'Cloud quota reached; edits remain local' using errcode='54000'; end if;
  if jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)>200 or octet_length(changes::text)>2097152 then raise exception 'Invalid sync batch'; end if;
  for change in select value from jsonb_array_elements(changes) loop
    if change->>'userId'<>owner::text or change->>'userId' is null then raise exception 'Wrong owner' using errcode='42501'; end if;
    if coalesce(change->>'schemaVersion','')<>'1' or length(coalesce(change->>'id','')) not between 1 and 160 or length(coalesce(change->>'entityId','')) not between 1 and 160 then raise exception 'Invalid sync record'; end if;
    change_hash:=encode(digest(change::text,'sha256'),'hex');
    select payload_hash into hash_existing from public.sync_receipts where user_id=owner and change_id=change->>'id';
    if found then
      if hash_existing<>change_hash then raise exception 'Idempotency key reused with different payload'; end if;
      acknowledgments:=acknowledgments||jsonb_build_array(change->>'id'); continue;
    end if;
    if change->>'kind'='setting' then
      if length(coalesce(change->>'key','')) not between 1 and 160 or change->>'key' like 'provider:%' then raise exception 'Invalid setting'; end if;
      select fields into merged from public.user_settings where user_id=owner for update;
      merged:=public.merge_clock_fields(coalesce(merged,'{}'),jsonb_build_object(change->>'key',jsonb_build_object('value',change->'value','clock',change->'clock')));
      insert into public.user_settings(user_id,fields) values(owner,merged) on conflict(user_id) do update set fields=excluded.fields;
    elsif change->>'kind'='entity' then
      table_name:=change->>'table';
      if table_name not in ('pages','calendars','events','databases') or table_name is null then raise exception 'Invalid entity table'; end if;
      execute format('select fields from public.%I where user_id=$1 and id=$2 for update',table_name) into merged using owner,change->>'entityId';
      merged:=public.merge_clock_fields(coalesce(merged,'{}'),change->'fields');
      if change->'fields'->'userId'->>'value' is not null and change->'fields'->'userId'->>'value'<>owner::text then raise exception 'Wrong field owner' using errcode='42501'; end if;
      locked:=coalesce((merged->'properties.__locked'->>'value')::boolean,(merged->'properties'->'value'->>'__locked')::boolean,false);
      if table_name='pages' and locked and ((merged->'properties'->'value'?'__text') or coalesce(merged->'properties.__text'->'value','null'::jsonb)<>'null'::jsonb) then raise exception 'Locked page cannot contain plaintext'; end if;
      execute format('insert into public.%I(id,user_id,fields) values($1,$2,$3) on conflict(user_id,id) do update set fields=excluded.fields,updated_at=now()',table_name) using change->>'entityId',owner,merged;
      if table_name='pages' and locked then
        delete from public.page_doc_updates where user_id=owner and page_id=change->>'entityId';
        delete from public.page_doc_snapshots where user_id=owner and page_id=change->>'entityId';
        delete from public.page_versions where user_id=owner and page_id=change->>'entityId';
        delete from public.sync_changes where user_id=owner and payload->>'kind'='document' and payload->>'entityId'=change->>'entityId';
      end if;
      if merged->'deletedAt'->'value' is not null and merged->'deletedAt'->'value'<>'null'::jsonb then
        insert into public.tombstones(user_id,table_name,entity_id) values(owner,table_name,change->>'entityId') on conflict do nothing;
      end if;
    elsif change->>'kind'='document' then
      select coalesce((fields->'properties.__locked'->>'value')::boolean,(fields->'properties'->'value'->>'__locked')::boolean,false) into locked from public.pages where user_id=owner and id=change->>'entityId';
      if not found then raise exception 'Document page does not exist'; end if;
      if locked then insert into public.sync_receipts values(owner,change->>'id',change_hash); acknowledgments:=acknowledgments||jsonb_build_array(change->>'id'); continue; end if;
      if change->>'update' is null or octet_length(change->>'update')>1048576 or change->>'update'!~'^[A-Za-z0-9+/]*={0,2}$' then raise exception 'Invalid document update'; end if;
      perform decode(change->>'update','base64');
      insert into public.page_doc_updates(id,user_id,page_id,update_base64) values(change->>'id',owner,change->>'entityId',change->>'update');
    elsif change->>'kind'='encrypted-document' then
      select coalesce((fields->'properties.__locked'->>'value')::boolean,(fields->'properties'->'value'->>'__locked')::boolean,false) into locked from public.pages where user_id=owner and id=change->>'entityId';
      if not found or not locked then raise exception 'Encrypted document requires a locked page'; end if;
      if jsonb_typeof(change->'envelope')<>'object' or octet_length((change->'envelope')::text)>1048576 then raise exception 'Invalid encrypted document'; end if;
      if change ? 'supersedes' then
        if jsonb_typeof(change->'supersedes')<>'array' or jsonb_array_length(change->'supersedes')>1000 then raise exception 'Invalid encrypted compaction batch';end if;
        if exists(select 1 from jsonb_array_elements(change->'supersedes') as item where jsonb_typeof(item)<>'string' or length(item#>>'{}')>160 or item#>>'{}'=change->>'id') then raise exception 'Invalid encrypted compaction batch';end if;
        delete from public.encrypted_doc_updates where user_id=owner and page_id=change->>'entityId' and id in(select jsonb_array_elements_text(change->'supersedes'));
        delete from public.sync_changes where user_id=owner and payload->>'kind'='encrypted-document' and payload->>'entityId'=change->>'entityId' and change_id in(select jsonb_array_elements_text(change->'supersedes'));
      end if;
      insert into public.encrypted_doc_updates(user_id,id,page_id,envelope) values(owner,change->>'id',change->>'entityId',change->'envelope');
    else raise exception 'Invalid change kind'; end if;
    insert into public.sync_changes(user_id,change_id,payload) values(owner,change->>'id',change);
    insert into public.sync_receipts values(owner,change->>'id',change_hash);
    acknowledgments:=acknowledgments||jsonb_build_array(change->>'id');
  end loop;
  perform public.notify_workspace(owner);
  return jsonb_build_object('acknowledged',acknowledgments);
end $$;

create function public.pull_changes(after_cursor text default '0',batch_limit integer default 200) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare owner uuid:=auth.uid(); batch jsonb; last_cursor bigint; more boolean; begin
  if owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if after_cursor!~'^[0-9]+$' or batch_limit not between 1 and 500 then raise exception 'Invalid cursor'; end if;
  select coalesce(jsonb_agg(payload order by cursor),'[]'),coalesce(max(cursor),after_cursor::bigint) into batch,last_cursor from (select cursor,payload from public.sync_changes where user_id=owner and cursor>after_cursor::bigint order by cursor limit batch_limit) selected;
  select exists(select 1 from public.sync_changes where user_id=owner and cursor>last_cursor) into more;
  return jsonb_build_object('changes',batch,'cursor',last_cursor::text,'hasMore',more);
end $$;

create function public.connected_account_list() returns jsonb language sql security definer set search_path=public,pg_temp as $$ select jsonb_build_object('accounts',coalesce(jsonb_agg(jsonb_build_object('id',id,'provider',provider,'label',label,'status',status,'lastSyncAt',last_sync_at)),'[]')) from public.connected_accounts where user_id=auth.uid() $$;
create function public.export_cloud_data() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare owner uuid:=auth.uid(); result jsonb:='{}'; table_name text; records jsonb; begin
  if owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
  foreach table_name in array array['pages','calendars','events','databases','page_doc_updates','page_doc_snapshots','page_versions','encrypted_doc_updates','attachments','tags','user_settings','tombstones'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]'') from public.%I t where user_id=$1',table_name) into records using owner;
    result:=jsonb_set(result,array[table_name],records);
  end loop; return result;
end $$;
create function public.delete_my_cloud_data() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare owner uuid:=auth.uid(); name text; begin
  if owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
  foreach name in array array['pages','calendars','events','databases','sync_changes','sync_receipts','encrypted_doc_updates','connected_accounts','calendar_oauth_requests','attachments','tags','user_settings','push_subscriptions','reminder_deliveries','tombstones'] loop execute format('delete from public.%I where user_id=$1',name) using owner; end loop;
  -- The delete-account Edge Function removes physical files through the Storage API first.
end $$;

revoke all on function public.merge_clock_fields(jsonb,jsonb) from public;
revoke all on function public.storage_usage(),public.push_changes(jsonb),public.pull_changes(text,integer),public.connected_account_list(),public.export_cloud_data(),public.delete_my_cloud_data() from public;
grant execute on function public.storage_usage(),public.push_changes(jsonb),public.pull_changes(text,integer),public.connected_account_list(),public.export_cloud_data(),public.delete_my_cloud_data() to authenticated;
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;

-- Supabase Storage policies are scoped by the authenticated user prefix.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('attachments','attachments',false,10485760,array['image/webp','image/png','image/jpeg','application/pdf','text/plain']) on conflict(id) do nothing;
create policy attachments_read on storage.objects for select to authenticated using(bucket_id='attachments' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Uploads use the Edge attachment endpoint, where global capacity is checked first; direct client uploads are denied.
create policy attachments_delete on storage.objects for delete to authenticated using(bucket_id='attachments' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Realtime private broadcasts contain only {cursor}; regular polling remains the reliable fallback.
do $$ begin
  if to_regclass('realtime.messages') is not null then
    execute 'create policy owner_broadcast on realtime.messages for select to authenticated using (realtime.topic() = ''workspace:'' || (select auth.uid())::text)';
  end if;
end $$;

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('202610100001','workspace') ON CONFLICT(version) DO NOTHING;

-- 202610100002_maintenance.sql
create function public.server_storage_usage() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare db_bytes bigint; file_bytes bigint; invalid_count bigint; begin
  select pg_database_size(current_database()) into db_bytes;
  if to_regclass('storage.objects') is null then raise exception 'Storage quota cannot be verified'; end if;
  select count(*) into invalid_count from storage.objects where metadata->>'size' is null or metadata->>'size'!~'^[0-9]+$';
  if invalid_count>0 then raise exception 'Storage quota cannot be verified'; end if;
  select coalesce(sum((metadata->>'size')::bigint),0) into file_bytes from storage.objects;
  return jsonb_build_object('databaseBytes',db_bytes,'storageBytes',file_bytes);
end $$;
revoke all on function public.server_storage_usage() from public;
grant execute on function public.server_storage_usage() to service_role;

create function public.compact_page_document(owner_id uuid,page text,merged_update text,through_id timestamptz) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare next_cursor bigint; snapshot_change jsonb; locked boolean; snapshot_id text:='snapshot:'||gen_random_uuid(); begin
  perform pg_advisory_xact_lock(20261010);
  select coalesce((fields->'properties.__locked'->>'value')::boolean,(fields->'properties'->'value'->>'__locked')::boolean,false) into locked from public.pages where user_id=owner_id and id=page;
  if locked or not found then return; end if;
  perform decode(merged_update,'base64');
  snapshot_change:=jsonb_build_object('id',snapshot_id,'userId',owner_id::text,'kind','document','entityId',page,'update',merged_update,'schemaVersion',1);
  insert into public.sync_changes(user_id,change_id,payload) values(owner_id,snapshot_id,snapshot_change) returning cursor into next_cursor;
  insert into public.page_doc_snapshots(user_id,page_id,update_base64,through_cursor) values(owner_id,page,merged_update,next_cursor) on conflict(user_id,page_id) do update set update_base64=excluded.update_base64,through_cursor=excluded.through_cursor,created_at=now();
  insert into public.page_versions(user_id,page_id,update_base64) values(owner_id,page,merged_update);
  delete from public.sync_changes where user_id=owner_id and payload->>'kind'='document' and payload->>'entityId'=page and created_at<=through_id;
  delete from public.page_doc_updates where user_id=owner_id and page_id=page and created_at<=through_id;
  delete from public.page_versions where user_id=owner_id and page_id=page and created_at<now()-interval '30 days';
end $$;
revoke all on function public.compact_page_document(uuid,text,text,timestamptz) from public;
grant execute on function public.compact_page_document(uuid,text,text,timestamptz) to service_role;

-- An Edge cron request is authenticated with a secret stored in Vault, never a public project key.
-- Configure after deploy: select vault.create_secret('https://PROJECT.supabase.co/functions/v1/maintenance','velora_maintenance_url');
-- select vault.create_secret('random-secret','velora_maintenance_secret');
-- Requires pg_cron and pg_net extensions enabled by the project administrator.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') and exists(select 1 from pg_extension where extname='pg_net') and to_regclass('vault.decrypted_secrets') is not null then
    execute $cron$select cron.schedule('velora-maintenance','*/15 * * * *',$job$select net.http_post(url:=(select decrypted_secret from vault.decrypted_secrets where name='velora_maintenance_url'),headers:=jsonb_build_object('Content-Type','application/json','x-maintenance-secret',(select decrypted_secret from vault.decrypted_secrets where name='velora_maintenance_secret')),body:='{"action":"scheduled"}'::jsonb) where exists(select 1 from vault.decrypted_secrets where name='velora_maintenance_secret')$job$)$cron$;
  end if;
end $$;

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('202610100002','maintenance') ON CONFLICT(version) DO NOTHING;

-- 202610100003_files_compaction.sql
alter table public.attachments add column name text not null default 'File';
drop function public.compact_page_document(uuid,text,text,timestamptz);
create function public.compact_page_document(owner_id uuid,page text,merged_update text,through_update_ids text[]) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare next_cursor bigint; snapshot_change jsonb; locked boolean; snapshot_id text:='snapshot:'||gen_random_uuid(); begin
  perform pg_advisory_xact_lock(20261010);
  select coalesce((fields->'properties.__locked'->>'value')::boolean,false) into locked from public.pages where user_id=owner_id and id=page;
  if locked or not found then return;end if;
  if cardinality(through_update_ids)>1000 or octet_length(merged_update)>1048576 then raise exception 'Compaction batch exceeds limit';end if;
  perform decode(merged_update,'base64');
  snapshot_change:=jsonb_build_object('id',snapshot_id,'userId',owner_id::text,'kind','document','entityId',page,'update',merged_update,'schemaVersion',1);
  insert into public.sync_changes(user_id,change_id,payload) values(owner_id,snapshot_id,snapshot_change) returning cursor into next_cursor;
  insert into public.page_doc_snapshots(user_id,page_id,update_base64,through_cursor) values(owner_id,page,merged_update,next_cursor) on conflict(user_id,page_id) do update set update_base64=excluded.update_base64,through_cursor=excluded.through_cursor,created_at=now();
  insert into public.page_versions(user_id,page_id,update_base64) values(owner_id,page,merged_update);
  delete from public.sync_changes where user_id=owner_id and payload->>'kind'='document' and payload->>'entityId'=page and payload->>'id'=any(through_update_ids);
  delete from public.page_doc_updates where user_id=owner_id and page_id=page and id=any(through_update_ids);
  delete from public.page_versions where user_id=owner_id and page_id=page and created_at<now()-interval '30 days';
  perform public.notify_workspace(owner_id);
end $$;
revoke all on function public.compact_page_document(uuid,text,text,text[]) from public;
grant execute on function public.compact_page_document(uuid,text,text,text[]) to service_role;

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('202610100003','files_compaction') ON CONFLICT(version) DO NOTHING;

-- 202610100004_encrypted_attachments.sql
alter table public.attachments drop constraint attachments_pkey;
alter table public.attachments add primary key(user_id,id);
alter table public.attachments add column digest text;
update storage.buckets set allowed_mime_types=array['application/octet-stream','image/webp','image/png','image/jpeg','application/pdf','text/plain'] where id='attachments';
create function public.register_attachment(owner_id uuid,metadata jsonb,change_id text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb; begin
  perform pg_advisory_xact_lock(20261010);
  if metadata->>'user_id'<>owner_id::text or change_id<>'attachment:'||(metadata->>'id') or not exists(select 1 from public.pages where user_id=owner_id and id=metadata->>'page_id') then raise exception 'Invalid attachment identity';end if;
  if (metadata->>'bytes')::bigint>10485760 or metadata->>'path'<>owner_id::text||'/'||(metadata->>'id') then raise exception 'Invalid attachment size or path';end if;
  insert into public.attachments(user_id,id,page_id,path,bytes,mime,name,digest) values(owner_id,(metadata->>'id')::uuid,metadata->>'page_id',metadata->>'path',(metadata->>'bytes')::bigint,metadata->>'mime',metadata->>'name',metadata->>'digest') on conflict(user_id,id) do nothing;
  item:=jsonb_build_object('id',change_id,'userId',owner_id::text,'kind','attachment','entityId',metadata->>'page_id','schemaVersion',1,'attachment',jsonb_build_object('id',metadata->>'id','pageId',metadata->>'page_id','name',metadata->>'name','mime',metadata->>'mime','size',(metadata->>'bytes')::bigint,'createdAt',(select created_at from public.attachments where user_id=owner_id and id=(metadata->>'id')::uuid)));
  insert into public.sync_changes(user_id,change_id,payload) values(owner_id,change_id,item) on conflict(user_id,change_id) do nothing;
  perform public.notify_workspace(owner_id);
end $$;
revoke all on function public.register_attachment(uuid,jsonb,text) from public;
grant execute on function public.register_attachment(uuid,jsonb,text) to service_role;

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('202610100004','encrypted_attachments') ON CONFLICT(version) DO NOTHING;

-- 202610100005_calendar_maintenance.sql
create function public.apply_calendar_changes(owner_id uuid,changes jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare change jsonb;merged jsonb;table_name text;quota jsonb;begin
  perform pg_advisory_xact_lock(20261010);quota:=public.server_storage_usage();
  if (quota->>'databaseBytes')::bigint+octet_length(changes::text)*3>=500000000 then raise exception 'Calendar sync quota reached';end if;
  if jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)>100 then raise exception 'Invalid calendar batch';end if;
  for change in select value from jsonb_array_elements(changes) loop
    table_name:=change->>'table';
    if table_name not in ('calendars','events') or change->>'userId'<>owner_id::text or coalesce(change->>'schemaVersion','')<>'1' then raise exception 'Invalid calendar owner or table';end if;
    execute format('select fields from public.%I where user_id=$1 and id=$2 for update',table_name) into merged using owner_id,change->>'entityId';
    merged:=public.merge_clock_fields(coalesce(merged,'{}'),change->'fields');
    if merged->'userId'->>'value'<>owner_id::text or merged->'id'->>'value'<>change->>'entityId' then raise exception 'Invalid calendar identity';end if;
    execute format('insert into public.%I(user_id,id,fields) values($1,$2,$3) on conflict(user_id,id) do update set fields=excluded.fields,updated_at=now()',table_name) using owner_id,change->>'entityId',merged;
    insert into public.sync_changes(user_id,change_id,payload) values(owner_id,change->>'id',change) on conflict(user_id,change_id) do nothing;
  end loop;
  perform public.notify_workspace(owner_id);
end$$;
revoke all on function public.apply_calendar_changes(uuid,jsonb) from public;
grant execute on function public.apply_calendar_changes(uuid,jsonb) to service_role;

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('202610100005','calendar_maintenance') ON CONFLICT(version) DO NOTHING;

-- 202610100006_health.sql
create function public.health_check() returns boolean language sql security definer set search_path=public,pg_temp as $$ select true $$;
revoke all on function public.health_check() from public;
grant execute on function public.health_check() to service_role;

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('202610100006','health') ON CONFLICT(version) DO NOTHING;

-- 202610100007_consistent_backups.sql
create function public.export_owner_data(owner_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb:='{}';name text;rows jsonb;begin
  foreach name in array array['pages','calendars','events','databases','page_doc_updates','page_doc_snapshots','page_versions','encrypted_doc_updates','attachments','user_settings'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(row)),''[]''::jsonb) from public.%I row where user_id=$1',name) into rows using owner_id;
    result:=jsonb_set(result,array[name],rows);
  end loop;return result;
end$$;
revoke all on function public.export_owner_data(uuid) from public;
grant execute on function public.export_owner_data(uuid) to service_role;

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('202610100007','consistent_backups') ON CONFLICT(version) DO NOTHING;

-- 202610100008_compaction_cas.sql
-- A second compactor must refetch when the snapshot it merged has changed.
drop function public.compact_page_document(uuid,text,text,text[]);
create function public.compact_page_document(owner_id uuid,page text,merged_update text,through_update_ids text[],expected_snapshot_cursor bigint default 0) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare next_cursor bigint; previous_cursor bigint; snapshot_change jsonb; locked boolean; snapshot_id text:='snapshot:'||gen_random_uuid(); begin
  perform pg_advisory_xact_lock(20261010);
  select coalesce((fields->'properties.__locked'->>'value')::boolean,false) into locked from public.pages where user_id=owner_id and id=page;
  if locked or not found then return false;end if;
  select through_cursor into previous_cursor from public.page_doc_snapshots where user_id=owner_id and page_id=page;
  if coalesce(previous_cursor,0)<>expected_snapshot_cursor then return false;end if;
  if cardinality(through_update_ids)>1000 or octet_length(merged_update)>1048576 then raise exception 'Compaction batch exceeds limit';end if;
  perform decode(merged_update,'base64');
  snapshot_change:=jsonb_build_object('id',snapshot_id,'userId',owner_id::text,'kind','document','entityId',page,'update',merged_update,'schemaVersion',1);
  insert into public.sync_changes(user_id,change_id,payload) values(owner_id,snapshot_id,snapshot_change) returning cursor into next_cursor;
  insert into public.page_doc_snapshots(user_id,page_id,update_base64,through_cursor) values(owner_id,page,merged_update,next_cursor) on conflict(user_id,page_id) do update set update_base64=excluded.update_base64,through_cursor=excluded.through_cursor,created_at=now();
  insert into public.page_versions(user_id,page_id,update_base64) values(owner_id,page,merged_update);
  delete from public.sync_changes where user_id=owner_id and payload->>'kind'='document' and payload->>'entityId'=page and (payload->>'id'=any(through_update_ids) or cursor=previous_cursor);
  delete from public.page_doc_updates where user_id=owner_id and page_id=page and id=any(through_update_ids);
  delete from public.page_versions where user_id=owner_id and page_id=page and created_at<now()-interval '30 days';
  perform public.notify_workspace(owner_id);
  return true;
end $$;
revoke all on function public.compact_page_document(uuid,text,text,text[],bigint) from public;
grant execute on function public.compact_page_document(uuid,text,text,text[],bigint) to service_role;

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('202610100008','compaction_cas') ON CONFLICT(version) DO NOTHING;

-- 202610100009_extension_search_path.sql
-- Managed Supabase installs pgcrypto in extensions; local PostgreSQL may use
-- public. Resolve the hash dependency in either layout without moving an
-- existing extension, replacing the RPC, or changing its ownership grants.
alter function public.push_changes(jsonb) set search_path = public, extensions, pg_temp;

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('202610100009','extension_search_path') ON CONFLICT(version) DO NOTHING;

-- 202610100010_attachment_idempotency.sql
-- Keep the public RPC parameter name used by clients while avoiding its clash
-- with the sync_changes.change_id column in the ON CONFLICT target.
create or replace function public.register_attachment(owner_id uuid,metadata jsonb,change_id text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb; begin
  perform pg_advisory_xact_lock(20261010);
  if metadata->>'user_id'<>owner_id::text or change_id<>'attachment:'||(metadata->>'id') or not exists(select 1 from public.pages where user_id=owner_id and id=metadata->>'page_id') then raise exception 'Invalid attachment identity';end if;
  if (metadata->>'bytes')::bigint>10485760 or metadata->>'path'<>owner_id::text||'/'||(metadata->>'id') then raise exception 'Invalid attachment size or path';end if;
  insert into public.attachments(user_id,id,page_id,path,bytes,mime,name,digest) values(owner_id,(metadata->>'id')::uuid,metadata->>'page_id',metadata->>'path',(metadata->>'bytes')::bigint,metadata->>'mime',metadata->>'name',metadata->>'digest') on conflict(user_id,id) do nothing;
  item:=jsonb_build_object('id',change_id,'userId',owner_id::text,'kind','attachment','entityId',metadata->>'page_id','schemaVersion',1,'attachment',jsonb_build_object('id',metadata->>'id','pageId',metadata->>'page_id','name',metadata->>'name','mime',metadata->>'mime','size',(metadata->>'bytes')::bigint,'createdAt',(select created_at from public.attachments where user_id=owner_id and id=(metadata->>'id')::uuid)));
  insert into public.sync_changes(user_id,change_id,payload) values(owner_id,change_id,item) on conflict on constraint sync_changes_user_id_change_id_key do nothing;
  perform public.notify_workspace(owner_id);
end $$;

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('202610100010','attachment_idempotency') ON CONFLICT(version) DO NOTHING;

-- 202610140001_permanent_deletion.sql
-- Retained deletion IDs prevent an offline client from resurrecting purged data.
create table public.permanent_deletions (
  user_id uuid not null references auth.users(id) on delete cascade,
  table_name text not null check(table_name in ('pages','databases','events')),
  entity_id text not null,
  primary key(user_id,table_name,entity_id)
);
alter table public.permanent_deletions enable row level security;
grant select on public.permanent_deletions to service_role;
create table public.purged_files (
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  primary key(user_id,path)
);
alter table public.purged_files enable row level security;
grant select,insert,delete on public.purged_files to service_role;

alter function public.push_changes(jsonb) rename to push_retained_changes;
revoke all on function public.push_retained_changes(jsonb) from public,authenticated;

create function public.purge_workspace_page(owner_id uuid,page text) returns void
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare page_ids text[]; item record; purge_payload jsonb; event_ids text[]; begin
  if owner_id is distinct from auth.uid() then raise exception 'Wrong owner' using errcode='42501'; end if;
  with recursive subtree(id) as (
    select page union
    select p.id from public.pages p join subtree s on p.fields->'parentId'->>'value'=s.id or p.fields->'databaseId'->>'value'=s.id where p.user_id=owner_id
  ) select array_agg(id) into page_ids from subtree;
  select coalesce(array_agg(id),'{}') into event_ids from public.events where user_id=owner_id and fields->'pageId'->>'value'=any(page_ids);
  insert into public.purged_files select user_id,path from public.attachments where user_id=owner_id and page_id=any(page_ids) on conflict do nothing;
  delete from public.attachments where user_id=owner_id and page_id=any(page_ids);
  delete from public.encrypted_doc_updates where user_id=owner_id and page_id=any(page_ids);
  -- Page bodies, snapshots and history have ON DELETE CASCADE foreign keys.
  delete from public.pages where user_id=owner_id and id=any(page_ids);
  delete from public.databases where user_id=owner_id and id=any(page_ids);
  delete from public.events where user_id=owner_id and id=any(event_ids);
  delete from public.sync_changes where user_id=owner_id and payload->>'kind'<>'setting' and
    (payload->>'entityId'=any(page_ids) or (payload->>'table'='events' and payload->>'entityId'=any(event_ids)));
  for item in select 'pages' as name,unnest(page_ids) as id union all select 'databases',unnest(page_ids) union all select 'events',unnest(event_ids) loop
    insert into public.permanent_deletions values(owner_id,item.name,item.id) on conflict do nothing;
    purge_payload:=jsonb_build_object('id','purge:'||item.name||':'||item.id,'userId',owner_id::text,'kind','purge','table',item.name,'entityId',item.id,'schemaVersion',1);
    insert into public.sync_changes(user_id,change_id,payload) values(owner_id,purge_payload->>'id',purge_payload) on conflict(user_id,change_id) do nothing;
  end loop;
end $$;
revoke all on function public.purge_workspace_page(uuid,text) from public;

create function public.push_changes(changes jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare owner_id uuid:=auth.uid(); change jsonb; stored_hash text; change_hash text; acknowledgments jsonb:='[]'; entity_table text; parent_id text; event_payload jsonb; begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(20261010);
  if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes)>200 or octet_length(changes::text)>2097152 then raise exception 'Invalid sync batch'; end if;
  for change in select value from jsonb_array_elements(changes) loop
    if change->>'userId' is distinct from owner_id::text then raise exception 'Wrong owner' using errcode='42501'; end if;
    if coalesce(change->>'schemaVersion','')<>'1' or length(coalesce(change->>'id','')) not between 1 and 160 or length(coalesce(change->>'entityId','')) not between 1 and 160 then raise exception 'Invalid sync record'; end if;
    change_hash:=encode(digest(change::text,'sha256'),'hex');
    select payload_hash into stored_hash from public.sync_receipts where user_id=owner_id and change_id=change->>'id';
    if found then
      if stored_hash<>change_hash then raise exception 'Idempotency key reused with different payload'; end if;
      acknowledgments:=acknowledgments||jsonb_build_array(change->>'id'); continue;
    end if;
    if change->>'kind'='purge' then
      if change->>'table' is distinct from 'pages' then raise exception 'Only pages can be purged'; end if;
      if not exists(select 1 from public.permanent_deletions where user_id=owner_id and table_name='pages' and entity_id=change->>'entityId') then
        if not exists(select 1 from public.pages where user_id=owner_id and id=change->>'entityId' and fields->'deletedAt'->>'value' is not null) then raise exception 'Only items in Trash can be deleted forever'; end if;
        perform public.purge_workspace_page(owner_id,change->>'entityId');
      end if;
    else
      entity_table:=case when change->>'kind'='entity' then change->>'table' else 'pages' end;
      if change->>'kind'<>'setting' and exists(select 1 from public.permanent_deletions where user_id=owner_id and table_name=entity_table and entity_id=change->>'entityId') then
        null; -- Acknowledge unchanged stale payloads without reintroducing their bytes.
      else
        parent_id:=null;
        if change->>'kind'='entity' and entity_table in ('pages','events') then
          select d.entity_id into parent_id from public.permanent_deletions d where d.user_id=owner_id and d.table_name='pages' and d.entity_id in (change->'fields'->'parentId'->>'value',change->'fields'->'databaseId'->>'value',change->'fields'->'pageId'->>'value') limit 1;
        end if;
        if parent_id is not null then
          if entity_table='pages' then
            perform public.purge_workspace_page(owner_id,change->>'entityId');
          else
            delete from public.events where user_id=owner_id and id=change->>'entityId';
            delete from public.sync_changes where user_id=owner_id and payload->>'table'='events' and payload->>'entityId'=change->>'entityId';
            insert into public.permanent_deletions values(owner_id,'events',change->>'entityId') on conflict do nothing;
            event_payload:=jsonb_build_object('id','purge:events:'||(change->>'entityId'),'userId',owner_id::text,'kind','purge','table','events','entityId',change->>'entityId','schemaVersion',1);
            insert into public.sync_changes(user_id,change_id,payload) values(owner_id,event_payload->>'id',event_payload) on conflict(user_id,change_id) do nothing;
          end if;
        else
          perform public.push_retained_changes(jsonb_build_array(change));
          acknowledgments:=acknowledgments||jsonb_build_array(change->>'id'); continue;
        end if;
      end if;
    end if;
    insert into public.sync_receipts values(owner_id,change->>'id',change_hash);
    acknowledgments:=acknowledgments||jsonb_build_array(change->>'id');
  end loop;
  perform public.notify_workspace(owner_id);
  return jsonb_build_object('acknowledged',acknowledgments);
end $$;
revoke all on function public.push_changes(jsonb) from public;
grant execute on function public.push_changes(jsonb) to authenticated;

create or replace function public.delete_my_cloud_data() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare owner uuid:=auth.uid(); name text; begin
  if owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(20261010);
  foreach name in array array['pages','calendars','events','databases','sync_changes','sync_receipts','encrypted_doc_updates','connected_accounts','calendar_oauth_requests','attachments','tags','user_settings','push_subscriptions','reminder_deliveries','tombstones','permanent_deletions','purged_files'] loop execute format('delete from public.%I where user_id=$1',name) using owner; end loop;
  perform public.notify_workspace(owner);
end $$;

INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('202610140001','permanent_deletion') ON CONFLICT(version) DO NOTHING;
COMMIT;
SELECT count(*) AS applied_migrations FROM supabase_migrations.schema_migrations WHERE version IN ('202610100001','202610100002','202610100003','202610100004','202610100005','202610100006','202610100007','202610100008','202610100009','202610100010','202610140001');
SELECT relname AS table_name, relrowsecurity AS rls_enabled FROM pg_class WHERE oid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r') ORDER BY relname;
