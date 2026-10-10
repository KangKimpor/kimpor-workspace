import { describe, it, expect } from "vitest";
import fc from "fast-check";
import * as Y from "yjs";
import { compareClock, tick } from "./clock";
import { mergeFields } from "./merge";
import { quotaState, allowCloudWrite } from "./quota";
import { corsHeaders, parseDesktopCallback } from "./auth";

const clock = fc.record({
  wall: fc.nat({ max: 100_000 }),
  counter: fc.nat({ max: 100 }),
  node: fc.constantFrom("a", "b", "c"),
});
const fields = fc.dictionary(
  fc.constantFrom("title", "start", "deletedAt", "color"),
  fc.record({
    value: fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
    clock,
  }),
);
describe("hybrid logical clocks", () => {
  it("stays monotonic during wall-clock rollback and remote observations", () =>
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 100_000 }), { minLength: 2 }),
        clock,
        (times, remote) => {
          let current = tick("a", times[0]!);
          for (const now of times.slice(1)) {
            const next = tick("a", now, current, remote);
            expect(compareClock(next, current)).toBeGreaterThan(0);
            expect(compareClock(next, remote)).toBeGreaterThan(0);
            current = next;
          }
        },
      ),
    ));
  it("rejects invalid input and overflow", () => {
    expect(() => tick("", 0)).toThrow();
    expect(() => tick("a", -1)).toThrow();
    expect(() => tick("a", 1, { wall: -1, counter: 0, node: "a" })).toThrow();
    expect(() =>
      tick("a", 0, { wall: 1, counter: Number.MAX_SAFE_INTEGER, node: "a" }),
    ).toThrow();
  });
});
describe("record merge", () => {
  it("is associative, commutative and idempotent", () =>
    fc.assert(
      fc.property(fields, fields, fields, (a, b, c) => {
        expect(mergeFields(a, b)).toEqual(mergeFields(b, a));
        expect(mergeFields(a, a)).toEqual(a);
        expect(mergeFields(mergeFields(a, b), c)).toEqual(
          mergeFields(a, mergeFields(b, c)),
        );
      }),
      { numRuns: 500 },
    ));
  it("preserves independent fields and a newer tombstone", () => {
    const old = tick("a", 1),
      newer = tick("b", 2);
    expect(
      mergeFields(
        {
          title: { value: "Original", clock: old },
          deletedAt: { value: null, clock: old },
        },
        {
          deletedAt: { value: 2, clock: newer },
          color: { value: "blue", clock: newer },
        },
      ),
    ).toEqual({
      title: { value: "Original", clock: old },
      deletedAt: { value: 2, clock: newer },
      color: { value: "blue", clock: newer },
    });
  });
});
describe("offline rich-text spike", () => {
  it("three disconnected Yjs clients converge with reordered and duplicate updates", () => {
    const seed = new Y.Doc();
    seed.getText("body").insert(0, "Shared ");
    const clients = Array.from({ length: 3 }, () => {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(seed));
      return doc;
    });
    clients[0]!.getText("body").insert(7, "English ");
    clients[1]!.getText("body").insert(7, "ខ្មែរ ");
    clients[2]!.getText("body").insert(7, "中文 ");
    const updates = clients.map((doc) => Y.encodeStateAsUpdate(doc));
    clients.forEach((doc, i) => {
      for (const update of i % 2 ? updates : [...updates].reverse()) {
        Y.applyUpdate(doc, update);
        Y.applyUpdate(doc, update);
      }
    });
    const text = clients[0]!.getText("body").toString();
    expect(text).toContain("English");
    expect(text).toContain("ខ្មែរ");
    expect(text).toContain("中文");
    clients.forEach((doc) => {
      expect(doc.getText("body").toString()).toBe(text);
      doc.destroy();
    });
    seed.destroy();
  });
});
describe("free-tier guard", () => {
  it("warns at 70% and stops cloud writes at capacity", () => {
    expect(quotaState(69, 100)).toBe("normal");
    expect(quotaState(70, 100)).toBe("warning");
    expect(quotaState(99, 100, 1)).toBe("full");
    expect(allowCloudWrite(70, 100)).toBe(true);
    expect(allowCloudWrite(100, 100)).toBe(false);
  });
  it("does not guess unknown or invalid usage", () => {
    for (const used of [null, -1, Infinity, NaN]) {
      expect(quotaState(used, 100)).toBe("unknown");
      expect(allowCloudWrite(used, 100)).toBe(false);
    }
    expect(quotaState(0, 0)).toBe("unknown");
    expect(quotaState(0, 100, -1)).toBe("unknown");
  });
});
describe("desktop OAuth and CORS contract spike", () => {
  const allowed = [
    "https://veloradesk.vercel.app",
    "http://tauri.localhost",
    "tauri://localhost",
  ];
  it("allows exact web and desktop origins, never a lookalike or wildcard", () => {
    allowed.forEach((origin) =>
      expect(
        corsHeaders(origin, allowed)?.["Access-Control-Allow-Origin"],
      ).toBe(origin),
    );
    expect(corsHeaders(null, allowed)).toBeNull();
    expect(
      corsHeaders("https://veloradesk.vercel.app.evil.test", allowed),
    ).toBeNull();
  });
  it("accepts a code with matching live state", () =>
    expect(
      parseDesktopCallback(
        "veloradesk://auth/callback?code=abc&state=nonce",
        "nonce",
        200,
        100,
      ),
    ).toEqual({ code: "abc" }));
  it("rejects forged, expired, fragment and duplicate parameters", () => {
    for (const url of [
      "https://auth/callback?code=x&state=nonce",
      "veloradesk://auth/other?code=x&state=nonce",
      "veloradesk://auth/callback?code=x&state=wrong",
      "veloradesk://auth/callback?code=x&state=nonce#secret",
      "veloradesk://auth/callback?state=nonce",
      "veloradesk://auth/callback?code=x&code=y&state=nonce",
      "veloradesk://auth/callback?code=x&state=nonce&state=nonce",
      "veloradesk://auth/callback?code=x&state=nonce&error=denied",
    ])
      expect(() => parseDesktopCallback(url, "nonce", 200, 100)).toThrow();
    expect(() =>
      parseDesktopCallback(
        "veloradesk://auth/callback?code=x&state=nonce",
        "nonce",
        100,
        100,
      ),
    ).toThrow();
  });
});
