import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
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
