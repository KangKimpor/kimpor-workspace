import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { compareClock } from "./clock";
import {
  WorkspaceStore,
  base64ToBytes,
  bytesToBase64,
  type SyncChange,
} from "./store";
import { markdownToDocument, documentToMarkdown, importCSV } from "./export";
import {
  encryptAttachment,
  decryptAttachment,
  encryptBytes,
  createRecoveryKey,
  currentEnvelope,
  rewrapPassphrase,
  decryptBytes,
} from "./crypto";
const instances: WorkspaceStore[] = [];
async function workspace(owner = "owner") {
  const store = new WorkspaceStore(`ops-${crypto.randomUUID()}`, owner);
  instances.push(store);
  await store.ready();
  return store;
}
afterEach(async () => {
  vi.useRealTimers();
  for (const store of instances.splice(0)) {
    await store.close();
    await store.db.delete();
  }
});
it("purges a subtree atomically, clears private bytes and rejects stale-device resurrection", async () => {
  const store = await workspace();
  const root = await store.createPage("database", "Purge project");
  const child = await store.createPage("row", "Private task", { parentId: root.id, databaseId: root.id });
  const kept = await store.createPage("note", "Keep this");
  await store.saveDatabase({ id: root.id, userId: store.accountId, properties: [], views: [], createdAt: root.createdAt, updatedAt: root.updatedAt, deletedAt: null });
  const calendar = await store.saveCalendar({ title: "Keep calendar" });
  await store.saveEvent({ calendarId: calendar.id, title: "Linked event", pageId: child.id });
  const doc = new Y.Doc(); doc.getText("body").insert(0, "Private body");
  await store.saveDoc(child.id, Y.encodeStateAsUpdate(doc)); doc.destroy();
  await store.saveAttachmentBytes(child.id, new TextEncoder().encode("Private file"), "private.txt");
  await store.saveEncryptedDoc(root.id, await encryptBytes(markdownToDocument("Private encrypted body"), "long purge passphrase", createRecoveryKey()));
  const before = await store.pendingChanges();
  const archive = await store.exportData();
  await store.trashPage(root.id);
  await expect(store.purgePages([root.id, kept.id])).rejects.toThrow("Only items in Trash");
  expect(store.listPages(true)).toHaveLength(3);
  await store.purgePages([root.id]);
  expect(store.listPages(true).map(page => page.id)).toEqual([kept.id]);
  expect(store.listDatabases()).toEqual([]);
  expect(store.listEvents()).toEqual([]);
  expect(store.listCalendars()).toHaveLength(1);
  const exported = JSON.parse(await store.exportData());
  for (const key of ["documents", "versions", "encryptedDocuments", "attachments"]) expect(exported[key]).toEqual([]);
  const queued = await store.pendingChanges();
  expect(queued.some(change => change.kind === "purge" && change.entityId === root.id)).toBe(true);
  const intent = queued.find(change => change.kind === "purge" && change.entityId === root.id)!;
  expect(Object.keys(intent.fields!)).toEqual(["deletedAt"]);
  expect(intent.fields!.deletedAt!.value).toEqual(expect.any(String));
  expect(intent.fields!.deletedAt!.clock).toMatchObject({ wall: expect.any(Number), node: expect.any(String) });
  expect(queued.some(change => change.kind !== "purge" && [root.id, child.id].includes(change.entityId))).toBe(false);
  await store.applyRemote(before, "1");
  expect(store.listPages(true).map(page => page.id)).toEqual([kept.id]);
  await expect(store.restorePage(root.id)).rejects.toThrow("permanently deleted");
  await expect(store.importData(archive)).rejects.toThrow("permanently deleted");
  await expect(store.applyRemote([{ id: "foreign-purge", userId: "other", kind: "purge", table: "pages", entityId: kept.id, schemaVersion: 1 }], "2")).rejects.toThrow("outside this account");
});
it("applies a remote purge to pending local descendants and retains it after reopen", async () => {
  const store = await workspace();
  const root = await store.createPage("note", "Root");
  const child = await store.createPage("note", "Offline child", { parentId: root.id });
  const stale = await store.pendingChanges();
  await store.applyRemote([{ id: "remote-purge", userId: store.accountId, kind: "purge", table: "pages", entityId: root.id, schemaVersion: 1 }], "1");
  expect(store.listPages(true)).toEqual([]);
  expect(await store.pendingChanges()).toEqual([]);
  await store.close();
  const reopened = new WorkspaceStore(store.db.name, store.accountId); instances.push(reopened);
  await reopened.ready();
  await reopened.applyRemote(stale, "2");
  expect(reopened.listPages(true)).toEqual([]);
  await expect(reopened.createPage("note", "New child", { parentId: child.id })).rejects.toThrow("Parent was permanently deleted");
});
it("keeps list edits detached from persisted pages and nested property values", async () => {
  const store = await workspace();
  await store.createPage("note", "Original", {
    tags: ["kept"],
    properties: { choices: ["one", "two"] },
  });
  const page = store.listPages()[0]!;
  page.title = "Unsaved";
  page.tags.push("unsaved");
  (page.properties.choices as string[]).push("three");
  expect(store.listPages()[0]).toMatchObject({
    title: "Original",
    tags: ["kept"],
    properties: { choices: ["one", "two"] },
  });
  const archive = JSON.parse(await store.exportData());
  expect(archive.entities[0].entity).toMatchObject({
    title: "Original",
    tags: ["kept"],
    properties: { choices: ["one", "two"] },
  });
});
it("saves complete calendar drafts, database schemas, restores trash and keeps field updates independent", async () => {
  const store = await workspace();
  const a = await store.createPage("page", "First"),
    b = await store.createPage("note", "Second", { parentId: a.id });
  expect(a.id).not.toBe(b.id);
  expect(store.listPages()).toHaveLength(2);
  await store.patchPage(a.id, { properties: { color: "blue", count: 3 } });
  await store.patchPage(a.id, {
    properties: {
      ...store.listPages().find((page) => page.id === a.id)?.properties,
      count: 4,
    },
  });
  expect(
    store.listPages().find((page) => page.id === a.id)?.properties,
  ).toMatchObject({ color: "blue", count: 4 });
  const calendar = await store.saveCalendar({
    id: undefined,
    title: "Personal",
  });
  expect(calendar.id).toBeTruthy();
  await store.saveCalendar({ id: calendar.id, title: "Updated" });
  expect(store.listCalendars()[0]?.title).toBe("Updated");
  const event = await store.saveEvent({
    id: undefined,
    title: "Meeting",
    calendarId: calendar.id,
    start: "2026-10-10T09:00:00Z",
    end: "2026-10-10T10:00:00Z",
  });
  expect(event.id).toBeTruthy();
  await store.saveEvent({ id: event.id, location: "Office" });
  expect(store.listEvents()[0]).toMatchObject({
    title: "Meeting",
    location: "Office",
  });
  await store.deleteEvent(event.id);
  expect(store.listEvents()).toHaveLength(0);
  const database = await importCSV(
    store,
    "Name,Status\r\nOne,Done\r\nTwo,Open",
    "Tasks",
  );
  const definition = store.listDatabases()[0]!;
  await store.saveDatabase({
    ...definition,
    properties: [
      ...definition.properties,
      { id: "score", name: "Score", type: "number" },
    ],
  });
  expect(
    store.listPages().filter((page) => page.databaseId === database.id),
  ).toHaveLength(2);
  expect(store.listDatabases()[0]?.properties).toHaveLength(3);
  await store.trashPage(b.id);
  expect(store.listPages().find((page) => page.id === b.id)).toBeUndefined();
  await store.restorePage(b.id);
  expect(store.listPages()).toHaveLength(5);
  await expect(store.patchPage("missing", { title: "x" })).rejects.toThrow();
});
it("restores a previous rich-text snapshot as a new edit without resurrecting deleted later content", async () => {
  const store = await workspace();
  const page = await store.createPage("note", "History");
  await store.saveDoc(page.id, markdownToDocument("First thought 中文"));
  const version = (await store.listVersions(page.id))[0]!;
  const doc = new Y.Doc();
  Y.applyUpdate(doc, (await store.loadDoc(page.id))!);
  const vector = Y.encodeStateVector(doc);
  const fragment = doc.getXmlFragment("default");
  fragment.delete(0, fragment.length);
  const p = new Y.XmlElement("paragraph"),
    text = new Y.XmlText();
  text.insert(0, "Later thought");
  p.insert(0, [text]);
  fragment.insert(0, [p]);
  await store.saveDoc(page.id, Y.encodeStateAsUpdate(doc, vector));
  expect(documentToMarkdown((await store.loadDoc(page.id))!)).toContain(
    "Later thought",
  );
  await store.restoreVersion(page.id, version.id);
  expect(documentToMarkdown((await store.loadDoc(page.id))!)).toContain(
    "First thought 中文",
  );
  expect(documentToMarkdown((await store.loadDoc(page.id))!)).not.toContain(
    "Later thought",
  );
  await expect(store.restoreVersion("missing")).rejects.toThrow(
    "Version not found",
  );
  doc.destroy();
});
it("merges settings by clock, excludes provider secrets from outbox and isolates local adoption and deletion", async () => {
  const a = await workspace("local"),
    b = await workspace("cloud");
  const p = await a.createPage("journal", "Local");
  await a.setSetting("appearance:theme", "dark");
  expect(await a.getSetting("appearance:theme", "system")).toBe("dark");
  await a.setSetting("provider:credential-local", { token: "test-only" });
  expect(
    (await a.pendingChanges()).some((change) =>
      change.key?.startsWith("provider:"),
    ),
  ).toBe(false);
  const change = (await a.pendingChanges()).find(
    (change) => change.kind === "setting",
  )!;
  await b.applyRemote([{ ...change, userId: "cloud" }], "10");
  expect(await b.getSetting("appearance:theme", "system")).toBe("dark");
  expect(await b.getCursor()).toBe("10");
  await b.applyRemote(
    [
      {
        ...change,
        userId: "cloud",
        value: "light",
        clock: { ...change.clock!, wall: 0 },
      },
    ],
    "11",
  );
  expect(await b.getSetting("appearance:theme", "system")).toBe("dark");
  await a.bindAccount("cloud", { adoptLocal: true });
  expect(a.listPages()[0]?.id).toBe(p.id);
  await a.clearAll();
  expect(a.listPages()).toHaveLength(0);
  await a.bindAccount("local");
  expect(a.listPages()[0]?.id).toBe(p.id);
  expect(await a.getSetting("unknown", 42)).toBe(42);
  await expect(a.setSetting("__proto__", true)).rejects.toThrow();
});
it("keeps files owner-scoped, round-trips their ciphertext and rejects tampering and replacement", async () => {
  const a = await workspace(),
    b = await workspace();
  const page = await a.createPage("note", "Files");
  const id = crypto.randomUUID(),
    plain = new TextEncoder().encode("Private photograph metadata 中文");
  const encrypted = await encryptAttachment(plain, id);
  const file = await a.saveAttachment(
    page.id,
    new Blob([new Uint8Array(encrypted.bytes).buffer], {
      type: "application/octet-stream",
    }),
    "Encrypted attachment",
    id,
  );
  const changes = await a.pendingChanges();
  await b.applyRemote(changes, "1");
  expect(
    await decryptAttachment(
      (await b.getAttachment(id))!.bytes,
      encrypted.key,
      encrypted.iv,
      id,
    ),
  ).toEqual(plain);
  await expect(
    decryptAttachment(file.bytes, encrypted.key, encrypted.iv, "different-id"),
  ).rejects.toThrow();
  const damaged = file.bytes.slice();
  damaged[0]! ^= 1;
  await expect(
    decryptAttachment(damaged, encrypted.key, encrypted.iv, id),
  ).rejects.toThrow();
  await expect(
    decryptAttachment(file.bytes, encrypted.key, "AA==", id),
  ).rejects.toThrow("nonce");
  await b.bindAccount("other");
  expect(await b.getAttachment(id)).toBeNull();
  await b.bindAccount("owner");
  await b.deleteAttachment(id);
  expect(await b.listAttachments(page.id)).toHaveLength(0);
  await expect(
    a.saveAttachment("missing", new Blob(["x"]), "x"),
  ).rejects.toThrow();
});
it("adopts encrypted documents without stealing the local account outbox and keeps recovery resets durable", async () => {
  const store = await workspace("local");
  const page = await store.createPage("journal", "Encrypted");
  const recovery = createRecoveryKey(),
    envelope = await encryptBytes(
      markdownToDocument("A private memory"),
      "passphrase original",
      recovery,
    );
  await store.saveEncryptedDoc(page.id, envelope);
  const localIds = (await store.pendingChanges()).map((change) => change.id);
  await store.bindAccount("cloud", { adoptLocal: true });
  await store.bindAccount("local");
  expect((await store.pendingChanges()).map((change) => change.id)).toEqual(
    localIds,
  );
  await store.bindAccount("cloud");
  const changed = await rewrapPassphrase(
    envelope,
    recovery,
    "passphrase changed",
  );
  await store.saveEncryptedDoc(page.id, changed);
  expect(
    documentToMarkdown(
      await decryptBytes(
        currentEnvelope(await store.loadEncryptedDocs(page.id)),
        "passphrase changed",
      ),
    ),
  ).toContain("A private memory");
  await expect(
    store.saveDoc(page.id, markdownToDocument("plaintext")),
  ).rejects.toThrow("Unlock");
  expect(await store.loadEncryptedDoc(page.id)).not.toBeNull();
});
it("validates imported binaries and foreign/schema changes before making any writes", async () => {
  const store = await workspace();
  const page = await store.createPage("page", "Original");
  const baseline = await store.exportData();
  expect(() => base64ToBytes("bad!")).toThrow();
  expect(base64ToBytes(bytesToBase64(new Uint8Array([0, 255])))).toEqual(
    new Uint8Array([0, 255]),
  );
  for (const change of [
    {
      id: "x",
      userId: "owner",
      entityId: page.id,
      schemaVersion: 2,
      kind: "document",
    },
    {
      id: "x",
      userId: "owner",
      entityId: page.id,
      schemaVersion: 1,
      kind: "unknown",
    },
    {
      id: "x",
      userId: "owner",
      entityId: page.id,
      schemaVersion: 1,
      kind: "entity",
      table: "foreign",
      fields: {},
    },
    {
      id: "x",
      userId: "owner",
      entityId: page.id,
      schemaVersion: 1,
      kind: "setting",
      key: "provider:secret",
      clock: { wall: 1, counter: 0, node: "n" },
    },
  ])
    await expect(
      store.applyRemote([change as SyncChange], "100"),
    ).rejects.toThrow();
  for (const edit of [
    (archive: Record<string, unknown>) => {
      archive.format = "wrong";
    },
    (archive: Record<string, unknown>) => {
      archive.documents = [{ pageId: page.id, update: "not-yjs" }];
    },
    (archive: Record<string, unknown>) => {
      archive.attachments = [
        {
          id: "file",
          pageId: page.id,
          name: "x",
          mime: "text/plain",
          size: 99,
          createdAt: new Date().toISOString(),
          bytes: "eA==",
        },
      ];
    },
    (archive: Record<string, unknown>) => {
      archive.encryptedDocuments = [
        {
          id: "shard",
          pageId: page.id,
          createdAt: new Date().toISOString(),
          envelope: { version: 9 },
        },
      ];
    },
  ]) {
    const archive = JSON.parse(baseline);
    edit(archive);
    await expect(store.importData(JSON.stringify(archive))).rejects.toThrow();
    expect(store.listPages()).toHaveLength(1);
    expect(await store.getCursor()).toBeNull();
  }
});

