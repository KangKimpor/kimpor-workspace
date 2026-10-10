import { Node, mergeAttributes } from "@tiptap/core";
import { attachmentAttributes, attachmentView } from "./attachment-nodes";
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  parseHTML: () => [{ tag: "aside[data-callout]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "aside",
    mergeAttributes(HTMLAttributes, {
      "data-callout": "",
      class: "rich-callout",
    }),
    0,
  ],
});
export const Toggle = Node.create({
  name: "toggle",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes: () => ({ label: { default: "A little more detail" } }),
  parseHTML: () => [{ tag: "details[data-toggle]", contentElement: "div" }],
  renderHTML: ({ node, HTMLAttributes }) => [
    "details",
    mergeAttributes(HTMLAttributes, { "data-toggle": "", open: true }),
    ["summary", node.attrs.label],
    ["div", 0],
  ],
});
export const Column = Node.create({
  name: "column",
  content: "block+",
  defining: true,
  isolating: true,
  parseHTML: () => [{ tag: "div[data-column]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    mergeAttributes(HTMLAttributes, { "data-column": "" }),
    0,
  ],
});
export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "column{2,3}",
  defining: true,
  isolating: true,
  parseHTML: () => [{ tag: "div[data-columns]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    mergeAttributes(HTMLAttributes, {
      "data-columns": "",
      class: "rich-columns",
    }),
    0,
  ],
});
export const Equation = Node.create({
  name: "equation",
  group: "block",
  atom: true,
  addAttributes: () => ({ expression: { default: "x^{2} + y^{2} = r^{2}" } }),
  parseHTML: () => [{ tag: "div[data-equation]" }],
  renderHTML: ({ node }) => [
    "div",
    {
      "data-equation": node.attrs.expression,
      class: "rich-equation",
      contenteditable: "false",
    },
    [
      "math",
      { xmlns: "http://www.w3.org/1998/Math/MathML", display: "block" },
      ["mtext", node.attrs.expression],
    ],
  ],
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.className = "rich-equation";
      dom.contentEditable = "false";
      dom.textContent = String(node.attrs.expression);
      let stopped = false;
      void import("./math-renderer")
        .then((module) => {
          if (!stopped) module.renderMath(String(node.attrs.expression), dom);
        })
        .catch(() => {});
      return {
        dom,
        ignoreMutation: () => true,
        destroy() {
          stopped = true;
        },
      };
    };
  },
});
export const PageMention = Node.create({
  name: "pageMention",
  inline: true,
  group: "inline",
  atom: true,
  addAttributes: () => ({ id: { default: "" }, label: { default: "Page" } }),
  parseHTML: () => [{ tag: "a[data-page-mention]" }],
  renderHTML: ({ node }) => [
    "a",
    {
      "data-page-mention": node.attrs.id,
      href: `#page/${encodeURIComponent(node.attrs.id)}`,
      class: "rich-mention",
      contenteditable: "false",
    },
    `↗ ${node.attrs.label}`,
  ],
  renderText: ({ node }) => `[[${node.attrs.label}]]`,
});
export const DateMention = Node.create({
  name: "dateMention",
  inline: true,
  group: "inline",
  atom: true,
  addAttributes: () => ({ date: { default: "" } }),
  parseHTML: () => [{ tag: "time[data-date-mention]" }],
  renderHTML: ({ node }) => [
    "time",
    {
      "data-date-mention": "",
      datetime: node.attrs.date,
      class: "rich-mention",
      contenteditable: "false",
    },
    node.attrs.date,
  ],
  renderText: ({ node }) => String(node.attrs.date),
});
export const FileAttachment = Node.create({
  name: "fileAttachment",
  group: "block",
  atom: true,
  addAttributes: () => ({
    ...attachmentAttributes(),
    name: { default: "File" },
    data: { default: "" },
    size: { default: 0 },
  }),
  parseHTML: () => [{ tag: "a[data-file-attachment]" }],
  renderHTML: ({ node }) => [
    "a",
    {
      "data-file-attachment": "",
      href: /^data:[^,]+;base64,/.test(String(node.attrs.data))
        ? node.attrs.data
        : "",
      download: node.attrs.name,
      class: "rich-file",
      contenteditable: "false",
    },
    `↓ ${node.attrs.name} · ${Math.ceil(Number(node.attrs.size) / 1024)} KB`,
  ],
  addNodeView() {
    return attachmentView(false);
  },
});
