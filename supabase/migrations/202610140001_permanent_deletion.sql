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
        -- Offline purge carries the local Trash intent; its earlier soft-delete
        -- and page creation may never have reached the server.
        if change ? 'fields' then
          if jsonb_typeof(change->'fields') is distinct from 'object' or (change->'fields')-'deletedAt'<>'{}'::jsonb or jsonb_typeof(change->'fields'->'deletedAt'->'value') is distinct from 'string' then raise exception 'Invalid Trash intent'; end if;
          if (change->'fields'->'deletedAt'->>'value')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then raise exception 'Invalid Trash intent';end if;
          perform (change->'fields'->'deletedAt'->>'value')::timestamptz;
          perform public.merge_clock_fields('{}',change->'fields');
          if not exists(select 1 from public.pages where user_id=owner_id and id=change->>'entityId') and (public.storage_usage()->>'databaseBytes')::bigint+octet_length(change::text)*3>=500000000 then raise exception 'Cloud quota reached; deletion remains queued' using errcode='54000'; end if;
        elsif not exists(select 1 from public.pages where user_id=owner_id and id=change->>'entityId' and fields->'deletedAt'->>'value' is not null) then raise exception 'Only items in Trash can be deleted forever'; end if;
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