it("imports duplicate entities and document deltas in order, retaining owner isolation and monotonic sync metadata", async () => {
  const source = await workspace("source");
  const page = await source.createPage("note", "First", { properties: { removed: "old" } });
  const doc = new Y.Doc();
  doc.getText("body").insert(0, "English ");
  await source.saveDoc(page.id, Y.encodeStateAsUpdate(doc));
  const baseArchive = JSON.parse(await source.exportData());
  const archive = structuredClone(baseArchive);
  archive.entities.push({ table: "pages", entity: { ...page, title: "Last", properties: { color: "blue" } } });
  const vector = Y.encodeStateVector(doc);
  doc.getText("body").insert(doc.getText("body").length, "ខ្មែរ 中文");
  archive.documents.push({ pageId: page.id, update: bytesToBase64(Y.encodeStateAsUpdate(doc, vector)) });
  archive.versions.push({ ...archive.versions[0], update: bytesToBase64(Y.encodeStateAsUpdate(doc)) });
  const target = await workspace("foreign");
  await target.importData(JSON.stringify(baseArchive));
  await target.patchPage(page.id, { title: "Foreign" });
  await target.bindAccount("owner");
  const remoteClock = { wall: Date.now() + 86_400_000, counter: 9, node: "other" };
  await target.db.table("meta").put({ key: "clock:owner", value: remoteClock });
  await target.db.table("meta").put({ key: "queue:owner", value: 9 });
  await target.importData(JSON.stringify(archive));
  expect(target.listPages()[0]).toMatchObject({ title: "Last", userId: "owner", properties: { color: "blue", removed: null } });
  const restored = new Y.Doc();
  Y.applyUpdate(restored, (await target.loadDoc(page.id))!);
  expect(restored.getText("body").toString()).toBe("English ខ្មែរ 中文");
  const queued = await target.pendingChanges();
  expect(queued.map(change => change.kind)).toEqual(["entity", "entity", "document", "document"]);
  expect(queued.every(change => change.userId === "owner")).toBe(true);
  const firstClock = queued[0]!.fields!.id!.clock;
  const lastClock = queued[1]!.fields!.id!.clock;
  expect(compareClock(firstClock, remoteClock)).toBeGreaterThan(0);
  expect(compareClock(lastClock, firstClock)).toBeGreaterThan(0);
  expect((await target.db.table("meta").get("clock:owner")).value).toEqual(lastClock);
  expect((await target.listVersions(page.id)).find(version => version.id === archive.versions[0].id)?.update).toEqual(Y.encodeStateAsUpdate(doc));
  await target.patchPage(page.id, { title: "Next" });
  const orders = (await target.db.table("outbox").where("userId").equals("owner").toArray()).map(record => record.order).sort((a, b) => a - b);
  expect(orders).toEqual([10, 11, 12, 13, 14]);
  const next = (await target.pendingChanges()).at(-1)!;
  expect(compareClock(next.fields!.id!.clock, lastClock)).toBeGreaterThan(0);
  await target.bindAccount("foreign");
  expect(target.listPages()[0]?.title).toBe("Foreign");
  doc.destroy(); restored.destroy();
});

