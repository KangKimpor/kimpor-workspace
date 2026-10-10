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
