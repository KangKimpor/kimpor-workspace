import Dexie, { liveQuery, type Table } from "dexie";
import * as Y from "yjs";
import { compareClock, tick, type Clock } from "./clock";
import { compareOrder, orderBetween } from "./order";
import type {
  Calendar,
  CalendarEvent,
  DatabaseDefinition,
  EntityTable,
  Page,
  PageType,
  PageVersion,
  WorkspaceEntity,
} from "./model";
import type { EncryptedEnvelope } from "./crypto";

export interface StampedValue {
  value: unknown;
  clock: Clock;
}
export interface SyncChange {
  id: string;
  userId: string;
  kind: "entity" | "document" | "encrypted-document" | "setting" | "attachment";
  entityId: string;
  table?: EntityTable;
  fields?: Record<string, StampedValue>;
  update?: string;
  envelope?: EncryptedEnvelope;
  supersedes?: string[];
  schemaVersion: 1;
  key?: string;
  value?: unknown;
  clock?: Clock;
  attachment?: Omit<Attachment, "userId" | "bytes"> & { bytes?: string };
}
interface EntityRecord {
  userId: string;
  table: EntityTable;
  id: string;
  fields: Record<string, StampedValue>;
  schemaVersion: 1;
}
interface DocRecord {
  userId: string;
  pageId: string;
  update: Uint8Array;
}
interface EncryptedDocRecord {
  userId: string;
  pageId: string;
  id: string;
  createdAt: string;
  envelope: EncryptedEnvelope;
}
export interface Attachment {
  id: string;
  userId: string;
  pageId: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
  bytes: Uint8Array;
}
interface VersionRecord extends PageVersion {
  userId: string;
}
interface OutboxRecord {
  id: string;
  userId: string;
  createdAt: number;
  order?: number;
  change: SyncChange;
}
interface MetaRecord {
  key: string;
  value: unknown;
}
interface WorkspaceArchive {
  format: "veloradesk";
  version: 1;
  exportedAt: string;
  entities: { table: EntityTable; entity: WorkspaceEntity }[];
  documents: { pageId: string; update: string }[];
  versions: { id: string; pageId: string; createdAt: string; update: string }[];
  encryptedDocuments?: Omit<EncryptedDocRecord, "userId">[];
  attachments?: {
    id: string;
    pageId: string;
    name: string;
    mime: string;
    size: number;
    createdAt: string;
    bytes: string;
  }[];
  settings?: { key: string; value: unknown }[];
}
const TABLES: EntityTable[] = ["pages", "calendars", "events", "databases"];
const PROTECTED = new Set([
  "id",
  "userId",
  "createdAt",
  "__proto__",
  "constructor",
  "prototype",
]);
const LIMIT = 10_000;
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 16_384)
    binary += String.fromCharCode(...bytes.subarray(i, i + 16_384));
  return btoa(binary);
}
export function base64ToBytes(encoded: string): Uint8Array {
  if (
    encoded.length > 40_000_000 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) ||
    encoded.length % 4 !== 0
  )
    throw new Error("Invalid document encoding");
  return Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
}
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function recordEntity(record: EntityRecord): WorkspaceEntity {
  const entity = Object.fromEntries(
    Object.entries(record.fields)
      .filter(([name]) => !name.startsWith("properties."))
      .map(([name, field]) => [name, field.value]),
  );
  if (record.table === "pages") {
    const properties = {
      ...(isRecord(entity.properties) ? entity.properties : {}),
    };
    for (const [name, field] of Object.entries(record.fields))
      if (name.startsWith("properties."))
        properties[name.slice(11)] = field.value;
    entity.properties = properties;
  }
  // Detach the complete result once. Cloning every primitive field separately
  // makes refreshing a large workspace block input without improving isolation.
  return structuredClone(entity) as unknown as WorkspaceEntity;
}
function recordProperties(
  record: EntityRecord | undefined,
): Page["properties"] {
  return record ? ((recordEntity(record) as Page).properties ?? {}) : {};
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validateFields(
  fields: unknown,
): asserts fields is Record<string, StampedValue> {
  if (!isRecord(fields) || Object.keys(fields).length > 100)
    throw new Error("Invalid fields");
  for (const [name, field] of Object.entries(fields)) {
    if (
      ["__proto__", "constructor", "prototype"].includes(name) ||
      [
        "properties.__proto__",
        "properties.constructor",
        "properties.prototype",
      ].includes(name) ||
      !isRecord(field) ||
      !isRecord(field.clock)
    )
      throw new Error("Invalid field");
    const c = field.clock;
    tick(String(c.node ?? ""), Date.now(), c as unknown as Clock);
    if (JSON.stringify(field.value)?.length > 2_000_000)
      throw new Error("Field exceeds the size limit");
  }
}
function validateEntity(
  table: EntityTable,
  entity: unknown,
): asserts entity is WorkspaceEntity {
  if (
    !isRecord(entity) ||
    typeof entity.id !== "string" ||
    !entity.id ||
    entity.id.length > 200
  )
    throw new Error("Invalid entity identity");
  if (
    typeof entity.createdAt !== "string" ||
    typeof entity.updatedAt !== "string" ||
    (entity.deletedAt !== null && typeof entity.deletedAt !== "string")
  )
    throw new Error("Invalid entity timestamps");
  if (
    table === "pages" &&
    (!["page", "note", "journal", "database", "row"].includes(
      String(entity.type),
    ) ||
      typeof entity.title !== "string" ||
      !Array.isArray(entity.tags) ||
      !isRecord(entity.properties))
  )
    throw new Error("Invalid page");
  if (
    (table === "events" || table === "calendars") &&
    typeof entity.title !== "string"
  )
    throw new Error("Invalid calendar record");
  if (
    table === "events" &&
    (typeof entity.calendarId !== "string" ||
      typeof entity.start !== "string" ||
      typeof entity.end !== "string" ||
      !Number.isFinite(Date.parse(entity.start)) ||
      !Number.isFinite(Date.parse(entity.end)) ||
      Date.parse(entity.end) < Date.parse(entity.start))
  )
    throw new Error("Invalid event range");
  if (
    table === "databases" &&
    (!Array.isArray(entity.properties) || !Array.isArray(entity.views))
  )
    throw new Error("Invalid database");
}
function validateUpdate(update: Uint8Array): void {
  const document = new Y.Doc();
  try {
    Y.applyUpdate(document, update);
  } finally {
    document.destroy();
  }
}
function validateEnvelope(
  envelope: unknown,
): asserts envelope is EncryptedEnvelope {
  if (
    !isRecord(envelope) ||
    envelope.version !== 1 ||
    envelope.algorithm !== "AES-GCM" ||
    !Number.isInteger(envelope.iterations) ||
    Number(envelope.iterations) < 310_000 ||
    Number(envelope.iterations) > 2_000_000
  )
    throw new Error("Invalid encrypted document");
  for (const field of [
    "salt",
    "iv",
    "ciphertext",
    "passwordIv",
    "passwordWrappedKey",
    "recoveryIv",
    "recoveryWrappedKey",
  ])
    if (typeof envelope[field] !== "string")
      throw new Error("Invalid encrypted document");
  if (
    base64ToBytes(envelope.iv as string).length !== 12 ||
    base64ToBytes(envelope.salt as string).length !== 16
  )
    throw new Error("Invalid encryption header");
}

/** IndexedDB is authoritative. Cached reads update through Dexie liveQuery in every tab. */
export class WorkspaceStore {
  readonly db: Dexie;
  private readonly entities: Table<EntityRecord, [string, EntityTable, string]>;
  private readonly documents: Table<DocRecord, [string, string]>;
  private readonly versions: Table<VersionRecord, [string, string]>;
  private readonly encryptedDocuments: Table<
    EncryptedDocRecord,
    [string, string, string]
  >;
  private readonly attachments: Table<Attachment, [string, string]>;
  private readonly outbox: Table<OutboxRecord, string>;
  private readonly meta: Table<MetaRecord, string>;
  private listeners = new Set<() => void>();
  private cache: EntityRecord[] = [];
  private pending = 0;
  private revision = 0;
  private clock?: Clock;
  private readonly node = crypto.randomUUID();
  private user = "local";
  private initialized: Promise<void>;
  private liveSubscription?: { unsubscribe(): void };
  private refreshChain: Promise<void> = Promise.resolve();
  constructor(name = "veloradesk-workspace", userId = "local") {
    this.user = userId;
    this.db = new Dexie(name);
    this.db.version(1).stores({
      entities: "[userId+table+id],userId,[userId+table]",
      documents: "[userId+pageId],userId",
      versions: "[userId+id],[userId+pageId],userId,createdAt",
      encryptedDocuments: "[userId+pageId+id],userId,[userId+pageId]",
      attachments: "[userId+id],userId,[userId+pageId]",
      outbox: "id,userId,createdAt",
      meta: "key",
    });
    this.entities = this.db.table("entities");
    this.documents = this.db.table("documents");
    this.versions = this.db.table("versions");
    this.encryptedDocuments = this.db.table("encryptedDocuments");
    this.attachments = this.db.table("attachments");
    this.outbox = this.db.table("outbox");
    this.meta = this.db.table("meta");
    this.initialized = this.refresh();
    // Retain a handled rejection when IndexedDB is unavailable during SSR; ready()/writes still report it.
    void this.initialized.catch(() => undefined);
    this.liveSubscription = liveQuery(() =>
      Promise.all([
        this.entities.where("userId").equals(this.user).toArray(),
        this.outbox.where("userId").equals(this.user).count(),
        this.documents.where("userId").equals(this.user).count(),
        this.versions.where("userId").equals(this.user).count(),
        this.encryptedDocuments.where("userId").equals(this.user).count(),
        this.attachments.where("userId").equals(this.user).count(),
      ]),
    ).subscribe({
      next: () => {
        void this.refresh().catch(() => undefined);
      },
      error: () => undefined,
    });
  }
  get accountId(): string {
    return this.user;
  }
  ready(): Promise<void> {
    return this.initialized;
  }
  async refreshSnapshot(): Promise<void> {
    await this.refresh();
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  pendingCount(): number {
    return this.pending;
  }
  getSnapshot(): number {
    return this.revision;
  }
  private notify(): void {
    this.revision++;
    this.listeners.forEach((listener) => listener());
  }
  private refresh(): Promise<void> {
    const result = this.refreshChain.then(async () => {
      const user = this.user;
      const [entities, pending] = await Promise.all([
        this.entities.where("userId").equals(user).toArray(),
        this.outbox.where("userId").equals(user).count(),
      ]);
      if (user !== this.user) return;
      this.cache = entities;
      this.pending = pending;
      this.notify();
    });
    this.refreshChain = result.catch(() => undefined);
    return result;
  }
  private list<T extends WorkspaceEntity>(
    table: EntityTable,
    deleted = false,
  ): T[] {
    return this.cache
      .filter((record) => record.table === table)
      .map((record) => recordEntity(record) as T)
      .filter((entity) => deleted || !entity.deletedAt)
      .sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
      );
  }
  listPages(includeTrash = false): Page[] {
    return this.list<Page>("pages", includeTrash);
  }
  listCalendars(): Calendar[] {
    return this.list<Calendar>("calendars");
  }
  listEvents(): CalendarEvent[] {
    return this.list<CalendarEvent>("events");
  }
  listDatabases(): DatabaseDefinition[] {
    return this.list<DatabaseDefinition>("databases");
  }
  private async nextOrder(user: string): Promise<number> {
    const key = `queue:${user}`;
    const value = Number((await this.meta.get(key))?.value ?? 0) + 1;
    await this.meta.put({ key, value });
    return value;
  }
  private async write(
    table: EntityTable,
    entityId: string,
    values: Record<string, unknown>,
    create = false,
  ): Promise<void> {
    const user = this.user;
    await this.db.transaction(
      "rw",
      [this.entities, this.outbox, this.meta],
      async () => {
        const key: [string, EntityTable, string] = [user, table, entityId];
        const previous = await this.entities.get(key);
        if (!previous && !create) throw new Error("Item no longer exists");
        const savedClock = (await this.meta.get(`clock:${user}`))?.value as
          | Clock
          | undefined;
        this.clock = tick(this.node, Date.now(), this.clock, savedClock);
        const fields: Record<string, StampedValue> = {};
        const normalized = { ...values };
        if (table === "pages" && isRecord(normalized.properties)) {
          const oldProperties = recordProperties(previous);
          const nextProperties = { ...normalized.properties };
          if (oldProperties.__locked) {
            nextProperties.__locked = true;
            delete nextProperties.__text;
          }
          normalized.properties = {};
          for (const name of new Set([
            ...Object.keys(oldProperties),
            ...Object.keys(nextProperties),
          ])) {
            if (["__proto__", "constructor", "prototype"].includes(name))
              throw new Error("Invalid property");
            normalized[`properties.${name}`] = nextProperties[name] ?? null;
          }
        }
        for (const [name, value] of Object.entries(normalized)) {
          if (value === undefined || (PROTECTED.has(name) && !create)) continue;
          if (["__proto__", "constructor", "prototype"].includes(name))
            continue;
          if (
            previous &&
            JSON.stringify(previous.fields[name]?.value) ===
              JSON.stringify(value)
          )
            continue;
          fields[name] = { value: structuredClone(value), clock: this.clock };
        }
        if (!Object.keys(fields).length) return;
        fields.userId = { value: user, clock: this.clock };
        fields.id = { value: entityId, clock: this.clock };
        const merged = { ...previous?.fields, ...fields };
        validateEntity(
          table,
          recordEntity({
            userId: user,
            id: entityId,
            table,
            fields: merged,
            schemaVersion: 1,
          }),
        );
        await this.entities.put({
          userId: user,
          table,
          id: entityId,
          fields: merged,
          schemaVersion: 1,
        });
        const id = crypto.randomUUID();
        await this.outbox.put({
          id,
          userId: user,
          createdAt: Date.now(),
          order: await this.nextOrder(user),
          change: {
            id,
            userId: user,
            kind: "entity",
            entityId,
            table,
            fields,
            schemaVersion: 1,
          },
        });
        await this.meta.put({ key: `clock:${user}`, value: this.clock });
      },
    );
    if (!Dexie.currentTransaction) await this.refresh();
  }
  async createPage(
    type: PageType,
    title = "Untitled",
    extras: Partial<Page> = {},
  ): Promise<Page> {
    const date = new Date().toISOString();
    const page: Page = {
      id: crypto.randomUUID(),
      userId: this.user,
      type,
      title,
      parentId: null,
      favorite: false,
      tags: [],
      icon: "",
      cover: "",
      fullWidth: false,
      date: null,
      databaseId: null,
      properties: {},
      createdAt: date,
      updatedAt: date,
      deletedAt: null,
      ...extras,
    };
    page.userId = this.user;
    page.id = crypto.randomUUID();
    page.type = type;
    const siblings = this.listPages()
      .filter((item) => item.parentId === page.parentId)
      .sort((a, b) => compareOrder(a.properties.__order, b.properties.__order));
    page.properties = {
      __order: orderBetween(siblings.at(-1)?.properties.__order ?? null, null),
      ...page.properties,
    };
    await this.write(
      "pages",
      page.id,
      page as unknown as Record<string, unknown>,
      true,
    );
    return page;
  }
  async patchPage(id: string, patch: Partial<Page>): Promise<void> {
    await this.write("pages", id, {
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }
  async trashPage(id: string): Promise<void> {
    await this.patchPage(id, { deletedAt: new Date().toISOString() });
  }
  async restorePage(id: string): Promise<void> {
    await this.patchPage(id, { deletedAt: null });
  }
  async saveCalendar(
    patch: Partial<Calendar> & { id?: string },
  ): Promise<Calendar> {
    const old = patch.id
      ? this.list<Calendar>("calendars", true).find(
          (calendar) => calendar.id === patch.id,
        )
      : undefined;
    const date = new Date().toISOString();
    const calendar: Calendar = {
      id: crypto.randomUUID(),
      title: "My calendar",
      color: "blue",
      visible: true,
      source: "local",
      createdAt: date,
      updatedAt: date,
      deletedAt: null,
      ...old,
      ...Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      ),
      userId: this.user,
    };
    calendar.updatedAt = date;
    await this.write(
      "calendars",
      calendar.id,
      calendar as unknown as Record<string, unknown>,
      !old,
    );
    return calendar;
  }
  async saveEvent(
    patch: Partial<CalendarEvent> & { id?: string },
  ): Promise<CalendarEvent> {
    const old = patch.id
      ? this.list<CalendarEvent>("events", true).find(
          (event) => event.id === patch.id,
        )
      : undefined;
    const date = new Date().toISOString();
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const event: CalendarEvent = {
      id: crypto.randomUUID(),
      calendarId: this.listCalendars()[0]?.id ?? "",
      title: "New event",
      start: date,
      end: new Date(Date.now() + 3_600_000).toISOString(),
      allDay: false,
      startZone: zone,
      endZone: zone,
      location: "",
      notes: "",
      url: "",
      busy: true,
      reminderMinutes: 10,
      recurrence: "",
      exceptions: [],
      pageId: null,
      source: "local",
      createdAt: date,
      updatedAt: date,
      deletedAt: null,
      ...old,
      ...Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      ),
      userId: this.user,
    };
    event.updatedAt = date;
    await this.write(
      "events",
      event.id,
      event as unknown as Record<string, unknown>,
      !old,
    );
    return event;
  }
  async deleteEvent(id: string): Promise<void> {
    await this.write("events", id, {
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  async saveDatabase(database: DatabaseDefinition): Promise<void> {
    const old = this.list<DatabaseDefinition>("databases", true).some(
      (item) => item.id === database.id,
    );
    await this.write(
      "databases",
      database.id,
      { ...database, userId: this.user, updatedAt: new Date().toISOString() },
      !old,
    );
  }
  async loadDoc(pageId: string): Promise<Uint8Array | null> {
    const page = await this.entities.get([this.user, "pages", pageId]);
    if (recordProperties(page).__locked) return null;
    return (await this.documents.get([this.user, pageId]))?.update ?? null;
  }
  async saveDoc(pageId: string, update: Uint8Array): Promise<void> {
    validateUpdate(update);
    const user = this.user;
    await this.db.transaction(
      "rw",
      [this.entities, this.documents, this.outbox, this.versions, this.meta],
      async () => {
        const page = await this.entities.get([user, "pages", pageId]);
        if (!page) throw new Error("Page no longer exists");
        if (recordProperties(page).__locked)
          throw new Error("Unlock this page before changing its document");
        const previous = await this.documents.get([user, pageId]);
        const merged = new Uint8Array(
          previous ? Y.mergeUpdates([previous.update, update]) : update,
        );
        if (previous && equalBytes(previous.update, merged)) return;
        await this.documents.put({ userId: user, pageId, update: merged });
        const versions = await this.versions
          .where("[userId+pageId]")
          .equals([user, pageId])
          .toArray();
        const latest = versions.sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        )[0];
        if (!latest || Date.now() - Date.parse(latest.createdAt) >= 300_000)
          await this.versions.put({
            userId: user,
            id: crypto.randomUUID(),
            pageId,
            createdAt: new Date().toISOString(),
            update: merged,
          });
        const id = crypto.randomUUID();
        await this.outbox.put({
          id,
          userId: user,
          createdAt: Date.now(),
          order: await this.nextOrder(user),
          change: {
            id,
            userId: user,
            kind: "document",
            entityId: pageId,
            update: bytesToBase64(update),
            schemaVersion: 1,
          },
        });
      },
    );
    if (!Dexie.currentTransaction) await this.refresh();
  }
  async listVersions(pageId: string): Promise<PageVersion[]> {
    return (
      await this.versions
        .where("[userId+pageId]")
        .equals([this.user, pageId])
        .toArray()
    )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ userId: _userId, ...version }) => version);
  }
  async loadEncryptedDoc(pageId: string): Promise<EncryptedEnvelope | null> {
    const envelopes = await this.loadEncryptedDocs(pageId);
    return envelopes.reduce<EncryptedEnvelope | null>(
      (latest, item) =>
        !latest || (item.wrapVersion ?? 0) >= (latest.wrapVersion ?? 0)
          ? item
          : latest,
      null,
    );
  }
  async loadEncryptedDocs(pageId: string): Promise<EncryptedEnvelope[]> {
    return (await this.loadEncryptedShards(pageId)).map(
      (item) => item.envelope,
    );
  }
  async loadEncryptedShards(
    pageId: string,
  ): Promise<{ id: string; envelope: EncryptedEnvelope }[]> {
    return (
      await this.encryptedDocuments
        .where("[userId+pageId]")
        .equals([this.user, pageId])
        .toArray()
    )
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      )
      .map(({ id, envelope }) => ({ id, envelope }));
  }
  async saveEncryptedDoc(
    pageId: string,
    envelope: EncryptedEnvelope,
    supersedes: string[] = [],
  ): Promise<void> {
    validateEnvelope(envelope);
    if (
      supersedes.length > 1000 ||
      supersedes.some((id) => typeof id !== "string" || id.length > 160)
    )
      throw new Error("Invalid encrypted compaction batch");
    const user = this.user;
    await this.db.transaction(
      "rw",
      [
        this.entities,
        this.documents,
        this.encryptedDocuments,
        this.versions,
        this.attachments,
        this.outbox,
        this.meta,
      ],
      async () => {
        const page = await this.entities.get([user, "pages", pageId]);
        if (!page) throw new Error("Page no longer exists");
        const files = await this.attachments
          .where("[userId+pageId]")
          .equals([user, pageId])
          .toArray();
        if (files.some((file) => file.mime !== "application/octet-stream"))
          throw new Error(
            "Reattach imported plaintext files through the editor before protecting this page.",
          );
        const properties = { ...recordProperties(page) };
        delete properties.__text;
        delete properties.__encryptedDocument;
        properties.__locked = true;
        await this.documents.delete([user, pageId]);
        await this.versions
          .where("[userId+pageId]")
          .equals([user, pageId])
          .delete();
        await this.outbox
          .where("userId")
          .equals(user)
          .filter(
            (item) =>
              item.change.entityId === pageId &&
              item.change.kind === "document",
          )
          .delete();
        // Earlier queued page properties can contain a plaintext search index; replace them as well.
        await this.outbox
          .where("userId")
          .equals(user)
          .filter(
            (item) =>
              item.change.entityId === pageId && item.change.table === "pages",
          )
          .modify((item) => {
            const fields = item.change.fields!;
            delete fields["properties.__text"];
            delete fields["properties.__encryptedDocument"];
            if (fields.properties) fields.properties.value = {};
            fields["properties.__locked"] = {
              value: true,
              clock: fields.id!.clock,
            };
          });
        await this.write("pages", pageId, {
          properties,
          updatedAt: new Date().toISOString(),
        });
        const id = crypto.randomUUID();
        await this.encryptedDocuments.bulkDelete(
          supersedes.map((old) => [user, pageId, old]),
        );
        await this.outbox
          .where("userId")
          .equals(user)
          .filter(
            (item) =>
              item.change.kind === "encrypted-document" &&
              item.change.entityId === pageId &&
              supersedes.includes(item.id),
          )
          .delete();
        await this.encryptedDocuments.put({
          userId: user,
          pageId,
          id,
          createdAt: new Date().toISOString(),
          envelope: structuredClone(envelope),
        });
        await this.outbox.put({
          id,
          userId: user,
          createdAt: Date.now(),
          order: await this.nextOrder(user),
          change: {
            id,
            userId: user,
            kind: "encrypted-document",
            entityId: pageId,
            envelope: structuredClone(envelope),
            ...(supersedes.length ? { supersedes: [...supersedes] } : {}),
            schemaVersion: 1,
          },
        });
      },
    );
    await this.refresh();
  }
  async listAttachments(pageId: string): Promise<Attachment[]> {
    return this.attachments
      .where("[userId+pageId]")
      .equals([this.user, pageId])
      .toArray();
  }
  async saveAttachment(
    pageId: string,
    file: Blob,
    name: string,
    id = crypto.randomUUID(),
  ): Promise<Attachment> {
    if (file.size > 10_485_760)
      throw new Error("Attachments must be smaller than 10 MB");
    const user = this.user;
    const attachment: Attachment = {
      id,
      userId: user,
      pageId,
      name: name.slice(0, 255),
      mime: file.type || "application/octet-stream",
      size: file.size,
      createdAt: new Date().toISOString(),
      bytes: new Uint8Array(await file.arrayBuffer()),
    };
    await this.db.transaction(
      "rw",
      [this.entities, this.attachments, this.outbox, this.meta],
      async () => {
        const page = await this.entities.get([user, "pages", pageId]);
        if (!page) throw new Error("Page no longer exists");
        if (
          recordProperties(page).__locked &&
          attachment.mime !== "application/octet-stream"
        )
          throw new Error("Protected pages require encrypted attachments");
        await this.attachments.put(attachment);
        await this.queueAttachment(attachment);
      },
    );
    await this.refresh();
    return attachment;
  }
  private async queueAttachment(attachment: Attachment): Promise<void> {
    const { userId, bytes, ...metadata } = attachment;
    const id = `attachment:${attachment.id}`;
    await this.outbox.put({
      id,
      userId,
      createdAt: Date.now(),
      order: await this.nextOrder(userId),
      change: {
        id,
        userId,
        kind: "attachment",
        entityId: attachment.pageId,
        attachment: { ...metadata, bytes: bytesToBase64(bytes) },
        schemaVersion: 1,
      },
    });
  }
  async getAttachment(id: string): Promise<Attachment | null> {
    return (await this.attachments.get([this.user, id])) ?? null;
  }
  async deleteAttachment(id: string): Promise<void> {
    await this.attachments.delete([this.user, id]);
    await this.refresh();
  }
  async restoreVersion(id: string, versionId?: string): Promise<void> {
    const version = await this.versions.get([this.user, versionId ?? id]);
    if (!version || (versionId && version.pageId !== id))
      throw new Error("Version not found");
    const current = new Y.Doc(),
      target = new Y.Doc();
    const existing = await this.loadDoc(version.pageId);
    try {
      if (existing) Y.applyUpdate(current, existing);
      Y.applyUpdate(target, version.update);
      // Binary Yjs updates leave root types lazy until the product accesses them.
      if (target.share.has("default")) target.getXmlFragment("default");
      if (target.share.has("sketch")) target.getArray("sketch");
      if (target.share.has("text")) target.getText("text");
      current.transact(() => {
        for (const [name, shared] of target.share) {
          if (shared instanceof Y.XmlFragment) {
            const restored = current.getXmlFragment(name);
            restored.delete(0, restored.length);
            restored.insert(
              0,
              shared.toArray().map((node) => {
                if (
                  !(node instanceof Y.XmlElement || node instanceof Y.XmlText)
                )
                  throw new Error("Unsupported XML node");
                return node.clone();
              }),
            );
          } else if (shared instanceof Y.Text) {
            const restored = current.getText(name);
            restored.delete(0, restored.length);
            restored.applyDelta(shared.toDelta());
          } else if (shared instanceof Y.Array) {
            const restored = current.getArray(name);
            restored.delete(0, restored.length);
            restored.insert(0, structuredClone(shared.toArray()));
          } else if (shared instanceof Y.Map) {
            const restored = current.getMap(name);
            restored.clear();
            shared.forEach((value, key) =>
              restored.set(key, structuredClone(value)),
            );
          } else throw new Error("This document format cannot be restored");
        }
      });
      await this.saveDoc(version.pageId, Y.encodeStateAsUpdate(current));
    } finally {
      current.destroy();
      target.destroy();
    }
  }
  /** Switching accounts changes the partition, never queries or synchronizes a previous owner's data. */
  async bindAccount(
    account: string | null,
    options: { adoptLocal?: boolean } = {},
  ): Promise<void> {
    const userId = account ?? "local";
    if (!userId || userId.length > 200) throw new Error("Invalid account");
    const archive =
      options.adoptLocal && this.user === "local" && userId !== "local"
        ? await this.exportData()
        : null;
    this.user = userId;
    this.cache = [];
    this.clock = undefined;
    this.notify();
    this.initialized = this.refresh();
    await this.initialized;
    if (archive) await this.importData(archive);
  }
  async pendingChanges(limit = 100): Promise<SyncChange[]> {
    return (await this.outbox.where("userId").equals(this.user).toArray())
      .sort(
        (a, b) =>
          (a.order ?? a.createdAt) - (b.order ?? b.createdAt) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, limit)
      .map((item) => structuredClone(item.change));
  }
  async acknowledge(ids: string[]): Promise<void> {
    const user = this.user;
    await this.db.transaction("rw", this.outbox, async () => {
      for (const id of ids) {
        const record = await this.outbox.get(id);
        if (record?.userId === user) await this.outbox.delete(id);
      }
    });
    await this.refresh();
  }
  async getCursor(): Promise<string | null> {
    return (
      ((await this.meta.get(`cursor:${this.user}`))?.value as string | null) ??
      null
    );
  }
  async getSetting<T>(key: string, fallback: T): Promise<T> {
    return (
      ((
        (await this.meta.get(`setting:${this.user}:${key}`))?.value as
          | StampedValue
          | undefined
      )?.value as T) ?? fallback
    );
  }
  async setSetting<T>(key: string, value: T): Promise<void> {
    await this.updateSetting<T>(key, value, () => value);
  }
  async updateSetting<T>(
    key: string,
    fallback: T,
    update: (current: T) => T,
  ): Promise<T> {
    if (
      !key ||
      key.length > 200 ||
      ["__proto__", "constructor", "prototype"].includes(key)
    )
      throw new Error("Invalid setting");
    const user = this.user;
    const value = await this.db.transaction(
      "rw",
      [this.meta, this.outbox],
      async () => {
        const current = await this.getSetting(key, fallback);
        const next = update(structuredClone(current));
        if (JSON.stringify(next)?.length > 2_000_000)
          throw new Error("Setting too large");
        const local = (await this.meta.get(`clock:${user}`))?.value as
          | Clock
          | undefined;
        const clock = tick(this.node, Date.now(), local);
        await this.meta.put({ key: `clock:${user}`, value: clock });
        await this.meta.put({
          key: `setting:${user}:${key}`,
          value: { value: structuredClone(next), clock },
        });
        if (!key.startsWith("provider:")) {
          const id = crypto.randomUUID();
          await this.outbox.put({
            id,
            userId: user,
            createdAt: Date.now(),
            order: await this.nextOrder(user),
            change: {
              id,
              userId: user,
              entityId: key,
              kind: "setting",
              key,
              value: structuredClone(next),
              clock,
              schemaVersion: 1,
            },
          });
        }
        return next;
      },
    );
    if (!Dexie.currentTransaction) await this.refresh();
    return value;
  }
  async applyRemote(
    changes: SyncChange[],
    nextCursor: string | null,
  ): Promise<void> {
    const user = this.user;
    for (const change of changes) {
      if (
        change.userId !== user ||
        change.schemaVersion !== 1 ||
        !change.id ||
        !change.entityId
      )
        throw new Error("Rejected a change outside this account or schema");
      if (change.kind === "entity") {
        if (!change.table || !TABLES.includes(change.table))
          throw new Error("Invalid table");
        validateFields(change.fields);
        if (change.fields.userId && change.fields.userId.value !== user)
          throw new Error("Rejected entity owner");
        if (change.fields.id && change.fields.id.value !== change.entityId)
          throw new Error("Rejected entity identity");
      } else if (change.kind === "document")
        validateUpdate(base64ToBytes(change.update ?? ""));
      else if (change.kind === "encrypted-document") {
        validateEnvelope(change.envelope);
        if (
          change.supersedes &&
          (change.supersedes.length > 1000 ||
            change.supersedes.some(
              (id) =>
                typeof id !== "string" || id.length > 160 || id === change.id,
            ))
        )
          throw new Error("Invalid encrypted compaction batch");
      } else if (change.kind === "attachment") {
        const file = change.attachment;
        if (
          !file ||
          file.pageId !== change.entityId ||
          !file.id ||
          typeof file.name !== "string" ||
          typeof file.mime !== "string" ||
          !Number.isFinite(Date.parse(file.createdAt))
        )
          throw new Error("Invalid attachment change");
        const bytes = base64ToBytes(file.bytes ?? "");
        if (bytes.length !== file.size || bytes.length > 10_485_760)
          throw new Error("Invalid attachment size");
      } else if (change.kind === "setting") {
        if (
          !change.key ||
          change.key !== change.entityId ||
          change.key.startsWith("provider:") ||
          change.key.length > 200 ||
          !change.clock
        )
          throw new Error("Invalid setting change");
        tick(this.node, Date.now(), change.clock);
        if (JSON.stringify(change.value)?.length > 2_000_000)
          throw new Error("Setting too large");
      } else throw new Error("Invalid change kind");
    }
    await this.db.transaction(
      "rw",
      [
        this.entities,
        this.documents,
        this.encryptedDocuments,
        this.versions,
        this.attachments,
        this.meta,
        this.outbox,
      ],
      async () => {
        let observed = (await this.meta.get(`clock:${user}`))?.value as
          | Clock
          | undefined;
        for (const change of changes) {
          if (change.kind === "document") {
            const page = await this.entities.get([
              user,
              "pages",
              change.entityId,
            ]);
            if (recordProperties(page).__locked) continue;
            const update = base64ToBytes(change.update!);
            const previous = await this.documents.get([user, change.entityId]);
            await this.documents.put({
              userId: user,
              pageId: change.entityId,
              update: new Uint8Array(
                previous ? Y.mergeUpdates([previous.update, update]) : update,
              ),
            });
          } else if (change.kind === "encrypted-document") {
            const known = change.supersedes ?? [];
            await this.encryptedDocuments.bulkDelete(
              known.map((id) => [user, change.entityId, id]),
            );
            await this.outbox
              .where("userId")
              .equals(user)
              .filter(
                (item) =>
                  item.change.kind === "encrypted-document" &&
                  item.change.entityId === change.entityId &&
                  known.includes(item.id),
              )
              .delete();
            await this.encryptedDocuments.put({
              userId: user,
              pageId: change.entityId,
              id: change.id,
              createdAt: new Date().toISOString(),
              envelope: structuredClone(change.envelope!),
            });
          } else if (change.kind === "attachment") {
            await this.attachments.put({
              ...change.attachment!,
              userId: user,
              bytes: base64ToBytes(change.attachment!.bytes!),
            });
          } else if (change.kind === "setting") {
            const key = `setting:${user}:${change.key!}`;
            const old = (await this.meta.get(key))?.value as
              | StampedValue
              | undefined;
            if (
              !old ||
              compareClock(change.clock!, old.clock) > 0 ||
              (compareClock(change.clock!, old.clock) === 0 &&
                JSON.stringify(change.value) > JSON.stringify(old.value))
            )
              await this.meta.put({
                key,
                value: { value: change.value, clock: change.clock },
              });
            observed = tick(this.node, Date.now(), observed, change.clock);
          } else {
            const key: [string, EntityTable, string] = [
              user,
              change.table!,
              change.entityId,
            ];
            const previous = await this.entities.get(key);
            const fields = { ...previous?.fields };
            for (const [name, field] of Object.entries(change.fields!)) {
              const existing = fields[name];
              const comparison = existing
                ? compareClock(field.clock, existing.clock)
                : 1;
              if (
                !existing ||
                comparison > 0 ||
                (comparison === 0 &&
                  JSON.stringify(field.value) > JSON.stringify(existing.value))
              )
                fields[name] = structuredClone(field);
              observed = tick(this.node, Date.now(), observed, field.clock);
            }
            const record: EntityRecord = {
              userId: user,
              id: change.entityId,
              table: change.table!,
              fields,
              schemaVersion: 1,
            };
            validateEntity(change.table!, recordEntity(record));
            await this.entities.put(record);
            if (change.table === "pages" && recordProperties(record).__locked) {
              await this.documents.delete([user, change.entityId]);
              await this.versions
                .where("[userId+pageId]")
                .equals([user, change.entityId])
                .delete();
            }
          }
        }
        if (observed)
          await this.meta.put({ key: `clock:${user}`, value: observed });
        await this.meta.put({ key: `cursor:${user}`, value: nextCursor });
      },
    );
    await this.refresh();
  }
  async exportData(): Promise<string> {
    const user = this.user;
    const archive = await this.db.transaction(
      "r",
      [
        this.entities,
        this.documents,
        this.encryptedDocuments,
        this.attachments,
        this.versions,
        this.meta,
      ],
      async (): Promise<WorkspaceArchive> => ({
        format: "veloradesk",
        version: 1,
        exportedAt: new Date().toISOString(),
        entities: (
          await this.entities.where("userId").equals(user).toArray()
        ).map((record) => ({
          table: record.table,
          entity: recordEntity(record),
        })),
        documents: (
          await this.documents.where("userId").equals(user).toArray()
        ).map((document) => ({
          pageId: document.pageId,
          update: bytesToBase64(document.update),
        })),
        versions: (
          await this.versions.where("userId").equals(user).toArray()
        ).map((version) => ({
          id: version.id,
          pageId: version.pageId,
          createdAt: version.createdAt,
          update: bytesToBase64(version.update),
        })),
        encryptedDocuments: (
          await this.encryptedDocuments.where("userId").equals(user).toArray()
        ).map(({ userId: _userId, ...document }) => document),
        attachments: (
          await this.attachments.where("userId").equals(user).toArray()
        ).map((attachment) => ({
          id: attachment.id,
          pageId: attachment.pageId,
          name: attachment.name,
          mime: attachment.mime,
          size: attachment.size,
          createdAt: attachment.createdAt,
          bytes: bytesToBase64(attachment.bytes),
        })),
        settings: (
          await this.meta.where("key").startsWith(`setting:${user}:`).toArray()
        )
          .map((record) => ({
            key: record.key.slice(`setting:${user}:`.length),
            value: (record.value as StampedValue).value,
          }))
          .filter((setting) => !setting.key.startsWith("provider:")),
      }),
    );
    return JSON.stringify(archive, null, 2);
  }
  async importData(json: string): Promise<void> {
    if (json.length > 100_000_000) throw new Error("Import exceeds 100 MB");
    const archive: unknown = JSON.parse(json);
    if (
      !isRecord(archive) ||
      archive.format !== "veloradesk" ||
      archive.version !== 1 ||
      !Array.isArray(archive.entities) ||
      !Array.isArray(archive.documents) ||
      !Array.isArray(archive.versions)
    )
      throw new Error("Unsupported workspace export");
    if (
      archive.entities.length > LIMIT ||
      archive.documents.length > LIMIT ||
      archive.versions.length > LIMIT
    )
      throw new Error("Too many imported items");
    const entries = archive.entities as WorkspaceArchive["entities"];
    const documents = archive.documents as WorkspaceArchive["documents"];
    const versions = archive.versions as WorkspaceArchive["versions"];
    const encryptedDocuments = (archive.encryptedDocuments ??
      []) as EncryptedDocRecord[];
    const attachments = (archive.attachments ?? []) as NonNullable<
      WorkspaceArchive["attachments"]
    >;
    const settings = (archive.settings ?? []) as {
      key: string;
      value: unknown;
    }[];
    if (
      !Array.isArray(settings) ||
      settings.length > LIMIT ||
      settings.some(
        (setting) =>
          !setting.key ||
          setting.key.startsWith("provider:") ||
          setting.key.length > 200 ||
          ["__proto__", "constructor", "prototype"].includes(setting.key) ||
          JSON.stringify(setting.value)?.length > 2_000_000,
      )
    )
      throw new Error("Invalid imported settings");
    if (
      !Array.isArray(encryptedDocuments) ||
      !Array.isArray(attachments) ||
      encryptedDocuments.length > LIMIT ||
      attachments.length > LIMIT
    )
      throw new Error("Invalid imported files");
    const pageIds = new Set<string>();
    for (const entry of entries) {
      if (!TABLES.includes(entry.table))
        throw new Error("Invalid imported table");
      validateEntity(entry.table, entry.entity);
      if (entry.table === "pages") pageIds.add(entry.entity.id);
    }
    for (const document of [...documents, ...versions]) {
      if (!pageIds.has(document.pageId) || typeof document.update !== "string")
        throw new Error("Invalid imported document");
      validateUpdate(base64ToBytes(document.update));
    }
    for (const version of versions)
      if (
        typeof version.id !== "string" ||
        !version.id ||
        !Number.isFinite(Date.parse(version.createdAt))
      )
        throw new Error("Invalid version");
    for (const document of encryptedDocuments) {
      if (
        !pageIds.has(document.pageId) ||
        typeof document.id !== "string" ||
        !document.id ||
        !Number.isFinite(Date.parse(document.createdAt))
      )
        throw new Error("Invalid encrypted shard");
      validateEnvelope(document.envelope);
    }
    for (const attachment of attachments) {
      if (
        !pageIds.has(attachment.pageId) ||
        typeof attachment.id !== "string" ||
        typeof attachment.name !== "string" ||
        typeof attachment.mime !== "string" ||
        !Number.isFinite(Date.parse(attachment.createdAt))
      )
        throw new Error("Invalid attachment");
      const bytes = base64ToBytes(attachment.bytes);
      if (bytes.length !== attachment.size || bytes.length > 25_000_000)
        throw new Error("Invalid attachment size");
    }
    // A single encompassing transaction prevents half an import after a bad record or quota error.
    await this.db.transaction(
      "rw",
      [
        this.entities,
        this.documents,
        this.encryptedDocuments,
        this.attachments,
        this.versions,
        this.outbox,
        this.meta,
      ],
      async () => {
        for (const entry of entries)
          await this.write(
            entry.table,
            entry.entity.id,
            {
              ...entry.entity,
              userId: this.user,
              updatedAt: new Date().toISOString(),
            } as unknown as Record<string, unknown>,
            true,
          );
        for (const document of documents)
          await this.saveDoc(document.pageId, base64ToBytes(document.update));
        for (const version of versions)
          await this.versions.put({
            ...version,
            userId: this.user,
            update: base64ToBytes(version.update),
          });
        for (const document of encryptedDocuments) {
          const shardId = crypto.randomUUID();
          await this.encryptedDocuments.put({
            ...document,
            id: shardId,
            userId: this.user,
          });
          await this.outbox.put({
            id: shardId,
            userId: this.user,
            createdAt: Date.now(),
            order: await this.nextOrder(this.user),
            change: {
              id: shardId,
              userId: this.user,
              kind: "encrypted-document",
              entityId: document.pageId,
              envelope: document.envelope,
              schemaVersion: 1,
            },
          });
        }
        for (const attachment of attachments) {
          const restored = {
            ...attachment,
            userId: this.user,
            bytes: base64ToBytes(attachment.bytes),
          };
          await this.attachments.put(restored);
          await this.queueAttachment(restored);
        }
        for (const setting of settings)
          await this.setSetting(setting.key, setting.value);
      },
    );
    await this.refresh();
  }
  async clearAll(): Promise<void> {
    const user = this.user;
    await this.db.transaction(
      "rw",
      [
        this.entities,
        this.documents,
        this.encryptedDocuments,
        this.attachments,
        this.versions,
        this.outbox,
        this.meta,
      ],
      async () => {
        for (const table of [
          this.entities,
          this.documents,
          this.encryptedDocuments,
          this.attachments,
          this.versions,
          this.outbox,
        ])
          await table.where("userId").equals(user).delete();
        await this.meta.bulkDelete([`clock:${user}`, `cursor:${user}`]);
      },
    );
    await this.refresh();
  }
  async close(): Promise<void> {
    this.liveSubscription?.unsubscribe();
    this.listeners.clear();
    this.db.close();
  }
}
export const store = new WorkspaceStore();