it("rolls back bulk import after protected-document rejection or a late storage failure", async () => {
  const source = await workspace("source");
  const page = await source.createPage("note", "Imported title");
  const doc = new Y.Doc(); doc.getText("body").insert(0, "Plain body");
  await source.saveDoc(page.id, Y.encodeStateAsUpdate(doc));
  const archive = await source.exportData();
  const target = await workspace();
  await target.importData(archive);
  await target.saveEncryptedDoc(page.id, await encryptBytes(Y.encodeStateAsUpdate(doc), "long passphrase", createRecoveryKey()));
  const tables = ["entities", "documents", "versions", "encryptedDocuments", "attachments", "outbox", "meta"];
  const snapshot = () => Promise.all(tables.map(table => target.db.table(table).toArray()));
  const protectedBefore = await snapshot();
  await expect(target.importData(archive)).rejects.toThrow("Unlock this page");
  expect(await snapshot()).toEqual(protectedBefore);
  expect(target.listPages()[0]?.properties.__locked).toBe(true);
  expect(target.listPages()[0]?.properties.__text).toBeUndefined();
  await target.bindAccount("empty");
  const beforeFailure = await snapshot();
  const fail = vi.spyOn(target.db.table("outbox"), "bulkPut").mockRejectedValueOnce(new DOMException("Storage full", "QuotaExceededError"));
  await expect(target.importData(archive)).rejects.toThrow("Storage full");
  fail.mockRestore();
  expect(await snapshot()).toEqual(beforeFailure);
  expect(target.listPages()).toEqual([]);
  const documents = target.db.table("documents");
  const bulkPut = documents.bulkPut.bind(documents);
  let switching: Promise<void> | undefined;
  const switchAccount = vi.spyOn(documents, "bulkPut").mockImplementationOnce(items => {
    switching = target.bindAccount("switched");
    void switching.catch(() => undefined);
    return bulkPut(items);
  });
  await expect(target.importData(archive)).rejects.toThrow("Account changed during import");
  switchAccount.mockRestore();
  await switching?.catch(() => undefined);
  expect(await snapshot()).toEqual(beforeFailure);
  expect(target.listPages()).toEqual([]);
  doc.destroy();
});

