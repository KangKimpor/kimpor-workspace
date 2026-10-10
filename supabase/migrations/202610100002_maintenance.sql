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
