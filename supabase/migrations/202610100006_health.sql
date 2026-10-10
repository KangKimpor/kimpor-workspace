create function public.health_check() returns boolean language sql security definer set search_path=public,pg_temp as $$ select true $$;
revoke all on function public.health_check() from public;
grant execute on function public.health_check() to service_role;
