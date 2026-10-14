begin;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.push_changes('[{"id":"purge-root-create","userId":"11111111-1111-4111-8111-111111111111","kind":"entity","table":"pages","entityId":"purge-root","schemaVersion":1,"fields":{"title":{"value":"Private project","clock":{"wall":100,"counter":0,"node":"one"}}}},{"id":"purge-child-create","userId":"11111111-1111-4111-8111-111111111111","kind":"entity","table":"pages","entityId":"purge-child","schemaVersion":1,"fields":{"parentId":{"value":"purge-root","clock":{"wall":100,"counter":0,"node":"one"}},"databaseId":{"value":"purge-root","clock":{"wall":100,"counter":0,"node":"one"}}}}]');
do $$declare denied boolean:=false;begin
  begin perform public.push_changes('[{"id":"purge-live","userId":"11111111-1111-4111-8111-111111111111","kind":"purge","table":"pages","entityId":"purge-root","schemaVersion":1}]'); exception when raise_exception then denied:=SQLERRM='Only items in Trash can be deleted forever';end;
  if not denied or (select count(*) from public.pages where id in ('purge-root','purge-child'))<>2 then raise exception 'Live purge validation failed';end if;
  begin perform public.push_retained_changes('[]');raise exception 'Old writer is accessible';exception when insufficient_privilege then null;end;
end$$;
reset role;
insert into public.page_doc_updates(user_id,id,page_id,update_base64) values('11111111-1111-4111-8111-111111111111','purge-doc','purge-child','AAA=');
insert into public.encrypted_doc_updates(user_id,id,page_id,envelope) values('11111111-1111-4111-8111-111111111111','purge-encrypted','purge-child','{}');
insert into public.page_versions(user_id,page_id,update_base64) values('11111111-1111-4111-8111-111111111111','purge-child','AAA=');
insert into public.attachments(user_id,id,page_id,path,bytes,mime,name,digest) values('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','purge-child','11111111-1111-4111-8111-111111111111/purge-file',4,'text/plain','Private file','fixture');
insert into public.databases(user_id,id) values('11111111-1111-4111-8111-111111111111','purge-root');
insert into public.events(user_id,id,fields) values('11111111-1111-4111-8111-111111111111','purge-event','{"pageId":{"value":"purge-child","clock":{"wall":100,"counter":0,"node":"one"}}}');
insert into public.pages(user_id,id) values('22222222-2222-4222-8222-222222222222','purge-root');
set role authenticated;
select public.push_changes('[{"id":"purge-trash","userId":"11111111-1111-4111-8111-111111111111","kind":"entity","table":"pages","entityId":"purge-root","schemaVersion":1,"fields":{"deletedAt":{"value":"2026-10-14T00:00:00Z","clock":{"wall":200,"counter":0,"node":"one"}}}}]');
select public.push_changes('[{"id":"purge-confirm","userId":"11111111-1111-4111-8111-111111111111","kind":"purge","table":"pages","entityId":"purge-root","schemaVersion":1}]');
select public.push_changes('[{"id":"purge-confirm","userId":"11111111-1111-4111-8111-111111111111","kind":"purge","table":"pages","entityId":"purge-root","schemaVersion":1}]');
-- Both old IDs and newly-created offline children must remain deleted.
select public.push_changes('[{"id":"purge-stale","userId":"11111111-1111-4111-8111-111111111111","kind":"entity","table":"pages","entityId":"purge-child","schemaVersion":1,"fields":{"title":{"value":"Stale secret","clock":{"wall":999,"counter":0,"node":"offline"}}}},{"id":"purge-new-child","userId":"11111111-1111-4111-8111-111111111111","kind":"entity","table":"pages","entityId":"purge-offline","schemaVersion":1,"fields":{"parentId":{"value":"purge-root","clock":{"wall":999,"counter":0,"node":"offline"}}}}]');
select public.push_changes('[{"id":"purge-new-event","userId":"11111111-1111-4111-8111-111111111111","kind":"entity","table":"events","entityId":"purge-offline-event","schemaVersion":1,"fields":{"pageId":{"value":"purge-child","clock":{"wall":999,"counter":0,"node":"offline"}}}}]');
do $$begin
  if exists(select 1 from public.pages where id like 'purge-%') or exists(select 1 from public.events where id in ('purge-event','purge-offline-event')) or exists(select 1 from public.databases where id='purge-root') then raise exception 'Purged entities resurrected';end if;
  if exists(select 1 from public.page_doc_updates where page_id='purge-child') or exists(select 1 from public.page_versions where page_id='purge-child') or exists(select 1 from public.encrypted_doc_updates where page_id='purge-child') or exists(select 1 from public.attachments where page_id='purge-child') then raise exception 'Private bytes survived';end if;
  if exists(select 1 from public.sync_changes where payload->>'entityId' like 'purge-%' and payload->>'kind'<>'purge') then raise exception 'Private sync payload survived';end if;
  if jsonb_array_length(public.pull_changes('0',200)->'changes')<4 then raise exception 'Deletion notifications missing';end if;
end$$;
reset role;
do $$begin
  if (select count(*) from public.purged_files)<>1 then raise exception 'Physical file cleanup was not queued';end if;
  if not exists(select 1 from public.pages where user_id='22222222-2222-4222-8222-222222222222' and id='purge-root') then raise exception 'Foreign page was deleted';end if;
end$$;
set role authenticated;
select public.delete_my_cloud_data();
reset role;
do $$begin
  if exists(select 1 from public.permanent_deletions where user_id='11111111-1111-4111-8111-111111111111') or exists(select 1 from public.purged_files where user_id='11111111-1111-4111-8111-111111111111') then raise exception 'Cloud reset retained purge metadata';end if;
end$$;
rollback;
select 'Permanent deletion, stale peers, private-byte cleanup and owner isolation passed' as result;
