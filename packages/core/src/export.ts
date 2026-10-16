import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import * as Y from "yjs";
import type { Page, PropertyDefinition } from "./model";
import type { WorkspaceStore } from "./store";
import { encryptAttachment } from "./crypto";

function escapeText(value: string): string {
  return value.replace(/[\\`*_[\]<>~|#!+(){}]/g, "\\$&").replace(/(^|\n)([ \t]*)(-|[0-9]+\.)/g, (_, start, spaces, marker: string) => `${start}${spaces}${marker === "-" ? "\\-" : marker.slice(0, -1) + "\\."}`);
}
function destination(value: string, image = false): string | null {
  try {
    const url = new URL(value);
    if (!(image ? ["http:", "https:", "attachment:"] : ["http:", "https:", "mailto:", "attachment:"]).includes(url.protocol)) return null;
    return value.replace(/[\s<>()[\]\\|]/g, character => character === "(" ? "%28" : character === ")" ? "%29" : encodeURIComponent(character));
  } catch { return null; }
}
function codeSpan(value: string, inTable = false): string {
  if (inTable) {
    // GFM removes one backslash before each pipe even inside code spans.
    let escaped = "";
    for (const character of value) escaped += character === "|" ? "\\|" : character;
    value = escaped;
  }
  const runs = value.match(/`+/g) ?? [];
  const fence = "`".repeat(runs.reduce((longest, run) => Math.max(longest, run.length), 0) + 1);
  const padding = value.startsWith("`") || value.endsWith("`") || (value.startsWith(" ") && value.endsWith(" ") && value.trim()) ? " " : "";
  return `${fence}${padding}${value}${padding}${fence}`;
}
function tableCell(value: string): string {
  return value.trim().replace(/\r\n?|\n/g, " ");
}
function headingLine(line: string): { level: number; content: string } | null {
  let level = 0;
  while (line[level] === "#" && level < 3) level++;
  if (!level || (line[level] !== " " && line[level] !== "\t")) return null;
  let start = level;
  while (line[start] === " " || line[start] === "\t") start++;
  return start < line.length ? { level, content: line.slice(start) } : null;
}
function inline(text: Y.XmlText, inTable = false): string {
  return text
    .toDelta()
    .map((part: { insert?: unknown; attributes?: Record<string, unknown> }) => {
      let value = typeof part.insert === "string" ? part.insert : "";
      value = part.attributes?.code ? codeSpan(value, inTable) : escapeText(value);
      if (part.attributes?.bold) value = `**${value}**`;
      if (part.attributes?.italic) value = `*${value}*`;
      if (part.attributes?.strike) value = `~~${value}~~`;
      if (
        part.attributes?.link &&
        typeof part.attributes.link === "object" &&
        "href" in part.attributes.link
      ) {
        const href = String(part.attributes.link.href);
        const target = destination(href);
        if (target) value = `[${value}](${target})`;
      }
      return value;
    })
    .join("");
}
function markdownNode(node: Y.XmlElement | Y.XmlText | Y.XmlHook, inTable = false): string {
  if (node instanceof Y.XmlText) return inline(node, inTable);
  if (!(node instanceof Y.XmlElement)) return "";
  const content = node.nodeName === "codeBlock" ? node.toArray().map(child => child instanceof Y.XmlText ? child.toDelta().map((part: { insert?: unknown }) => String(part.insert ?? "")).join("") : "").join("") : node.toArray().map(child => markdownNode(child, inTable || node.nodeName === "tableCell" || node.nodeName === "tableHeader")).join("");
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
    case "codeBlock": {
      if (inTable) return codeSpan(content, true);
      const fence = "`".repeat(Math.max(3, (content.match(/`+/g) ?? []).reduce((longest, run) => Math.max(longest, run.length + 1), 0)));
      return `${fence}${String(attributes.language || "").replace(/[`\r\n]/g, "")}\n${content}\n${fence}\n\n`;
    }
    case "horizontalRule":
      return "---\n\n";
    case "image": {
      const target = destination(String(attributes.src), true);
      return target ? `![${escapeText(String(attributes.alt || ""))}](${target})\n\n` : "";
    }
    case "hardBreak":
      return "  \n";
    case "mention":
    case "pageMention":
      return `[[${escapeText(String(attributes.label || attributes.id || ""))}]]`;
    case "dateMention":
      return escapeText(String(attributes.date ?? ""));
    case "fileAttachment":
      return `[${escapeText(String(attributes.name || "File"))}](attachment:${encodeURIComponent(String(attributes.attachmentId || ""))})\n\n`;
    case "table":
      return (
        node
          .toArray()
          .map((row, index) => {
            const cells = row instanceof Y.XmlElement ? row.toArray() : [];
            const line = `| ${cells.map((cell) => tableCell(markdownNode(cell))).join(" | ")} |\n`;
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
        .map(child => markdownNode(child))
        .join("")
        .trimEnd() + "\n"
    );
  } finally {
    document.destroy();
  }
}
function plainInline(value: string): Y.XmlText {
  const text = new Y.XmlText();
  const runs = [...value.matchAll(/`+/g)];
  const next = new Map<number, number>();
  const last = new Map<number, number>();
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i]!;
    const closing = last.get(run[0].length);
    if (closing !== undefined) next.set(run.index, closing);
    last.set(run[0].length, run.index);
  }
  let marker = `\uE000${crypto.randomUUID()}\uE001`;
  while (value.includes(marker)) marker = `\uE000${crypto.randomUUID()}\uE001`;
  const tokens: { content: string; code: boolean }[] = [];
  let masked = "";
  for (let i = 0; i < value.length;) {
    let content: string | undefined;
    let code = false;
    if (value[i] === "\\" && i + 1 < value.length && /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/.test(value[i + 1]!)) {
      content = value[i + 1]!; i += 2;
    } else if (value[i] === "`") {
      const end = next.get(i);
      let length = 1;
      while (value[i + length] === "`") length++;
      if (end !== undefined) {
        content = value.slice(i + length, end).replace(/\r\n?|\n/g, " ");
        if (content.startsWith(" ") && content.endsWith(" ") && content.trim()) content = content.slice(1, -1);
        code = true; i = end + length;
      } else { masked += value.slice(i, i + length); i += length; }
    } else { masked += value[i++]; }
    if (content !== undefined) {
      masked += `${marker}${tokens.length}${marker}`;
      tokens.push({ content, code });
    }
  }
  let cursor = 0;
  const append = (content: string, attributes: Record<string, unknown> = {}) => {
    const parts = content.split(marker);
    for (let i = 0; i < parts.length; i++) {
      const token = i % 2 ? tokens[Number(parts[i])] : undefined;
      const literal = token?.content ?? parts[i]!;
      if (literal) text.insert(cursor, literal, token?.code ? { ...attributes, code: {} } : attributes);
      cursor += literal.length;
    }
  };
  const expression = /\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|\[([^\]]+)\]\((https?:[^\s)]+|mailto:[^\s)]+|attachment:[^\s)]+)\)/g;
  let offset = 0;
  for (const match of masked.matchAll(expression)) {
    append(masked.slice(offset, match.index));
    append(match[1] ?? match[2] ?? match[3] ?? match[4] ?? "", match[1] ? { bold: {} } : match[2] ? { italic: {} } : match[3] ? { strike: {} } : { link: { href: match[5] } });
    offset = match.index + match[0].length;
  }
  append(masked.slice(offset));
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
    const fence = /^(`{3,})([^`]*)$/.exec(line);
    if (fence) {
      list = null;
      const node = new Y.XmlElement("codeBlock");
      node.setAttribute("language", fence[2]!.trim());
      const body: string[] = [];
      while (++index < lines.length && !new RegExp(`^` + "`" + `{${fence[1]!.length},}[ \t]*$`).test(lines[index]!))
        body.push(lines[index]!);
      const text = new Y.XmlText();
      text.insert(0, body.join("\n"));
      node.insert(0, [text]);
      blocks.push(node);
      continue;
    }
    const heading = headingLine(line);
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
    if (heading) node.setAttribute("level", String(heading.level));
    const text = plainInline(heading?.content ?? line.replace(/^> /, ""));
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
    return `# ${escapeText(page.title)}\n\nThis page is encrypted. Its protected document is included in the full workspace export.\n`;
  const document = await workspace.loadDoc(pageId);
  return `# ${escapeText(page.title)}\n\n${document ? documentToMarkdown(document) : ""}`;
}
export async function importMarkdown(
  workspace: WorkspaceStore,
  markdown: string,
  title?: string,
): Promise<Page> {
  if (markdown.length > 20_000_000) throw new Error("Markdown exceeds 20 MB");
  let offset = 0;
  let firstHeading: { title: string; start: number; end: number } | undefined;
  for (const line of markdown.split("\n")) {
    const heading = headingLine(line.endsWith("\r") ? line.slice(0, -1) : line);
    if (heading?.level === 1) { firstHeading = { title: heading.content.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, "$1"), start: offset, end: offset + line.length }; break; }
    offset += line.length + 1;
  }
  const pageTitle = title || firstHeading?.title || "Imported note";
  const update = markdownToDocument(firstHeading && !title ? markdown.slice(0, firstHeading.start) + markdown.slice(firstHeading.end) : markdown);
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
