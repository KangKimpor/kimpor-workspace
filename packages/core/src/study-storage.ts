import Dexie, { type EntityTable } from 'dexie';
import * as Y from 'yjs';
const db = new Dexie('veloradesk-foundation-study') as Dexie & { drafts: EntityTable<{ id: string; update: Uint8Array<ArrayBuffer> }, 'id'> };
db.version(1).stores({ drafts: 'id' });
export async function loadStudy(): Promise<Uint8Array<ArrayBuffer> | undefined> { return (await db.drafts.get('editor'))?.update; }
// Transactions serialize saves from different tabs; a stale snapshot cannot
// overwrite a concurrent edit. This is a local spike, not cloud transport.
export async function saveStudy(update: Uint8Array<ArrayBufferLike>): Promise<void> {
  await db.transaction('rw', db.drafts, async () => {
    const existing = await db.drafts.get('editor');
    const merged = existing ? Y.mergeUpdates([existing.update, update]) : update;
    await db.drafts.put({ id: 'editor', update: new Uint8Array(merged) });
  });
}
