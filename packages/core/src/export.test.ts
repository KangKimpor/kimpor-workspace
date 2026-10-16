import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { zipSync, strToU8 } from "fflate";
import { WorkspaceStore } from "./store";
import { decryptAttachment } from "./crypto";
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
it("preserves Notion parent folders and encrypted embedded media without changing code samples", async () => {
  const store = await workspace();
  const folder = "Parent 0123456789abcdef0123456789abcdef";
  const image = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6S8AAAAASUVORK5CYII="), value => value.charCodeAt(0));
  const paper = strToU8("Synthetic PDF bytes 中文 ខ្មែរ");
  const zip = zipSync({
    [`${folder}.md`]: strToU8("# Parent"),
    [`${folder}/Child.md`]: strToU8("# Child\n\n![Photo](photo.png)\n\n[Paper](paper.pdf)\n\n```text\n![Sample](photo.png)\n```"),
    [`${folder}/photo.png`]: image,
    [`${folder}/paper.pdf`]: paper,
  });
  expect(await importWorkspaceZip(store, zip)).toBe(2);
  const parent = store.listPages().find(page => page.title === "Parent")!;
  const child = store.listPages().find(page => page.title === "Child")!;
  expect(child.parentId).toBe(parent.id);
  expect(child.properties.__text).toContain("[Paper](paper.pdf)");
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, (await store.loadDoc(child.id))!);
    const nodes = doc.getXmlFragment("default").toArray().filter((node): node is Y.XmlElement => node instanceof Y.XmlElement);
    const media = nodes.filter(node => ["image", "fileAttachment"].includes(node.nodeName));
    expect(media.map(node => node.nodeName)).toEqual(["image", "fileAttachment"]);
    expect(await store.listAttachments(child.id)).toHaveLength(2);
    for (const node of media) {
      const attrs = node.getAttributes();
      const file = (await store.getAttachment(String(attrs.attachmentId)))!;
      const expected = node.nodeName === "image" ? image : paper;
      expect(file.name).toBe("Encrypted attachment");
      expect(file.mime).toBe("application/octet-stream");
      expect(file.bytes).not.toEqual(expected);
      expect(await decryptAttachment(file.bytes, String(attrs.fileKey), String(attrs.fileIv), file.id)).toEqual(expected);
    }
    expect(documentToMarkdown((await store.loadDoc(child.id))!)).toContain("![Sample](photo.png)");
  } finally { doc.destroy(); }
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

it("round-trips literal markup and arbitrary code delimiters", () => {
  for (const code of [false, true]) for (const original of ["`", "``hi```", "\\`[]()*_<tag>|", " `code` ", "  ", "ខ្មែរ 中文"]) {
    const value = code ? original : `Start ${original} end`;
    const doc = new Y.Doc();
    const paragraph = new Y.XmlElement("paragraph");
    const text = new Y.XmlText();
    text.insert(0, value, code ? { code: {} } : {});
    paragraph.insert(0, [text]); doc.getXmlFragment("default").insert(0, [paragraph]);
    const output = documentToMarkdown(Y.encodeStateAsUpdate(doc));
    const restored = new Y.Doc(); Y.applyUpdate(restored, markdownToDocument(output));
    const node = restored.getXmlFragment("default").get(0) as Y.XmlElement;
    const result = node.get(0) as Y.XmlText;
    expect(result.toDelta().map((part: { insert?: unknown }) => part.insert).join("")).toBe(value);
    if (code) expect(result.toDelta()[0]?.attributes).toHaveProperty("code");
    doc.destroy(); restored.destroy();
  }
});
it("extracts only a nonempty single-line heading and preserves overrides", async () => {
  const store = await workspace();
  for (const [markdown, title] of [["#\nBody", "Imported note"], ["# \t\r\nBody", "Imported note"], ["\r\n#\t中文\r\nBody\r\n#\t中文", "中文"], ["# " + " ".repeat(100000) + "\nBody", "Imported note"]]) {
    const page = await importMarkdown(store, markdown!);
    expect(page.title).toBe(title);
    expect(await exportPageMarkdown(store, page.id)).toContain("Body");
  }
  const page = await importMarkdown(store, "# Original\nBody", "Override");
  expect(await exportPageMarkdown(store, page.id)).toContain("# Original");
  await expect(importMarkdown(store, "x".repeat(20_000_001))).rejects.toThrow("20 MB");
});