it("adopts cache additions and merges text without replacing account fields or protected bodies", async () => {
  const cache = await workspace("local");
  const shared = await cache.createPage("note", "Old title");
  const base = new Y.Doc(); base.getText("body").insert(0, "Base ");
  await cache.saveDoc(shared.id, Y.encodeStateAsUpdate(base));
  const firstArchive = await cache.exportData();
  const account = await workspace();
  await account.importData(firstArchive);
  await account.patchPage(shared.id, { title: "Account title", properties: { status: "Current" } });
  await account.setSetting("theme", "dark");
  const cloudDoc = new Y.Doc(); Y.applyUpdate(cloudDoc, Y.encodeStateAsUpdate(base));
  cloudDoc.getText("body").insert(0, "Account ");
  await account.saveDoc(shared.id, Y.encodeStateAsUpdate(cloudDoc));
  base.getText("body").insert(base.getText("body").length, "Cache");
  await cache.saveDoc(shared.id, Y.encodeStateAsUpdate(base));
  await cache.createPage("note", "New note");
  await cache.setSetting("theme", "light");
  await account.mergeCacheArchive(await cache.exportData());
  expect(account.listPages().find(page => page.id === shared.id)).toMatchObject({ title: "Account title", properties: { status: "Current" } });
  expect(account.listPages()).toHaveLength(2);
  expect(await account.getSetting("theme", "system")).toBe("dark");
  const merged = new Y.Doc(); Y.applyUpdate(merged, (await account.loadDoc(shared.id))!);
  expect(merged.getText("body").toString()).toBe("Account Base Cache");
  const envelope = await encryptBytes(Y.encodeStateAsUpdate(merged), "long passphrase", createRecoveryKey());
  await account.saveEncryptedDoc(shared.id, envelope);
  await account.mergeCacheArchive(await cache.exportData());
  expect(await account.loadDoc(shared.id)).toBeNull();
  expect(await account.listVersions(shared.id)).toHaveLength(0);
  expect((await account.loadEncryptedDocs(shared.id)).length).toBeGreaterThan(0);
  base.destroy(); cloudDoc.destroy(); merged.destroy();
});
