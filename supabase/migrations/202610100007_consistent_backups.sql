create function public.export_owner_data(owner_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb:='{}';name text;rows jsonb;begin
  foreach name in array array['pages','calendars','events','databases','page_doc_updates','page_doc_snapshots','page_versions','encrypted_doc_updates','attachments','user_settings'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(row)),''[]''::jsonb) from public.%I row where user_id=$1',name) into rows using owner_id;
    result:=jsonb_set(result,array[name],rows);
  end loop;return result;
end$$;
revoke all on function public.export_owner_data(uuid) from public;
grant execute on function public.export_owner_data(uuid) to service_role;
