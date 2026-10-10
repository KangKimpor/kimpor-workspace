import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { WorkspaceStore, type SyncChange } from "./store";
import { SyncEngine, type SyncTransport } from "./sync";
import {
  createRecoveryKey,
  encryptBytes,
  encryptWithKey,
  decryptWithKey,
  unlockEnvelope,
} from "./crypto";
import {
  exportWorkspaceZip,
  importWorkspaceZip,
  importMarkdown,
  parseCSV,
} from "./export";
const clients: WorkspaceStore[] = [];
function client(owner = "owner") {
  const result = new WorkspaceStore(`test-${crypto.randomUUID()}`, owner);
  clients.push(result);
  return result;
}
afterEach(async () => {
  for (const instance of clients.splice(0)) {
    await instance.close();
    await instance.db.delete();
  }
});
class Server implements SyncTransport {
  log: SyncChange[] = [];
  private ids = new Map<string, string>();
  async push(user: string, changes: SyncChange[]) {
    for (const change of changes) {
      if (change.userId !== user) throw new Error("Wrong owner");
      const key = `${user}:${change.id}`;
      const payload = JSON.stringify(change);
      if (this.ids.has(key) && this.ids.get(key) !== payload)
        throw new Error("Reused id");
      if (!this.ids.has(key)) {
        this.log.push(structuredClone(change));
        this.ids.set(key, payload);
      }
    }
    return { acknowledged: changes.map((change) => change.id) };
  }
  async pull(user: string, cursor: string | null) {
    const offset = Number(cursor || 0);
    return {
      changes: this.log
        .slice(offset)
        .filter((change) => change.userId === user),
      cursor: String(this.log.length),
      hasMore: false,
    };
  }
}
function document(text: string) {
  const doc = new Y.Doc();
  doc.getText("text").insert(0, text);
  return doc;
}
describe("durable local-first workspace", () => {
  it("preserves concurrent disconnected records, properties and rich text on three clients", async () => {
    const server = new Server();
    const a = client(),
      b = client(),
      c = client();
    await Promise.all([a.ready(), b.ready(), c.ready()]);
    const engines = [a, b, c].map(
      (store) => new SyncEngine(store, server, () => true),
    );
    const page = await a.createPage("page", "Shared");
    const event = await a.saveEvent({
      title: "Meeting",
      location: "Home",
      start: "2026-03-07T14:00:00Z",
      end: "2026-03-07T15:00:00Z",
    });
    const base = document("base");
    await a.saveDoc(page.id, Y.encodeStateAsUpdate(base));
    await engines[0]!.run();
    await engines[1]!.run();
    await engines[2]!.run();
    const docs = await Promise.all(
      [a, b, c].map(async (store) => {
        const doc = new Y.Doc();
        Y.applyUpdate(doc, (await store.loadDoc(page.id))!);
        return doc;
      }),
    );
    docs[0]!.getText("text").insert(0, "English ");
    docs[1]!.getText("text").insert(0, "中文 ");
    docs[2]!.getText("text").insert(0, "ខ្មែរ ");
    await Promise.all([
      a.saveDoc(page.id, Y.encodeStateAsUpdate(docs[0]!)),
      b.saveDoc(page.id, Y.encodeStateAsUpdate(docs[1]!)),
      c.saveDoc(page.id, Y.encodeStateAsUpdate(docs[2]!)),
      a.patchPage(page.id, { properties: { status: "Done" } }),
      b.patchPage(page.id, { properties: { score: 42 } }),
      c.patchPage(page.id, { favorite: true }),
      a.saveEvent({ id: event.id, title: "New meeting" }),
      b.saveEvent({ id: event.id, location: "Office" }),
    ]);
    for (const engine of engines) await engine.run();
    for (const engine of engines) await engine.run();
    const texts = await Promise.all(
      [a, b, c].map(async (store) => {
        const doc = new Y.Doc();
        Y.applyUpdate(doc, (await store.loadDoc(page.id))!);
        const text = doc.getText("text").toString();
        doc.destroy();
        return text;
      }),
    );
    expect(new Set(texts).size).toBe(1);
    expect(texts[0]).toContain("English");
    expect(texts[0]).toContain("中文");
    expect(texts[0]).toContain("ខ្មែរ");
    for (const store of [a, b, c]) {
      expect(store.listPages()[0]?.properties).toMatchObject({
        status: "Done",
        score: 42,
      });
      expect(store.listPages()[0]?.favorite).toBe(true);
      expect(store.listEvents()[0]).toMatchObject({
        title: "New meeting",
        location: "Office",
      });
      expect(store.pendingCount()).toBe(0);
    }
    await a.trashPage(page.id);
    await b.patchPage(page.id, { favorite: false });
    for (const engine of engines) await engine.run();
    for (const engine of engines) await engine.run();
    for (const store of [a, b, c]) expect(store.listPages()).toHaveLength(0);
    base.destroy();
    docs.forEach((doc) => doc.destroy());
  });
  it("isolates accounts and rejects foreign pulls and malformed imports atomically", async () => {
    const workspace = client("first");
    await workspace.ready();
    const page = await workspace.createPage("note", "Private");
    const archive = await workspace.exportData();
    const changes = await workspace.pendingChanges();
    await expect(
      workspace.applyRemote([{ ...changes[0]!, userId: "second" }], "1"),
    ).rejects.toThrow();
    expect(workspace.listPages()[0]?.title).toBe("Private");
    const bad = JSON.parse(archive);
    bad.documents.push({ pageId: page.id, update: "not-valid" });
    await expect(workspace.importData(JSON.stringify(bad))).rejects.toThrow();
    expect(workspace.listPages()).toHaveLength(1);
    await workspace.bindAccount("second");
    expect(workspace.listPages()).toHaveLength(0);
    await workspace.bindAccount("first");
    expect(workspace.listPages()[0]?.title).toBe("Private");
  });
  it("retains all encrypted concurrent updates and removes plaintext histories and indexes", async () => {
    const server = new Server(),
      a = client(),
      b = client();
    await Promise.all([a.ready(), b.ready()]);
    const page = await a.createPage("journal", "Journal", {
      properties: { __text: "private body" },
    });
    const doc = document("private body");
    await a.saveDoc(page.id, Y.encodeStateAsUpdate(doc));
    const recovery = createRecoveryKey();
    const envelope = await encryptBytes(
      Y.encodeStateAsUpdate(doc),
      "a strong passphrase",
      recovery,
    );
    const key = await unlockEnvelope(envelope, "a strong passphrase");
    await a.saveEncryptedDoc(page.id, envelope);
    const engines = [a, b].map(
      (store) => new SyncEngine(store, server, () => true),
    );
    await engines[0]!.run();
    await engines[1]!.run();
    const left = new Y.Doc(),
      right = new Y.Doc();
    Y.applyUpdate(left, await decryptWithKey(envelope, key));
    Y.applyUpdate(right, await decryptWithKey(envelope, key));
    left.getText("text").insert(0, "left ");
    right.getText("text").insert(0, "right ");
    await a.saveEncryptedDoc(
      page.id,
      await encryptWithKey(Y.encodeStateAsUpdate(left), key, envelope),
    );
    await b.saveEncryptedDoc(
      page.id,
      await encryptWithKey(Y.encodeStateAsUpdate(right), key, envelope),
    );
    for (const engine of engines) await engine.run();
    for (const engine of engines) await engine.run();
    for (const store of [a, b]) {
      const merged = new Y.Doc();
      for (const shard of await store.loadEncryptedDocs(page.id))
        Y.applyUpdate(merged, await decryptWithKey(shard, key));
      expect(merged.getText("text").toString()).toContain("left");
      expect(merged.getText("text").toString()).toContain("right");
      expect(await store.loadDoc(page.id)).toBeNull();
      expect(await store.listVersions(page.id)).toHaveLength(0);
      expect(store.listPages()[0]?.properties.__text ?? null).toBeNull();
      expect(
        (await store.pendingChanges()).some(
          (change) => change.kind === "document",
        ),
      ).toBe(false);
      merged.destroy();
    }
    doc.destroy();
    left.destroy();
    right.destroy();
  });
  it("compacts only decrypted encrypted shards and preserves an unseen third client's edit", async () => {
    const server = new Server(),
      a = client(),
      b = client(),
      c = client();
    await Promise.all([a.ready(), b.ready(), c.ready()]);
    const page = await a.createPage("journal", "Private");
    const base = document("base ");
    const envelope = await encryptBytes(
      Y.encodeStateAsUpdate(base),
      "long passphrase",
      createRecoveryKey(),
    );
    const key = await unlockEnvelope(envelope, "long passphrase");
    await a.saveEncryptedDoc(page.id, envelope);
    const engines = [a, b, c].map(
      (store) => new SyncEngine(store, server, () => true),
    );
    for (const engine of engines) await engine.run();
    const offline = new Y.Doc();
    Y.applyUpdate(offline, await decryptWithKey(envelope, key));
    offline.getText("text").insert(0, "late third client ");
    const known = await a.loadEncryptedShards(page.id);
    const merged = new Y.Doc();
    for (const shard of known)
      Y.applyUpdate(merged, await decryptWithKey(shard.envelope, key));
    merged.getText("text").insert(0, "first client ");
    await a.saveEncryptedDoc(
      page.id,
      await encryptWithKey(Y.encodeStateAsUpdate(merged), key, envelope),
      known.map((shard) => shard.id),
    );
    expect(await a.loadEncryptedDocs(page.id)).toHaveLength(1);
    await engines[0]!.run();
    await engines[1]!.run();
    const second = new Y.Doc();
    const secondKnown = await b.loadEncryptedShards(page.id);
    for (const shard of secondKnown)
      Y.applyUpdate(second, await decryptWithKey(shard.envelope, key));
    second.getText("text").insert(0, "second client ");
    await b.saveEncryptedDoc(
      page.id,
      await encryptWithKey(Y.encodeStateAsUpdate(second), key, envelope),
      secondKnown.map((shard) => shard.id),
    );
    await c.saveEncryptedDoc(
      page.id,
      await encryptWithKey(Y.encodeStateAsUpdate(offline), key, envelope),
    );
    for (let pass = 0; pass < 2; pass++)
      for (const engine of engines) await engine.run();
    const all = await a.loadEncryptedShards(page.id);
    const final = new Y.Doc();
    for (const shard of all)
      Y.applyUpdate(final, await decryptWithKey(shard.envelope, key));
    await a.saveEncryptedDoc(
      page.id,
      await encryptWithKey(Y.encodeStateAsUpdate(final), key, envelope),
      all.map((shard) => shard.id),
    );
    for (let pass = 0; pass < 2; pass++)
      for (const engine of engines) await engine.run();
    const texts: string[] = [];
    for (const store of [a, b, c]) {
      expect(await store.loadEncryptedDocs(page.id)).toHaveLength(1);
      const result = new Y.Doc();
      for (const shard of await store.loadEncryptedDocs(page.id))
        Y.applyUpdate(result, await decryptWithKey(shard, key));
      texts.push(result.getText("text").toString());
      expect(texts.at(-1)).toContain("first client");
      expect(texts.at(-1)).toContain("second client");
      expect(texts.at(-1)).toContain("late third client");
      result.destroy();
    }
    expect(new Set(texts).size).toBe(1);
    for (const doc of [base, offline, merged, second, final]) doc.destroy();
  });
  it("exports and restores real documents and file bytes and rejects corrupt CSV", async () => {
    const source = client(),
      target = client();
    await Promise.all([source.ready(), target.ready()]);
    const page = await importMarkdown(
      source,
      "# Hello\n\nMixed 中文 ខ្មែរ",
      "Document",
    );
    await source.saveAttachment(
      page.id,
      new Blob(["file bytes"], { type: "text/plain" }),
      "memo.txt",
    );
    const zip = await exportWorkspaceZip(source);
    await importWorkspaceZip(target, zip);
    expect(target.listPages()[0]?.title).toBe("Document");
    expect(
      new TextDecoder().decode(
        (await target.listAttachments(page.id))[0]?.bytes,
      ),
    ).toBe("file bytes");
    expect(await target.loadDoc(page.id)).not.toBeNull();
    expect(() => parseCSV('title,value\n"unclosed,1')).toThrow();
  });
});
