import { readFile } from 'node:fs/promises';
const fixture = await readFile(process.env.BACKUP_FIXTURE_PATH, 'utf8');
globalThis.fetch = async () => new Response(fixture, { status: 200 });
