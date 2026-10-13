import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("preserves multilingual ranking and date/type filters, and drops replaced data", async () => {
  const worker = { onmessage: (_event: MessageEvent) => {}, postMessage: vi.fn() };
  vi.stubGlobal("self", worker);
  await import("./search.worker");
  const send = (data: object) => worker.onmessage({ data } as MessageEvent);
  const search = (query: string, filters = {}) => {
    send({ kind: "search", requestId: 7, query, ...filters });
    return worker.postMessage.mock.lastCall?.[0];
  };
  send({ kind: "index", items: [
    { id: "b", type: "note", title: "Body", text: "QUIET 中文 ខ្មែរ", date: "2026-10-11" },
    { id: "a", type: "journal", title: "Quiet", text: "中文 ខ្មែរ", date: "2026-10-12" },
    { id: "c", type: "note", title: "Width", text: "ＱＵＩＥＴ", date: "2026-10-13" },
  ] });
  expect(search("quiet")).toEqual({ requestId: 7, ids: ["a", "b", "c"] });
  expect(search("中文 ខ្មែរ", { type: "note", after: "2026-10-11", before: "2026-10-11" }))
    .toEqual({ requestId: 7, ids: ["b"] });
  expect(search("absent")).toEqual({ requestId: 7, ids: [] });
  send({ kind: "index", items: [] });
  expect(search("quiet")).toEqual({ requestId: 7, ids: [] });
});
