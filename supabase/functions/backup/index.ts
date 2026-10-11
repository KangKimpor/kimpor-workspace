import * as Y from 'npm:yjs@13.6.33';
import {database,encoded,env,HttpError,serve} from '../_shared/runtime.ts';
const decode=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
function encode(value:Uint8Array){let binary='';for(let i=0;i<value.length;i+=16384)binary+=String.fromCharCode(...value.subarray(i,i+16384));return btoa(binary);}
serve(async request=>{
  if(request.method!=='POST')throw new HttpError(405,'Use POST');
  const supplied=request.headers.get('x-backup-secret')??'',expected=env('BACKUP_SECRET');let difference=supplied.length^expected.length;for(let i=0;i<expected.length;i++)difference|=(supplied.charCodeAt(i)||0)^expected.charCodeAt(i);if(difference)throw new HttpError(401,'Invalid backup secret');
  const userId=env('BACKUP_OWNER_ID');if(!/^[a-f0-9-]{36}$/i.test(userId))throw new HttpError(500,'Backup owner is not configured');
  const snapshot=await database('rpc/export_owner_data',{method:'POST',body:JSON.stringify({owner_id:userId})}) as Record<string,Record<string,unknown>[]>;
  const read=(table:string)=>Promise.resolve(snapshot[table]??[]);
  const entities=[];for(const table of ['pages','calendars','events','databases'])for(const row of await read(table)){
    const fields=row.fields as Record<string,{value:unknown}>;const entity=Object.fromEntries(Object.entries(fields).filter(([key])=>!key.startsWith('properties.')).map(([key,field])=>[key,field.value]));
    if(table==='pages')entity.properties={...(entity.properties as Record<string,unknown>??{}),...Object.fromEntries(Object.entries(fields).filter(([key])=>key.startsWith('properties.')).map(([key,field])=>[key.slice(11),field.value]))};entities.push({table,entity});
  }
  const snapshots=await read('page_doc_snapshots'),updates=await read('page_doc_updates'),documents=[];
  for(const pageId of new Set([...snapshots,...updates].map(row=>String(row.page_id)))){const page=entities.find(entry=>entry.table==='pages'&&entry.entity.id===pageId);if((page?.entity.properties as Record<string,unknown>)?.__locked)continue;documents.push({pageId,update:encode(Y.mergeUpdates([...snapshots,...updates].filter(row=>row.page_id===pageId).map(row=>decode(String(row.update_base64)))))});}
  const attachments=[];let size=0;
  for(const file of await read('attachments')){
    if((size+=Number(file.bytes))>60_000_000)throw new HttpError(413,'Scheduled backup exceeds the JSON import limit. Use local full export instead.');
    const response=await fetch(`${env('SUPABASE_URL')}/storage/v1/object/attachments/${String(file.path).split('/').map(encoded).join('/')}`,{headers:{Authorization:`Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`,apikey:env('SUPABASE_SERVICE_ROLE_KEY')},signal:AbortSignal.timeout(25000)});if(!response.ok)throw new HttpError(503,'Could not read all backup files');
    attachments.push({id:file.id,pageId:file.page_id,name:file.name,mime:file.mime,size:Number(file.bytes),createdAt:file.created_at,bytes:encode(new Uint8Array(await response.arrayBuffer()))});
  }
  const versions=(await read('page_versions')).map(row=>({id:row.id,pageId:row.page_id,createdAt:row.created_at,update:row.update_base64}));
  const encryptedDocuments=(await read('encrypted_doc_updates')).map(row=>({id:row.id,pageId:row.page_id,createdAt:row.created_at,envelope:row.envelope}));
  const settings=(await read('user_settings')).flatMap(row=>Object.entries(row.fields as Record<string,{value:unknown}>).filter(([key])=>!key.startsWith('provider:')).map(([key,field])=>({key,value:field.value})));
  const body=JSON.stringify({format:'veloradesk',version:1,exportedAt:new Date().toISOString(),entities,documents,versions,encryptedDocuments,attachments,settings});
  if(body.length>100_000_000)throw new HttpError(413,'Scheduled backup exceeds the import limit. Use local full export instead.');
  return new Response(body,{headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
});
