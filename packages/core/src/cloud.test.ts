import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  config: { url: "https://project.supabase.co", key: "public-test-key" } as {
    url: string;
    key: string;
  } | null,
  session: { access_token: "test-token", user: { id: "owner" } } as {
    access_token: string;
    user: { id: string };
  } | null,
}));
vi.mock("./cloud-auth", () => ({
  cloudConfig: () => auth.config,
  currentSession: async () => auth.session,
}));
import {
  cloudRequest,
  SupabaseTransport,
  CloudError,
  cloudUsage,
  subscribeCloudNudges,
} from "./cloud";
import { bytesToBase64, type SyncChange } from "./store";
const fetcher = vi.fn();
const entity: SyncChange = {
  id: "change",
  entityId: "page",
  userId: "owner",
  kind: "entity",
  table: "pages",
  schemaVersion: 1,
  fields: {},
};
it("sends permanent deletion through the authenticated immutable sync queue", async () => {
  const purge: SyncChange = { id: "delete-forever", userId: "owner", entityId: "page", kind: "purge", table: "pages", schemaVersion: 1 };
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ acknowledged: [purge.id] }), { status: 200 }));
  expect(await new SupabaseTransport().push("owner", [purge])).toEqual({ acknowledged: [purge.id] });
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ changes: [purge] });
  expect(purge).toEqual({ id: "delete-forever", userId: "owner", entityId: "page", kind: "purge", table: "pages", schemaVersion: 1 });
});
it("batches acknowledged purge requests, validates receipts and stops on account changes", async () => {
  const changes: SyncChange[] = Array.from({length:201},(_,index)=>({...entity,id:`purge-${index}`,entityId:`page-${index}`,kind:"purge"}));
  const original = structuredClone(changes);
  fetcher.mockImplementation(async (_url,options)=>response({acknowledged:JSON.parse(options.body).items.map((item:SyncChange)=>item.id),refused:[]}));
  const transport = new SupabaseTransport();
  expect((await transport.purge("owner",changes)).acknowledged).toEqual(changes.map(change=>change.id));
  expect(fetcher.mock.calls.map(call=>JSON.parse(call[1].body).items.length)).toEqual([100,100,1]);
  expect(changes).toEqual(original);
  fetcher.mockResolvedValueOnce(response({acknowledged:["forged"],refused:[]}));
  await expect(transport.purge("owner",changes.slice(0,1))).rejects.toThrow("Invalid purge response");
  auth.session = {access_token:"another-token",user:{id:"another-owner"}};
  await expect(transport.purge("owner",changes)).rejects.toMatchObject({status:403});
});
beforeEach(() => {
  auth.config = { url: "https://project.supabase.co", key: "public-test-key" };
  auth.session = { access_token: "test-token", user: { id: "owner" } };
  fetcher.mockReset();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
it("authenticates requests and surfaces waking, expired and malformed cloud responses", async () => {
  auth.session = null;
  await expect(cloudRequest("/test")).rejects.toMatchObject({ status: 401 });
  auth.session = { access_token: "test-token", user: { id: "owner" } };
  auth.config = null;
  await expect(cloudRequest("/test")).rejects.toBeInstanceOf(CloudError);
  auth.config = { url: "https://project.supabase.co", key: "key" };
  fetcher.mockResolvedValueOnce(response({ ok: true }));
  expect(await cloudRequest("/test", { hello: 1 })).toEqual({ ok: true });
  expect(fetcher.mock.calls[0]![1].headers.Authorization).toBe(
    "Bearer test-token",
  );
  for (const [body, status] of [
    [{ message: "Expired" }, 401],
    [{ error: "Full" }, 507],
    [null, 503],
  ] as const) {
    fetcher.mockResolvedValueOnce(response(body, status));
    await expect(cloudRequest("/test")).rejects.toMatchObject({ status });
  }
  fetcher.mockResolvedValueOnce(new Response("not JSON", { status: 500 }));
  await expect(cloudRequest("/test")).rejects.toThrow("Cloud request failed");
  fetcher.mockResolvedValueOnce(
    response({ databaseBytes: 10, storageBytes: 20 }),
  );
  expect(await cloudUsage()).toMatchObject({ databaseBytes: 10 });
});
it("requires matching owners and rejects forged acknowledgments and foreign pulls", async () => {
  const transport = new SupabaseTransport();
  await expect(transport.push("other", [entity])).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    transport.push("owner", [{ ...entity, userId: "other" }]),
  ).rejects.toMatchObject({ status: 403 });
  fetcher.mockResolvedValueOnce(response({ acknowledged: ["change"] }));
  expect(await transport.push("owner", [entity])).toEqual({
    acknowledged: ["change"],
  });
  for (const acknowledged of [undefined, ["forged"], [42]]) {
    fetcher.mockResolvedValueOnce(response({ acknowledged }));
    await expect(transport.push("owner", [entity])).rejects.toThrow(
      "Invalid sync acknowledgment",
    );
  }
  await expect(transport.pull("other", null)).rejects.toMatchObject({
    status: 403,
  });
  fetcher.mockResolvedValueOnce(
    response({ changes: [entity], cursor: "1", hasMore: false }),
  );
  expect(await transport.pull("owner", null)).toMatchObject({ cursor: "1" });
  for (const result of [
    { changes: [{ ...entity, userId: "other" }], cursor: "1" },
    { changes: [], cursor: 1 },
    { changes: [{ ...entity, schemaVersion: 2 }], cursor: "1" },
  ]) {
    fetcher.mockResolvedValueOnce(response(result));
    await expect(transport.pull("owner", "1")).rejects.toThrow(
      "Invalid sync response",
    );
  }
});
it("uploads files separately from record JSON and restores their exact bytes on pull", async () => {
  const id = crypto.randomUUID();
  const file: SyncChange = {
    id: `attachment:${id}`,
    userId: "owner",
    entityId: "page",
    kind: "attachment",
    schemaVersion: 1,
    attachment: {
      id,
      pageId: "page",
      mime: "application/octet-stream",
      name: "Encrypted attachment",
      size: 3,
      createdAt: new Date().toISOString(),
      bytes: bytesToBase64(new Uint8Array([1, 2, 3])),
    },
  };
  const transport = new SupabaseTransport();
  fetcher
    .mockResolvedValueOnce(response({ acknowledged: ["change"] }))
    .mockResolvedValueOnce(response({ ok: true }));
  expect((await transport.push("owner", [entity, file])).acknowledged).toEqual([
    "change",
    file.id,
  ]);
  expect(JSON.parse(fetcher.mock.calls[0]![1].body).changes).toEqual([entity]);
  expect(fetcher.mock.calls[1]![1].body).toBeInstanceOf(FormData);
  fetcher
    .mockResolvedValueOnce(
      response({
        changes: [
          { ...file, attachment: { ...file.attachment, bytes: undefined } },
        ],
        cursor: "2",
        hasMore: false,
      }),
    )
    .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
  expect(
    (await transport.pull("owner", "1")).changes[0]?.attachment?.bytes,
  ).toBe(file.attachment?.bytes);
  fetcher.mockResolvedValueOnce(response({}, 503));
  await expect(transport.push("owner", [file])).rejects.toMatchObject({
    status: 503,
  });
  await expect(
    transport.push("owner", [{ ...file, attachment: undefined }]),
  ).rejects.toThrow("unavailable");
});
it("sends only private tiny nudges, debounces changes and cleans its socket and heartbeat", async () => {
  vi.useFakeTimers();
  const sockets: FakeSocket[] = [];
  class FakeSocket {
    static OPEN = 1;
    readyState = 1;
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    send = vi.fn();
    close = vi.fn();
    constructor(readonly url: string) {
      sockets.push(this);
    }
  }
  vi.stubGlobal("WebSocket", FakeSocket);
  const nudge = vi.fn(),
    close = await subscribeCloudNudges(nudge),
    socket = sockets[0]!;
  socket.onopen?.();
  expect(JSON.parse(socket.send.mock.calls[0]![0]).payload.config.private).toBe(
    true,
  );
  socket.onmessage?.({ data: "bad JSON" });
  socket.onmessage?.({
    data: JSON.stringify({ event: "broadcast", payload: { event: "change" } }),
  });
  socket.onmessage?.({
    data: JSON.stringify({ event: "broadcast", payload: { event: "change" } }),
  });
  await vi.advanceTimersByTimeAsync(300);
  expect(nudge).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(25000);
  expect(
    socket.send.mock.calls.some(
      (call) => JSON.parse(call[0]).event === "heartbeat",
    ),
  ).toBe(true);
  close();
  expect(socket.close).toHaveBeenCalledOnce();
  auth.session = null;
  expect(await subscribeCloudNudges(nudge)).toBeTypeOf("function");
});
