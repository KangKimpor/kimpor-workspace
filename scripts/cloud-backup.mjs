import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
const encoded=process.env.BACKUP_ENCRYPTION_KEY||'';
if(!/^[a-f0-9]{64}$/i.test(encoded))throw new Error('BACKUP_ENCRYPTION_KEY must be a backed-up 32-byte hexadecimal key.');
const key=Buffer.from(encoded,'hex'),magic=Buffer.from('VELORABACKUP1');
const [mode='backup',path=mode==='decrypt'?'.private/restored-workspace.json':'backup/workspace.enc',input]=process.argv.slice(2);
await mkdir(dirname(path),{recursive:true,mode:0o700});
if(mode==='decrypt'){
  if(!input)throw new Error('Usage: node scripts/cloud-backup.mjs decrypt .private/workspace.json backup/workspace.enc');
  const file=await readFile(input);if(!file.subarray(0,magic.length).equals(magic))throw new Error('Unrecognized backup format');
  const decipher=createDecipheriv('aes-256-gcm',key,file.subarray(magic.length,magic.length+12));decipher.setAAD(magic);decipher.setAuthTag(file.subarray(magic.length+12,magic.length+28));
  const bytes=Buffer.concat([decipher.update(file.subarray(magic.length+28)),decipher.final()]);JSON.parse(bytes.toString('utf8'));await writeFile(path,bytes,{mode:0o600});console.log('Decrypted backup written locally. Import it through Kimpor Workspace Settings.');
}else if(mode==='backup'){
  const url=new URL(process.env.BACKUP_SOURCE_URL||'');if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||url.username||url.password||url.pathname!=='/functions/v1/backup')throw new Error('Use your HTTPS Supabase backup endpoint');
  const secret=process.env.BACKUP_SECRET;if(!secret)throw new Error('BACKUP_SECRET is missing');
  const response=await fetch(url,{method:'POST',headers:{'x-backup-secret':secret},signal:AbortSignal.timeout(120000)});if(!response.ok)throw new Error(`Backup failed (${response.status}); no new artifact was written.`);
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>100_000_000)throw new Error('Backup exceeds the import limit');const archive=JSON.parse(bytes.toString('utf8'));if(archive.format!=='veloradesk'||archive.version!==1)throw new Error('Invalid backup response');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(magic);const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);await writeFile(path,Buffer.concat([magic,iv,cipher.getAuthTag(),ciphertext]),{mode:0o600});console.log(`Encrypted backup created (${bytes.length} source bytes). No plaintext file was written.`);
}else throw new Error('Unknown backup mode');
key.fill(0);
