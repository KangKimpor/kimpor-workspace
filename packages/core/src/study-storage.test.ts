import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import * as Y from "yjs";
import { loadStudy, saveStudy } from "./study-storage";
it("preserves simultaneous study edits instead of overwriting the earlier snapshot", async () => {
  expect(await loadStudy()).toBeUndefined();
  const a = new Y.Doc(),
    b = new Y.Doc();
  a.getText("test").insert(0, "ខ្មែរ");
  b.getText("test").insert(0, "中文");
  await Promise.all([
    saveStudy(Y.encodeStateAsUpdate(a)),
    saveStudy(Y.encodeStateAsUpdate(b)),
  ]);
  const merged = new Y.Doc();
  Y.applyUpdate(merged, (await loadStudy())!);
  expect(merged.getText("test").toString()).toContain("ខ្មែរ");
  expect(merged.getText("test").toString()).toContain("中文");
  a.destroy();
  b.destroy();
  merged.destroy();
});
