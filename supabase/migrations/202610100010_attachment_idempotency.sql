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
