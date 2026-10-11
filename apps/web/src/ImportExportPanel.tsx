import { useRef, useState } from "react";
import { Pressable } from "@veloradesk/ui";
import { store } from "@veloradesk/core/store";
import {
  exportWorkspaceZip,
  importWorkspaceZip,
  importMarkdown,
  importCSV,
  exportPageMarkdown,
} from "@veloradesk/core/export";
import { flushEditors } from "./editor-lifecycle";
export default function ImportExportPanel({
  onNotify,
  onError,
}: {
  onNotify: (message: string) => void;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await flushEditors();
      await action();
    } catch (error) {
      onError(String(error));
    } finally {
      setBusy(false);
    }
  };
  const download = (name: string, data: Uint8Array | string, type: string) => {
    const source = typeof data === "string" ? data : Uint8Array.from(data);
    const url = URL.createObjectURL(new Blob([source], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div>
      <div className="ws-settings-actions">
        <Pressable
          className="ws-button ws-tinted"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              download(
                "kimpor-workspace-full-export.zip",
                await exportWorkspaceZip(store),
                "application/zip",
              );
              onNotify("Full workspace ZIP exported.");
            })
          }
        >
          Export full ZIP
        </Pressable>
        <Pressable
          className="ws-button"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          Import Markdown, CSV or Notion ZIP
        </Pressable>
      </div>
      <p className="ws-muted">
        ZIP exports contain JSON, Markdown and files. Encrypted document bodies
        stay encrypted. Notion imports support exported Markdown and CSV;
        proprietary embeds are preserved as text.
      </p>
      <input
        ref={input}
        className="ws-sr-only"
        type="file"
        accept=".md,.markdown,.csv,.zip"
        aria-label="Import portable files"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void run(async () => {
            if (/\.zip$/i.test(file.name))
              await importWorkspaceZip(
                store,
                new Uint8Array(await file.arrayBuffer()),
              );
            else if (/\.csv$/i.test(file.name))
              await importCSV(
                store,
                await file.text(),
                file.name.replace(/\.csv$/i, ""),
              );
            else
              await importMarkdown(
                store,
                await file.text(),
                file.name.replace(/\.(md|markdown)$/i, ""),
              );
            onNotify("File imported.");
            if (input.current) input.current.value = "";
          });
        }}
      />
      <label className="ws-field-label">
        Export a page as Markdown
        <select
          className="ws-input"
          defaultValue=""
          disabled={busy}
          onChange={(event) => {
            const id = event.target.value;
            if (!id) return;
            const page = store.listPages().find((item) => item.id === id);
            void run(async () => {
              download(
                `${(page?.title || "page").replace(/[^\p{L}\p{N} -]/gu, "")}.md`,
                await exportPageMarkdown(store, id),
                "text/markdown",
              );
              onNotify("Page exported.");
            });
            event.target.value = "";
          }}
        >
          <option value="">Choose a page</option>
          {store
            .listPages()
            .filter((page) => !page.properties.__locked)
            .map((page) => (
              <option key={page.id} value={page.id}>
                {page.title || "Untitled"}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
