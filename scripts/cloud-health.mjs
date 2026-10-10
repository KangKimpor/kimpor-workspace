const url=new URL(process.env.KEEPALIVE_URL||'');
if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||url.username||url.password||url.pathname!=='/functions/v1/keepalive')throw new Error('Use your HTTPS Supabase keepalive endpoint');
if(!process.env.MAINTENANCE_SECRET)throw new Error('MAINTENANCE_SECRET is missing');
const response=await fetch(url,{method:'POST',headers:{'x-maintenance-secret':process.env.MAINTENANCE_SECRET},signal:AbortSignal.timeout(30000)});
if(!response.ok)throw new Error(`Cloud health check failed (${response.status})`);const result=await response.json();if(result.ok!==true)throw new Error('Unexpected health response');console.log('Cloud database responded to the daily health check.');