it("keeps table delimiters contained and encodes link destinations", () => {
  const doc = new Y.Doc();
  const root = doc.getXmlFragment("default");
  const table = new Y.XmlElement("table"), row = new Y.XmlElement("tableRow");
  root.insert(0,[table]); table.insert(0,[row]);
  for (const code of [false, true]) {
    const cell = new Y.XmlElement("tableCell"), paragraph = new Y.XmlElement("paragraph"), text = new Y.XmlText();
    text.insert(0, "\\\\| A\r\nB | 中文", code ? {code:{}} : {}); paragraph.insert(0,[text]); cell.insert(0,[paragraph]); row.insert(row.length,[cell]);
  }
  const paragraph = new Y.XmlElement("paragraph"), text = new Y.XmlText();
  text.insert(0,"[site]",{link:{href:"https://example.test/a)b"}});
  text.insert(6,"bad",{link:{href:"javascript:alert(1)"}});
  paragraph.insert(0,[text]); root.insert(1,[paragraph]);
  const output = documentToMarkdown(Y.encodeStateAsUpdate(doc));
  const line = output.split("\n")[0]!;
  let separators = 0, slashes = 0;
  for (const char of line) { if (char === "|" && slashes % 2 === 0) separators++; slashes = char === "\\" ? slashes + 1 : 0; }
  expect(separators).toBe(3);
  expect(output).toContain("https://example.test/a%29b");
  expect(output).not.toContain("javascript:");
  expect(output).toContain("\\[site\\]");
  doc.destroy();
});

it("preserves escaped titles and accepts longer closing fences without swallowing text", async () => {
  const store = await workspace();
  const original = await store.createPage("note", "A [B] \\ 中文");
  const restored = await importMarkdown(store, await exportPageMarkdown(store, original.id));
  expect(restored.title).toBe(original.title);
  const output = documentToMarkdown(markdownToDocument("```\na\n````\nAfter"));
  expect(output).toContain("```\n\nAfter");
  expect(documentToMarkdown(markdownToDocument("\uE000".repeat(100000)))).toBe("\uE000".repeat(100000) + "\n");
});

it("preserves backslashes before table pipes inside code after GFM table unescaping", () => {
  for (let count = 0; count < 4; count++) {
    const value = "\\".repeat(count) + "|";
    const doc = new Y.Doc(), table = new Y.XmlElement("table"), row = new Y.XmlElement("tableRow"), cell = new Y.XmlElement("tableCell"), text = new Y.XmlText();
    text.insert(0,value,{code:{}}); cell.insert(0,[text]); row.insert(0,[cell]); table.insert(0,[row]); doc.getXmlFragment("default").insert(0,[table]);
    const output = documentToMarkdown(Y.encodeStateAsUpdate(doc));
    const serializedCell = output.split("\n")[0]!.slice(2,-2);
    // GFM removes the table escape before parsing inline code (example 200).
    const inlineCell = serializedCell.replace(/\\\|/g,"|");
    const parsed = new Y.Doc(); Y.applyUpdate(parsed,markdownToDocument(inlineCell));
    const paragraph = parsed.getXmlFragment("default").get(0) as Y.XmlElement;
    expect((paragraph.get(0) as Y.XmlText).toDelta().map((part: {insert?: unknown}) => part.insert).join("")).toBe(value);
    doc.destroy(); parsed.destroy();
  }
});
