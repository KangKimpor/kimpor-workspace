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
