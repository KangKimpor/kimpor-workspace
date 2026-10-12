import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import * as Y from "yjs";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Bold,
  GripVertical,
  Heading2,
  Italic,
  List,
  Redo2,
  Undo2,
} from "lucide-react";
import { Pressable } from "@veloradesk/ui";
import { loadStudy, saveStudy } from "@veloradesk/core/study-storage";

function SortableBlock({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      className="reorder-row"
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <Pressable
        className="icon-button drag-handle"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${id}`}
      >
        <GripVertical size={18} />
      </Pressable>
      <span>{id}</span>
    </div>
  );
}
function StudyEditor({ doc }: { doc: Y.Doc }) {
  const [slash, setSlash] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [blocks, setBlocks] = useState([
    "An English thought",
    "គំនិតជាភាសាខ្មែរ",
    "一个中文想法",
  ]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      Collaboration.configure({ document: doc }),
    ],
    editorProps: {
      attributes: {
        "aria-label": "Multilingual editor study",
        role: "textbox",
        "aria-multiline": "true",
      },
      handleKeyDown: (_view, event) => {
        if (event.isComposing || event.keyCode === 229 || _view.composing)
          return false;
        if (event.key === "/") setSlash(true);
        if (event.key === "Escape") {
          setSlash(false);
          return true;
        }
        return false;
      },
    },
  });
  useEffect(() => {
    if (!editor) return;
    const save = () => {
      void saveStudy(Y.encodeStateAsUpdate(doc))
        .then(() => setSaveError(false))
        .catch(() => setSaveError(true));
    };
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("veloradesk-editor-study");
    const broadcast = (update: Uint8Array, origin: unknown) => {
      if (origin !== channel) channel?.postMessage(update);
    };
    if (channel)
      channel.onmessage = (event) => {
        if (event.data instanceof Uint8Array)
          Y.applyUpdate(doc, event.data, channel);
      };
    doc.on("update", save);
    doc.on("update", broadcast);
    if (editor.isEmpty)
      editor.commands.setContent(
        "<h2>A thought, in any language.</h2><p>A little space for English, ខ្មែរ and 中文.</p><p>Try a heading, a list, or a new idea. Type / for a few possibilities.</p>",
      );
    return () => {
      doc.off("update", save);
      doc.off("update", broadcast);
      channel?.close();
    };
  }, [editor, doc]);
  function command(kind: "heading" | "list") {
    if (!editor) return;
    const from = editor.state.selection.from;
    if (from > 0 && editor.state.doc.textBetween(from - 1, from) === "/")
      editor
        .chain()
        .focus()
        .deleteRange({ from: from - 1, to: from })
        .run();
    if (kind === "heading")
      editor.chain().focus().setHeading({ level: 2 }).run();
    else editor.chain().focus().toggleBulletList().run();
    setSlash(false);
  }
  function dragEnd(event: DragEndEvent) {
    if (event.over && event.active.id !== event.over.id)
      setBlocks((items) =>
        arrayMove(
          items,
          items.indexOf(String(event.active.id)),
          items.indexOf(String(event.over!.id)),
        ),
      );
  }
  return (
    <>
      <div className="editor-card card">
        <div
          className="editor-toolbar"
          role="toolbar"
          aria-label="Text formatting"
        >
          <Pressable
            className="icon-button"
            aria-label="Bold"
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold size={18} />
          </Pressable>
          <Pressable
            className="icon-button"
            aria-label="Italic"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic size={18} />
          </Pressable>
          <Pressable
            className="icon-button"
            aria-label="Heading"
            onClick={() => command("heading")}
          >
            <Heading2 size={18} />
          </Pressable>
          <Pressable
            className="icon-button"
            aria-label="Bullet list"
            onClick={() => command("list")}
          >
            <List size={18} />
          </Pressable>
          <Pressable
            className="icon-button"
            aria-label="Undo"
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2 size={18} />
          </Pressable>
          <Pressable
            className="icon-button"
            aria-label="Redo"
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Redo2 size={18} />
          </Pressable>
        </div>
        <EditorContent editor={editor} />
        {slash && (
          <div className="slash-menu" role="group" aria-label="Block commands">
            <Pressable className="list-row" onClick={() => command("heading")}>
              <Heading2 size={18} />
              Heading
            </Pressable>
            <Pressable className="list-row" onClick={() => command("list")}>
              <List size={18} />
              Bullet list
            </Pressable>
          </div>
        )}
        {saveError && <div className="editor-status" role="alert">Retry</div>}
      </div>
      <section className="section">
        <span className="section-number">TOUCH & KEYBOARD STUDY</span>
        <h2>A place for every thought.</h2>
        <p className="muted">
          Reorder these sample rows. On touch, hold the handle first; with a
          keyboard, use Space, arrows, then Space.
        </p>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={dragEnd}
        >
          <SortableContext
            items={blocks}
            strategy={verticalListSortingStrategy}
          >
            <div className="reorder-list">
              {blocks.map((id) => (
                <SortableBlock key={id} id={id} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </section>

    </>
  );
}
export default function EditorSpike() {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const next = new Y.Doc();
    let active = true;
    void loadStudy()
      .then((update) => {
        if (!active) return;
        if (update) Y.applyUpdate(next, update);
        setDoc(next);
      })
      .catch(() => {
        if (active) {
          setError(
            "Persistent storage is unavailable. This study will run in memory.",
          );
          setDoc(next);
        }
      });
    return () => {
      active = false;
      next.destroy();
    };
  }, []);
  return (
    <>
      <div className="eyebrow">FOUNDATION / EDITOR STUDY</div>
      <h1>Let your thoughts flow.</h1>
      <p className="muted">English, Khmer, Chinese. One space for all of it.</p>
      {error && <p className="notice">{error}</p>}
      {doc ? (
        <StudyEditor doc={doc} />
      ) : (
        <div className="card skeleton" aria-label="Loading draft" />
      )}
    </>
  );
}
