create or replace function public.purge_workspace_page(owner_id uuid,page text) returns void
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare page_ids text[]; item record; purge_payload jsonb; begin
  if owner_id is distinct from auth.uid() then raise exception 'Wrong owner' using errcode='42501'; end if;
  with recursive subtree(id) as (
    select page union
    select p.id from public.pages p join subtree s on p.fields->'parentId'->>'value'=s.id or p.fields->'databaseId'->>'value'=s.id where p.user_id=owner_id
  ) select array_agg(id) into page_ids from subtree;
  insert into public.purged_files select user_id,path from public.attachments where user_id=owner_id and page_id=any(page_ids) on conflict do nothing;
  delete from public.attachments where user_id=owner_id and page_id=any(page_ids);
  delete from public.encrypted_doc_updates where user_id=owner_id and page_id=any(page_ids);
  -- Page bodies, snapshots and history have ON DELETE CASCADE foreign keys.
  delete from public.pages where user_id=owner_id and id=any(page_ids);
  delete from public.databases where user_id=owner_id and id=any(page_ids);
  delete from public.sync_changes where user_id=owner_id and payload->>'kind'<>'setting' and
    (payload->>'entityId'=any(page_ids)) and (payload->>'kind'<>'entity' or payload->>'table' in ('pages','databases'));
  for item in select 'pages' as name,unnest(page_ids) as id union all select 'databases',unnest(page_ids) loop
    insert into public.permanent_deletions values(owner_id,item.name,item.id) on conflict do nothing;
    purge_payload:=jsonb_build_object('id','purge:'||item.name||':'||item.id,'userId',owner_id::text,'kind','purge','table',item.name,'entityId',item.id,'schemaVersion',1);
    insert into public.sync_changes(user_id,change_id,payload) values(owner_id,purge_payload->>'id',purge_payload) on conflict(user_id,change_id) do nothing;
  end loop;
end $$;
revoke all on function public.purge_workspace_page(uuid,text) from public;
create or replace function public.push_changes(changes jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare owner_id uuid:=auth.uid(); change jsonb; stored_hash text; change_hash text; acknowledgments jsonb:='[]'; entity_table text; parent_id text; begin
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
      if change ? 'fields' or change->>'table' is distinct from 'pages' then raise exception 'Only pages can be purged'; end if;
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
        if change->>'kind'='entity' and entity_table='pages' then
          select d.entity_id into parent_id from public.permanent_deletions d where d.user_id=owner_id and d.table_name='pages' and d.entity_id in (change->'fields'->'parentId'->>'value',change->'fields'->'databaseId'->>'value') limit 1;
        end if;
        if parent_id is not null then
          perform public.purge_workspace_page(owner_id,change->>'entityId');
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


-- The server's merged Trash state wins over a stale client's deletion intent.
create function public.purge_entities(items jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare owner_id uuid:=auth.uid(); item jsonb; accepted jsonb:='[]'; refused jsonb:='[]'; stored_hash text; payload_hash text; begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(20261010);
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items)>200 or octet_length(items::text)>2097152 then raise exception 'Invalid purge batch'; end if;
  for item in select value from jsonb_array_elements(items) loop
    if item->>'userId' is distinct from owner_id::text then raise exception 'Wrong owner' using errcode='42501'; end if;
    if item->>'kind' is distinct from 'purge' or item->>'table' is distinct from 'pages' or item->>'schemaVersion' is distinct from '1' or item ? 'fields' or length(coalesce(item->>'id','')) not between 1 and 160 or length(coalesce(item->>'entityId','')) not between 1 and 160 then raise exception 'Invalid purge record'; end if;
    payload_hash:=encode(digest(item::text,'sha256'),'hex');
    select r.payload_hash into stored_hash from public.sync_receipts r where user_id=owner_id and change_id=item->>'id';
    if found then
      if stored_hash<>payload_hash then raise exception 'Idempotency key reused with different payload'; end if;
    elsif exists(select 1 from public.permanent_deletions where user_id=owner_id and table_name='pages' and entity_id=item->>'entityId') then
      insert into public.sync_receipts values(owner_id,item->>'id',payload_hash);
    elsif exists(select 1 from public.pages where user_id=owner_id and id=item->>'entityId' and fields->'deletedAt'->>'value' is not null) then
      perform public.purge_workspace_page(owner_id,item->>'entityId');
      insert into public.sync_receipts values(owner_id,item->>'id',payload_hash);
    else
      refused:=refused||jsonb_build_array(item->>'id'); continue;
    end if;
    accepted:=accepted||jsonb_build_array(item->>'id');
  end loop;
  perform public.notify_workspace(owner_id);
  return jsonb_build_object('acknowledged',accepted,'refused',refused);
end $$;
revoke all on function public.purge_entities(jsonb) from public;
grant execute on function public.purge_entities(jsonb) to authenticated;
grant select on public.permanent_deletions to authenticated;
create policy deletion_owner on public.permanent_deletions for select to authenticated using((select auth.uid())=user_id);
