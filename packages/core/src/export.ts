import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import * as Y from "yjs";
import type { Page, PropertyDefinition } from "./model";
import type { WorkspaceStore } from "./store";
import { encryptAttachment } from "./crypto";

function inline(text: Y.XmlText): string {
  return text
    .toDelta()
    .map((part: { insert?: unknown; attributes?: Record<string, unknown> }) => {
      let value = typeof part.insert === "string" ? part.insert : "";
      if (part.attributes?.code) value = `\`${value.replace(/`/g, "\\`")}\``;
      if (part.attributes?.bold) value = `**${value}**`;
      if (part.attributes?.italic) value = `*${value}*`;
      if (part.attributes?.strike) value = `~~${value}~~`;
      if (
        part.attributes?.link &&
        typeof part.attributes.link === "object" &&
        "href" in part.attributes.link
      ) {
        const href = String(part.attributes.link.href);
        if (/^(https?:|mailto:|attachment:)/i.test(href))
          value = `[${value}](${href})`;
      }
      return value;
    })
    .join("");
}
function markdownNode(node: Y.XmlElement | Y.XmlText | Y.XmlHook): string {
  if (node instanceof Y.XmlText) return inline(node);
  if (!(node instanceof Y.XmlElement)) return "";
  const content = node.toArray().map(markdownNode).join("");
  const attributes = node.getAttributes();
  switch (node.nodeName) {
    case "paragraph":
      return `${content}\n\n`;
    case "heading":
      return `${"#".repeat(Math.min(3, Math.max(1, Number(attributes.level) || 1)))} ${content}\n\n`;
    case "bulletList":
    case "orderedList":
    case "taskList":
      return (
        node
          .toArray()
          .map((child, index) => {
            const value = markdownNode(child).trim();
            const checked =
              child instanceof Y.XmlElement &&
              child.getAttribute("checked") === "true";
            return `${node.nodeName === "orderedList" ? `${index + 1}.` : node.nodeName === "taskList" ? `- [${checked ? "x" : " "}]` : "-"} ${value.replace(/\n/g, "\n  ")}\n`;
          })
          .join("") + "\n"
      );
    case "listItem":
    case "taskItem":
      return content;
    case "blockquote":
    case "callout":
      return (
        content
          .trim()
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n") + "\n\n"
      );
    case "codeBlock":
      return `\`\`\`${attributes.language || ""}\n${content}\n\`\`\`\n\n`;
    case "horizontalRule":
      return "---\n\n";
    case "image":
      return /^(https?:|attachment:)/i.test(String(attributes.src))
        ? `![${attributes.alt || ""}](${attributes.src})\n\n`
        : "";
    case "hardBreak":
      return "  \n";
    case "mention":
    case "pageMention":
      return `[[${attributes.label || attributes.id || ""}]]`;
    case "dateMention":
      return String(attributes.date ?? "");
    case "fileAttachment":
      return `[${attributes.name || "File"}](attachment:${attributes.attachmentId || ""})\n\n`;
    case "table":
      return (
        node
          .toArray()
          .map((row, index) => {
            const cells = row instanceof Y.XmlElement ? row.toArray() : [];
            const line = `| ${cells.map((cell) => markdownNode(cell).trim().replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |\n`;
            return (
              line +
              (index === 0 ? `| ${cells.map(() => "---").join(" | ")} |\n` : "")
            );
          })
          .join("") + "\n"
      );
    default:
      return content;
  }
}
export function documentToMarkdown(update: Uint8Array): string {
  const document = new Y.Doc();
  try {
    Y.applyUpdate(document, update);
    return (
      document
        .getXmlFragment("default")
        .toArray()
        .map(markdownNode)
        .join("")
        .trimEnd() + "\n"
    );
  } finally {
    document.destroy();
  }
}
function plainInline(value: string): Y.XmlText {
  const text = new Y.XmlText();
  const expression =
    /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|~~(.+?)~~|\[([^\]]+)\]\((https?:[^\s)]+|mailto:[^\s)]+)\)/g;
  let offset = 0;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(value))) {
    if (match.index > offset) {
      const before = value.slice(offset, match.index);
      text.insert(cursor, before, {});
      cursor += before.length;
    }
    const content =
      match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? "";
    const start = cursor;
    text.insert(start, content, {});
    cursor += content.length;
    text.format(
      start,
      content.length,
      match[1]
        ? { bold: {} }
        : match[2]
          ? { italic: {} }
          : match[3]
            ? { code: {} }
            : match[4]
              ? { strike: {} }
              : { link: { href: match[6] } },
    );
    offset = match.index + match[0].length;
  }
  if (offset < value.length) text.insert(cursor, value.slice(offset), {});
  return text;
}
export function markdownToDocument(markdown: string): Uint8Array {
  if (markdown.length > 20_000_000) throw new Error("Markdown exceeds 20 MB");
  const document = new Y.Doc();
  const fragment = document.getXmlFragment("default");
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Y.XmlElement[] = [];
  let list: Y.XmlElement | null = null;
  let listSize = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (!line.trim()) {
      list = null;
      continue;
    }
    if (line.startsWith("```")) {
      list = null;
      const node = new Y.XmlElement("codeBlock");
      node.setAttribute("language", line.slice(3).trim());
      const body: string[] = [];
      while (++index < lines.length && !lines[index]!.startsWith("```"))
        body.push(lines[index]!);
      const text = new Y.XmlText();
      text.insert(0, body.join("\n"));
      node.insert(0, [text]);
      blocks.push(node);
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const item = /^\s*(?:([-*])\s+|([0-9]+)\.\s+)(?:\[([ xX])\]\s+)?(.*)$/.exec(
      line,
    );
    if (item) {
      const kind =
        item[3] !== undefined
          ? "taskList"
          : item[2]
            ? "orderedList"
            : "bulletList";
      if (!list || list.nodeName !== kind) {
        list = new Y.XmlElement(kind);
        listSize = 0;
        blocks.push(list);
      }
      const child = new Y.XmlElement(
        kind === "taskList" ? "taskItem" : "listItem",
      );
      if (kind === "taskList")
        child.setAttribute("checked", String(item[3]?.toLowerCase() === "x"));
      const paragraph = new Y.XmlElement("paragraph");
      paragraph.insert(0, [plainInline(item[4] ?? "")]);
      child.insert(0, [paragraph]);
      list.insert(listSize++, [child]);
      continue;
    }
    list = null;
    if (/^(---|\*\*\*)$/.test(line.trim())) {
      blocks.push(new Y.XmlElement("horizontalRule"));
      continue;
    }
    const node = new Y.XmlElement(
      heading ? "heading" : line.startsWith("> ") ? "blockquote" : "paragraph",
    );
    if (heading) node.setAttribute("level", String(heading[1]!.length));
    const text = plainInline(heading?.[2] ?? line.replace(/^> /, ""));
    if (node.nodeName === "blockquote") {
      const paragraph = new Y.XmlElement("paragraph");
      paragraph.insert(0, [text]);
      node.insert(0, [paragraph]);
    } else node.insert(0, [text]);
    blocks.push(node);
  }
  fragment.insert(0, blocks.length ? blocks : [new Y.XmlElement("paragraph")]);
  const update = Y.encodeStateAsUpdate(document);
  document.destroy();
  return update;
}
export async function exportPageMarkdown(
  workspace: WorkspaceStore,
  pageId: string,
): Promise<string> {
  const page = workspace.listPages(true).find((item) => item.id === pageId);
  if (!page) throw new Error("Page not found");
  if (page.properties.__locked)
    return `# ${page.title}\n\nThis page is encrypted. Its protected document is included in the full workspace export.\n`;
  const document = await workspace.loadDoc(pageId);
  return `# ${page.title}\n\n${document ? documentToMarkdown(document) : ""}`;
}
export async function importMarkdown(
  workspace: WorkspaceStore,
  markdown: string,
  title?: string,
): Promise<Page> {
  const firstHeading = /^#\s+(.+)$/m.exec(markdown);
  const pageTitle = title || firstHeading?.[1] || "Imported note";
  const update = markdownToDocument(
    firstHeading && !title ? markdown.replace(firstHeading[0], "") : markdown,
  );
  const page = await workspace.createPage("note", pageTitle);
  await workspace.saveDoc(page.id, update);
  return page;
}
function safeName(name: string): string {
  return name.replace(/[^\p{L}\p{N}_. -]/gu, "_").slice(0, 100) || "Untitled";
}
export async function exportWorkspaceZip(
  workspace: WorkspaceStore,
): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {
    "workspace.json": strToU8(await workspace.exportData()),
    "README.txt": strToU8(
      "Kimpor Workspace full-data export. Import workspace.json or this ZIP in Settings. Protected pages remain encrypted; recovery credentials are not included.\n",
    ),
  };
  for (const page of workspace.listPages(true)) {
    files[`pages/${safeName(page.title)}-${page.id}.md`] = strToU8(
      await exportPageMarkdown(workspace, page.id),
    );
    for (const attachment of await workspace.listAttachments(page.id))
      files[`attachments/${attachment.id}-${safeName(attachment.name)}`] =
        attachment.bytes;
  }
  return zipSync(files, { level: 6 });
}
export async function importWorkspaceZip(
  workspace: WorkspaceStore,
  bytes: Uint8Array,
): Promise<number> {
  if (bytes.byteLength > 100_000_000) throw new Error("Archive exceeds 100 MB");
  let size = 0;
  let count = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      if (++count > 10_000 || (size += file.originalSize) > 100_000_000)
        throw new Error("Archive expands beyond the import limit");
      if (
        file.name.startsWith("/") ||
        file.name.includes("\\") ||
        file.name.split("/").includes("..")
      )
        throw new Error("Unsafe archive path");
      return !file.name.endsWith("/");
    },
  });
  const archive = files["workspace.json"];
  if (archive) {
    const json = strFromU8(archive);
    await workspace.importData(json);
    return workspace.listPages(true).length;
  }
  const entries = Object.entries(files).filter(([name]) =>
    /\.(md|csv)$/i.test(name),
  );
  if (!entries.length)
    throw new Error(
      "No Markdown, CSV, or Kimpor Workspace data found in this archive",
    );
  // Parse before writing; malformed CSV must not leave half of a Notion import.
  const parsed = entries.map(([name, content]) => ({
    name,
    text: strFromU8(content),
    title: name
      .split("/")
      .at(-1)!
      .replace(/ [a-f0-9]{32}(?=\.[^.]+$)/, "")
      .replace(/\.[^.]+$/, ""),
  }));
  for (const entry of parsed)
    if (/\.csv$/i.test(entry.name)) parseCSV(entry.text);
    else markdownToDocument(entry.text);
  const owner = workspace.accountId;
  const mediaTypes: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
    gif: "image/gif", avif: "image/avif", pdf: "application/pdf", txt: "text/plain",
    mp3: "audio/mpeg", mp4: "video/mp4", wav: "audio/wav",
  };
  const mediaType = (name: string) => mediaTypes[name.split(".").at(-1)?.toLowerCase() ?? ""] ?? "application/octet-stream";
  const resolve = (href: string, name: string) => {
    try {
      const url = new URL(href.trim().replace(/^<|>$/g, ""), `https://archive.invalid/${name}`);
      return url.origin === "https://archive.invalid" ? decodeURIComponent(url.pathname.slice(1)) : null;
    } catch { return null; }
  };
  type Asset = { marker: string; id: string; bytes: Uint8Array; attrs: Record<string, string>; image: boolean };
  const prepared: ((typeof parsed)[number] & { originalText: string; assets: Map<string, Asset> })[] = [];
  // Crypto and file reads finish before the IndexedDB transaction begins.
  for (const entry of parsed) {
    const assets = new Map<string, Asset>();
    const searchable = /\.csv$/i.test(entry.name) ? "" : entry.text
      .replace(/^```[^\n]*\n[\s\S]*?(?:^```[^\n]*(?:\n|$)|$(?![\s\S]))/gm, value => " ".repeat(value.length))
      .replace(/`[^`\n]*`/g, value => " ".repeat(value.length));
    const matches = [...searchable.matchAll(/(!?)\[([^\]\n]*)\]\(([^)\n]+)\)/g)].reverse();
    let text = entry.text;
    for (const match of matches) {
      const name = resolve(match[3]!, entry.name);
      if (!name || /\.(md|csv)$/i.test(name) || !files[name]) continue;
      if (files[name].byteLength > 10_485_760 - 16) throw new Error("An embedded file exceeds 10 MB");
      let asset = assets.get(name);
      if (!asset) {
        const id = crypto.randomUUID();
        const encrypted = await encryptAttachment(files[name], id);
        const mime = mediaType(name);
        asset = {
          id, marker: `KIMPOR_ATTACHMENT_${id}`, bytes: encrypted.bytes,
          image: match[1] === "!" && /^image\/(png|jpeg|webp|gif|avif)$/.test(mime),
          attrs: { attachmentId: id, fileKey: encrypted.key, fileIv: encrypted.iv, mime,
            name: name.split("/").at(-1)!, size: String(files[name].byteLength),
            src: `attachment:${id}`, alt: match[2] || name.split("/").at(-1)! },
        };
        assets.set(name, asset);
      }
      text = text.slice(0, match.index) + `\n\n${asset.marker}\n\n` + text.slice(match.index + match[0].length);
    }
    prepared.push({ ...entry, text, originalText: entry.text, assets });
  }
  if (owner !== workspace.accountId) throw new Error("Workspace account changed");
  await workspace.db.transaction("rw", workspace.db.tables, async () => {
    const pages = new Map<string, Page>();
    for (const entry of prepared) {
      if (owner !== workspace.accountId) throw new Error("Workspace account changed");
      const page = /\.csv$/i.test(entry.name)
        ? await importCSV(workspace, entry.text, entry.title)
        : await importMarkdown(workspace, entry.text, entry.title);
      pages.set(entry.name, page);
      if (!entry.assets.size || /\.csv$/i.test(entry.name)) continue;
      const doc = new Y.Doc();
      try {
        Y.applyUpdate(doc, (await workspace.loadDoc(page.id))!);
        const fragment = doc.getXmlFragment("default");
        for (const asset of entry.assets.values()) {
          await workspace.saveAttachmentBytes(page.id, asset.bytes, "Encrypted attachment", asset.id);
          for (let index = fragment.length - 1; index >= 0; index--) {
            const node = fragment.get(index);
            if (!(node instanceof Y.XmlElement) || node.nodeName !== "paragraph" || node.toArray().map(part => part.toString()).join("") !== asset.marker) continue;
            const attachment = new Y.XmlElement(asset.image ? "image" : "fileAttachment");
            for (const [key, value] of Object.entries(asset.attrs)) attachment.setAttribute(key, value);
            fragment.delete(index, 1); fragment.insert(index, [attachment]);
          }
        }
        await workspace.saveDoc(page.id, Y.encodeStateAsUpdate(doc));
      } finally { doc.destroy(); }
    }
    const folders = new Map([...pages].map(([name, page]) => [name.replace(/\.[^.]+$/, ""), page]));
    for (const entry of prepared) {
      const page = pages.get(entry.name)!;
      let folder = entry.name.slice(0, entry.name.lastIndexOf("/"));
      let parent: Page | undefined;
      while (folder && entry.name.includes("/")) {
        parent = folders.get(folder);
        if (parent) break;
        const slash = folder.lastIndexOf("/");
        folder = slash < 0 ? "" : folder.slice(0, slash);
      }
      await workspace.patchPage(page.id, {
        parentId: parent?.id ?? null,
        properties: { ...page.properties, __text: entry.originalText },
      });
    }
    if (owner !== workspace.accountId) throw new Error("Workspace account changed");
  });
  await workspace.refreshSnapshot();
  return parsed.length;
}
export function parseCSV(text: string): string[][] {
  if (text.length > 20_000_000) throw new Error("CSV exceeds 20 MB");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') {
      if (cell) throw new Error("Unexpected quote in CSV");
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (rows.length > 10_001 || rows.some((record) => record.length > 100))
    throw new Error("CSV exceeds 10,000 rows or 100 columns");
  return rows;
}
export function formatCSV(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) =>
          /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell,
        )
        .join(","),
    )
    .join("\r\n");
}
export async function importCSV(
  workspace: WorkspaceStore,
  text: string,
  title = "Imported database",
): Promise<Page> {
  const [headers, ...rows] = parseCSV(text);
  if (!headers?.length) throw new Error("CSV needs a header row");
  const database = await workspace.createPage("database", title);
  const properties: PropertyDefinition[] = headers.map((name, index) => ({
    id: `column-${index}`,
    name: name || `Column ${index + 1}`,
    type: index === 0 ? "title" : "text",
  }));
  const date = new Date().toISOString();
  await workspace.saveDatabase({
    id: database.id,
    userId: workspace.accountId,
    properties,
    views: [{ id: crypto.randomUUID(), name: "Table", type: "table" }],
    createdAt: date,
    updatedAt: date,
    deletedAt: null,
  });
  for (const row of rows)
    await workspace.createPage("row", row[0] || "Untitled", {
      databaseId: database.id,
      parentId: database.id,
      properties: Object.fromEntries(
        row.map((value, index) => [
          properties[index]?.id ?? `column-${index}`,
          value,
        ]),
      ),
    });
  return database;
}
export async function compressImage(
  file: Blob,
  maxDimension = 2048,
  quality = 0.85,
): Promise<Blob> {
  if (
    !file.type.startsWith("image/") ||
    file.type === "image/svg+xml" ||
    typeof createImageBitmap === "undefined"
  )
    return file;
  const image = await createImageBitmap(file);
  try {
    const ratio = Math.min(
      1,
      maxDimension / Math.max(image.width, image.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const compressed = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    return compressed && compressed.size < file.size ? compressed : file;
  } finally {
    image.close();
  }
}
