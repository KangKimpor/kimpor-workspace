import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
let syntax: typeof import("./code-highlighting") | null = null;
let loading: Promise<typeof import("./code-highlighting")> | undefined;
interface SyntaxNode {
  type: string;
  value?: string;
  properties?: { className?: unknown };
  children?: SyntaxNode[];
}
export const CodeSyntax = Extension.create({
  name: "codeSyntax",
  addProseMirrorPlugins() {
    let active = true;
    let wake: (() => void) | undefined;
    function decorations(document: ProseMirrorNode) {
      const ranges: Decoration[] = [];
      document.descendants((node, position) => {
        if (node.type.name !== "codeBlock") return;
        if (!syntax) {
          loading ??= import("./code-highlighting");
          void loading
            .then((value) => {
              syntax = value;
              if (active) wake?.();
            })
            .catch(() => undefined);
          return false;
        }
        let offset = position + 1;
        const visit = (part: SyntaxNode, classes: string[]) => {
          if (part.type === "text") {
            const length = part.value?.length ?? 0;
            if (length && classes.length)
              ranges.push(
                Decoration.inline(offset, offset + length, {
                  class: classes.join(" "),
                }),
              );
            offset += length;
            return;
          }
          const next = Array.isArray(part.properties?.className)
            ? [
                ...classes,
                ...part.properties.className.filter(
                  (item): item is string =>
                    typeof item === "string" && /^hljs-[a-z_-]+$/.test(item),
                ),
              ]
            : classes;
          part.children?.forEach((child) => visit(child, next));
        };
        visit(
          syntax.highlightCode(
            node.textContent,
            String(node.attrs.language ?? "javascript"),
          ) as SyntaxNode,
          [],
        );
        return false;
      });
      return DecorationSet.create(document, ranges);
    }
    return [
      new Plugin({
        key: new PluginKey("velora-code-syntax"),
        props: { decorations: (state) => decorations(state.doc) },
        view: (view) => {
          wake = () =>
            view.dispatch(view.state.tr.setMeta("velora-code-syntax", true));
          return {
            destroy() {
              active = false;
              wake = undefined;
            },
          };
        },
      }),
    ];
  },
});
