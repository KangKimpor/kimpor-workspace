import Image from "@tiptap/extension-image";
import type { NodeViewRenderer } from "@tiptap/core";
import { store } from "@veloradesk/core/store";
import { decryptAttachment } from "@veloradesk/core/crypto";

export const attachmentAttributes = () => ({
  attachmentId: { default: "" },
  fileKey: { default: "" },
  fileIv: { default: "" },
  mime: { default: "application/octet-stream" },
});
/** Object URLs are created only after an owner-scoped local read and authenticated decryption. */
export const attachmentView =
  (image: boolean): NodeViewRenderer =>
  ({ node }) => {
    const dom = document.createElement(image ? "figure" : "div");
    dom.contentEditable = "false";
    dom.className = image ? "rich-attachment-image" : "rich-file";
    let stopped = false,
      objectUrl = "";
    const render = async () => {
      if (!node.attrs.attachmentId) {
        if (image) {
          const img = document.createElement("img");
          const src = String(node.attrs.src);
          if (
            /^(https?:|data:image\/(png|jpeg|webp|gif|avif);base64,)/i.test(src)
          )
            img.src = src;
          img.alt = String(node.attrs.alt || "");
          dom.replaceChildren(img);
        } else {
          const a = document.createElement("a");
          const data = String(node.attrs.data);
          if (/^data:[^,]+;base64,/.test(data)) a.href = data;
          a.download = String(node.attrs.name || "File");
          a.textContent = `↓ ${a.download}`;
          dom.replaceChildren(a);
        }
        return;
      }
      const file = await store.getAttachment(String(node.attrs.attachmentId));
      if (stopped) return;
      if (!file) {
        dom.textContent = "Waiting for this attachment to sync…";
        return;
      }
      const bytes = await decryptAttachment(
        file.bytes,
        String(node.attrs.fileKey),
        String(node.attrs.fileIv),
        file.id,
      );
      if (stopped) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(
        new Blob([new Uint8Array(bytes).buffer], {
          type: String(node.attrs.mime),
        }),
      );
      if (image) {
        const img = document.createElement("img");
        img.src = objectUrl;
        img.alt = String(node.attrs.alt || node.attrs.name || "Attachment");
        dom.replaceChildren(img);
      } else {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = String(node.attrs.name || "File");
        link.textContent = `↓ ${link.download} · ${Math.ceil(Number(node.attrs.size) / 1024)} KB`;
        dom.replaceChildren(link);
      }
    };
    let loaded = false;
    const load = () => {
      if (loaded || stopped) return;
      void render()
        .then(() => {
          loaded = !!dom.querySelector("img,a");
        })
        .catch(() => {
          if (!stopped)
            dom.textContent =
              "Could not decrypt this attachment. Restore it from a full backup.";
        });
    };
    dom.textContent = "Opening attachment…";
    load();
    const unsubscribe = store.subscribe(load);
    return {
      dom,
      ignoreMutation: () => true,
      destroy() {
        stopped = true;
        unsubscribe();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      },
    };
  };
export const AttachmentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...attachmentAttributes(),
      name: { default: "" },
      size: { default: 0 },
    };
  },
  addNodeView() {
    return attachmentView(true);
  },
});
