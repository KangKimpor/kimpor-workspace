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
