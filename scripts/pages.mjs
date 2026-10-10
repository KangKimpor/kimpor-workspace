import { mkdir, readFile, writeFile } from 'node:fs/promises';
const root = process.env.VELORADESK_DIST ?? 'apps/web/dist';
let html = await readFile(`${root}/index.html`, 'utf8');
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; object-src 'none'; base-uri 'self'";
html = html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${csp}"/>`);
await writeFile(`${root}/index.html`, html);
await writeFile(`${root}/404.html`, html);
await writeFile(`${root}/.nojekyll`, '');
for (const route of ['today', 'calendar', 'notes', 'journal', 'workspace', 'settings', 'design', 'spikes/editor']) {
  await mkdir(`${root}/${route}`, { recursive: true });
  await writeFile(`${root}/${route}/index.html`, html);
}
