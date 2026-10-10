import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { zipSync, strToU8 } from "fflate";
import { WorkspaceStore } from "./store";
import {
  compressImage,
  documentToMarkdown,
  markdownToDocument,
  importMarkdown,
  exportPageMarkdown,
  importWorkspaceZip,
  parseCSV,
  formatCSV,
  importCSV,
} from "./export";
const stores: WorkspaceStore[] = [];
async function workspace() {
  const store = new WorkspaceStore(`export-${crypto.randomUUID()}`);
  stores.push(store);
  await store.ready();
  return store;
}
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const store of stores.splice(0)) {
    await store.close();
    await store.db.delete();
  }
});
it("round-trips supported multilingual Markdown, inline formats and ordered and task lists", () => {
  const markdown =
    "# Heading\n\n**Bold** and *italic* and `code` and ~~strike~~ and [site](https://example.test) ខ្មែរ 中文\n\n## Subheading\n\n### Detail\n\n- First\n- Second\n\n1. One\n2. Two\n\n- [x] Done\n- [ ] Open\n\n> Quote\n\n---\n\n```javascript\nconst answer = 42;\n```";
  const roundTrip = documentToMarkdown(markdownToDocument(markdown));
  for (const text of [
    "# Heading",
    "## Subheading",
    "### Detail",
    "**Bold**",
    "*italic*",
    "`code`",
    "~~strike~~",
    "[site](https://example.test)",
    "ខ្មែរ 中文",
    "1. One",
    "2. Two",
    "- [x] Done",
    "- [ ] Open",
    "> Quote",
    "---",
    "```javascript",
  ])
    expect(roundTrip).toContain(text);
  expect(documentToMarkdown(markdownToDocument(""))).toBe("\n");
});
it("exports rich blocks, safe media, mentions and tables without executable links", () => {
  const doc = new Y.Doc(),
    root = doc.getXmlFragment("default");
  function element(
    name: string,
    text?: string,
    attrs: Record<string, string> = {},
  ) {
    const node = new Y.XmlElement(name);
    for (const [key, value] of Object.entries(attrs))
      node.setAttribute(key, value);
    if (text) {
      const t = new Y.XmlText();
      t.insert(0, text);
      node.insert(0, [t]);
    }
    return node;
  }
  const quote = element("callout");
  quote.insert(0, [element("paragraph", "A callout")]);
  const row = element("tableRow"),
    cell = element("tableCell");
  cell.insert(0, [element("paragraph", "A | B")]);
  row.insert(0, [cell]);
  const table = element("table");
  table.insert(0, [row]);
  root.insert(0, [
    quote,
    element("image", undefined, {
      src: "https://example.test/photo.webp",
      alt: "Photo",
    }),
    element("image", undefined, { src: "javascript:alert(1)" }),
    element("pageMention", undefined, { label: "Linked page" }),
    element("dateMention", undefined, { date: "2026-10-10" }),
    element("fileAttachment", undefined, {
      name: "File.pdf",
      attachmentId: "test-file",
    }),
    table,
    element("hardBreak"),
    element("custom", "Custom text"),
  ]);
  const output = documentToMarkdown(Y.encodeStateAsUpdate(doc));
  expect(output).toContain("> A callout");
  expect(output).toContain("![Photo](https://example.test/photo.webp)");
  expect(output).toContain("[[Linked page]]");
  expect(output).toContain("2026-10-10");
  expect(output).toContain("File.pdf");
  expect(output).toContain("A \\| B");
  expect(output).toContain("Custom text");
  expect(output).not.toContain("javascript:");
  doc.destroy();
});
it("imports a Notion text archive atomically, updates visible cache and rejects unsafe archives", async () => {
  const store = await workspace();
  const zip = zipSync({
    "Ideas 0123456789abcdef0123456789abcdef.md": strToU8(
      "# My ideas\n中文 ខ្មែរ",
    ),
    "Tasks.csv": strToU8("Title,Status\nReview,Open"),
  });
  expect(await importWorkspaceZip(store, zip)).toBe(2);
  expect(store.listPages().map((page) => page.title)).toEqual(
    expect.arrayContaining(["Ideas", "Tasks", "Review"]),
  );
  const idea = store.listPages().find((page) => page.title === "Ideas")!;
  expect(await exportPageMarkdown(store, idea.id)).toContain("中文 ខ្មែរ");
  await expect(exportPageMarkdown(store, "missing")).rejects.toThrow(
    "not found",
  );
  const before = store.listPages().length;
  const invalid = zipSync({
    "Valid.md": strToU8("Valid"),
    "Broken.csv": strToU8('Title\n"broken'),
  });
  await expect(importWorkspaceZip(store, invalid)).rejects.toThrow("quote");
  expect(store.listPages()).toHaveLength(before);
  for (const name of ["../outside.md", "/outside.md", "folder\\outside.md"])
    await expect(
      importWorkspaceZip(store, zipSync({ [name]: strToU8("x") })),
    ).rejects.toThrow("Unsafe");
  await expect(
    importWorkspaceZip(store, zipSync({ "data.txt": strToU8("x") })),
  ).rejects.toThrow("No Markdown");
});
it("parses and formats CSV with quoted commas, newlines, quotes and empty values", async () => {
  const rows = [
    ["Title", "Value"],
    ["中文, ខ្មែរ", 'He said "hello"\nagain'],
    ["", ""],
  ];
  expect(parseCSV(formatCSV(rows))).toEqual(rows);
  expect(parseCSV("Title,Value\r\nOne,Two\r\n")).toEqual([
    ["Title", "Value"],
    ["One", "Two"],
  ]);
  expect(() => parseCSV('name\nx"wrong')).toThrow("Unexpected");
  const store = await workspace();
  await expect(importCSV(store, "")).rejects.toThrow("header");
  const page = await importMarkdown(store, "# Imported title\nA body");
  expect(page.title).toBe("Imported title");
  expect(await exportPageMarkdown(store, page.id)).not.toContain(
    "# Imported title\n\n# Imported title",
  );
});
it("compresses large images within dimension limits and preserves unsupported or already smaller files", async () => {
  const source = new Blob(["original large photo bytes"], {
      type: "image/jpeg",
    }),
    small = new Blob(["webp"], { type: "image/webp" }),
    image = { width: 4096, height: 2048, close: vi.fn() },
    draw = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ drawImage: draw })),
    toBlob: (done: (blob: Blob | null) => void) => done(small),
  };
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => image),
  );
  vi.stubGlobal("document", { createElement: () => canvas });
  expect(await compressImage(source)).toBe(small);
  expect(canvas.width).toBe(2048);
  expect(canvas.height).toBe(1024);
  expect(image.close).toHaveBeenCalledOnce();
  expect(
    await compressImage(new Blob(["text"], { type: "text/plain" })),
  ).toBeInstanceOf(Blob);
  const svg = new Blob(["<svg/>"], { type: "image/svg+xml" });
  expect(await compressImage(svg)).toBe(svg);
  canvas.getContext.mockReturnValue(null as never);
  expect(await compressImage(source)).toBe(source);
});
