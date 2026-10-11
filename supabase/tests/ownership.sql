begin;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.push_changes('[{"id":"create-page","userId":"11111111-1111-4111-8111-111111111111","kind":"entity","table":"pages","entityId":"page-one","schemaVersion":1,"fields":{"title":{"value":"My page","clock":{"wall":100,"counter":0,"node":"one"}},"userId":{"value":"11111111-1111-4111-8111-111111111111","clock":{"wall":100,"counter":0,"node":"one"}}}}]');
select public.push_changes('[{"id":"create-page","userId":"11111111-1111-4111-8111-111111111111","kind":"entity","table":"pages","entityId":"page-one","schemaVersion":1,"fields":{"title":{"value":"My page","clock":{"wall":100,"counter":0,"node":"one"}},"userId":{"value":"11111111-1111-4111-8111-111111111111","clock":{"wall":100,"counter":0,"node":"one"}}}}]');
do $$begin
  if (select count(*) from public.sync_changes)<>1 then raise exception 'Idempotency failed';end if;
  if (select fields->'title'->>'value' from public.pages where id='page-one')<>'My page' then raise exception 'Owned page missing';end if;
  begin insert into public.pages(id,user_id) values('direct','11111111-1111-4111-8111-111111111111');raise exception 'Direct insert succeeded';exception when insufficient_privilege then null;end;
  begin perform public.push_changes('[{"id":"foreign","userId":"22222222-2222-4222-8222-222222222222","kind":"entity","entityId":"page-one","table":"pages","schemaVersion":1,"fields":{}}]');raise exception 'Foreign push succeeded';exception when insufficient_privilege then null;end;
  begin perform count(*) from public.connected_accounts;raise exception 'Credentials readable';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$begin
 if (select count(*) from public.pages)<>0 then raise exception 'Another owner can read page';end if;
 if jsonb_array_length(public.pull_changes('0',200)->'changes')<>0 then raise exception 'Another owner can pull page';end if;
 begin perform public.push_changes('[{"id":"spoof","userId":"22222222-2222-4222-8222-222222222222","kind":"entity","table":"pages","entityId":"spoof","schemaVersion":1,"fields":{"userId":{"value":"11111111-1111-4111-8111-111111111111","clock":{"wall":200,"counter":0,"node":"two"}}}}]');raise exception 'Spoofed field owner succeeded';exception when insufficient_privilege then null;end;
end$$;
reset role;
insert into storage.objects(bucket_id,name,metadata) values('attachments','11111111-1111-4111-8111-111111111111/file', '{"size":12}');
set role authenticated;
do $$begin
 if (select count(*) from storage.objects)<>0 then raise exception 'Foreign storage readable';end if;
end$$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$begin
 if (select count(*) from storage.objects)<>1 then raise exception 'Owned file not readable';end if;
end$$;
select public.push_changes('[{"id":"doc-one","userId":"11111111-1111-4111-8111-111111111111","kind":"document","entityId":"page-one","schemaVersion":1,"update":"AAA="}]');
select public.push_changes('[{"id":"doc-two","userId":"11111111-1111-4111-8111-111111111111","kind":"document","entityId":"page-one","schemaVersion":1,"update":"AAA="}]');
reset role;
set role service_role;
do $$begin
 if not public.compact_page_document('11111111-1111-4111-8111-111111111111','page-one','AAA=',array['doc-one'],0) then raise exception 'First compaction rejected';end if;
 if public.compact_page_document('11111111-1111-4111-8111-111111111111','page-one','AAA=',array['doc-two'],0) then raise exception 'Stale compactor replaced snapshot';end if;
 if (select count(*) from public.page_doc_updates where id='doc-two')<>1 then raise exception 'Unmerged update was deleted';end if;
end$$;
reset role;
set role authenticated;
select public.push_changes('[{"id":"protect-one","userId":"11111111-1111-4111-8111-111111111111","kind":"entity","table":"pages","entityId":"page-one","schemaVersion":1,"fields":{"properties.__locked":{"value":true,"clock":{"wall":300,"counter":0,"node":"one"}}}}]');
do $$begin
 if (select count(*) from public.page_doc_updates)<>0 then raise exception 'Plaintext updates survived encryption';end if;
 if exists(select 1 from public.sync_changes where payload->>'kind'='document') then raise exception 'Plaintext sync logs survived encryption';end if;
end$$;
select public.push_changes('[{"id":"stale-doc","userId":"11111111-1111-4111-8111-111111111111","kind":"document","entityId":"page-one","schemaVersion":1,"update":"AAA="}]');
select public.push_changes('[{"id":"encrypted-one","userId":"11111111-1111-4111-8111-111111111111","kind":"encrypted-document","entityId":"page-one","schemaVersion":1,"envelope":{"ciphertext":"fixture-one"}},{"id":"encrypted-two","userId":"11111111-1111-4111-8111-111111111111","kind":"encrypted-document","entityId":"page-one","schemaVersion":1,"envelope":{"ciphertext":"fixture-two"}},{"id":"encrypted-merged","userId":"11111111-1111-4111-8111-111111111111","kind":"encrypted-document","entityId":"page-one","schemaVersion":1,"supersedes":["encrypted-one"],"envelope":{"ciphertext":"fixture-merged"}}]');
do $$begin
 if (select count(*) from public.page_doc_updates)<>0 then raise exception 'Stale client restored plaintext';end if;
 if exists(select 1 from public.encrypted_doc_updates where id='encrypted-one') then raise exception 'Known encrypted shard was retained';end if;
 if not exists(select 1 from public.encrypted_doc_updates where id='encrypted-two') then raise exception 'Unseen encrypted shard was deleted';end if;
 if exists(select 1 from public.sync_changes where change_id='encrypted-one') then raise exception 'Superseded ciphertext survived in the sync log';end if;
end$$;
reset role;
set role service_role;
do $$ declare
  metadata jsonb := '{"id":"33333333-3333-4333-8333-333333333333","user_id":"11111111-1111-4111-8111-111111111111","page_id":"page-one","path":"11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333","bytes":64,"mime":"application/octet-stream","name":"fixture.enc","digest":"fixture-digest"}';
  denied boolean := false;
begin
  perform public.register_attachment('11111111-1111-4111-8111-111111111111',metadata,'attachment:33333333-3333-4333-8333-333333333333');
  perform public.register_attachment('11111111-1111-4111-8111-111111111111',metadata,'attachment:33333333-3333-4333-8333-333333333333');
  if (select count(*) from public.attachments where id='33333333-3333-4333-8333-333333333333')<>1 then raise exception 'Attachment registration was not idempotent';end if;
  if (select count(*) from public.sync_changes where change_id='attachment:33333333-3333-4333-8333-333333333333')<>1 then raise exception 'Attachment sync receipt duplicated';end if;
  begin perform public.register_attachment('22222222-2222-4222-8222-222222222222',metadata,'attachment:33333333-3333-4333-8333-333333333333');
  exception when raise_exception then denied := SQLERRM='Invalid attachment identity';end;
  if not denied then raise exception 'Foreign attachment identity was accepted';end if;
end$$;
reset role;
insert into storage.objects(bucket_id,name,metadata) values('attachments','unverifiable','{}');
set role authenticated;
do $$begin
 begin perform public.storage_usage();raise exception 'Unknown file size was accepted';exception when sqlstate '55000' then null;end;
end$$;
rollback;
select 'Ownership, idempotency, encryption purge and quota tests passed' as result;
