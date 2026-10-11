import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TableKit } from "@tiptap/extension-table";
import { CodeSyntax } from "./code-extension";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import * as Y from "yjs";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  MeasuringStrategy,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Bold,
  MoreHorizontal,
  Check,
  Code2,
  FilePlus2,
  GripVertical,
  Heading2,
  Highlighter,
  ImagePlus,
  Italic,
  List,
  ListChecks,
  LockKeyhole,
  Palette,
  PenLine,
  Plus,
  Redo2,
  Search,
  ShieldCheck,
  Underline,
  Undo2,
  X,
} from "lucide-react";
import { Pressable } from "@veloradesk/ui";
import { store } from "@veloradesk/core/store";
import {
  createRecoveryKey,
  currentEnvelope,
  decryptWithKey,
  encryptBytes,
  encryptAttachment,
  encryptWithKey,
  rewrapPassphrase,
  unlockEnvelope,
  type EncryptedEnvelope,
} from "@veloradesk/core/crypto";
import { compressImage } from "@veloradesk/core/export";
import { AttachmentImage } from "./attachment-nodes";
import {
  Callout,
  Column,
  Columns,
  DateMention,
  Equation,
  FileAttachment,
  PageMention,
  Toggle,
} from "./editor-nodes";
const SketchCanvas = lazy(() => import("./SketchCanvas"));
import { registerEditorFlush } from "./editor-lifecycle";
import "./rich-editor.css";

interface Session {
  doc: Y.Doc;
  key?: CryptoKey;
  envelope?: EncryptedEnvelope;
}
interface Command {
  id: string;
  label: string;
  detail: string;
  run: (editor: Editor) => void;
}
interface Menu {
  kind: "block" | "mention";
  from: number;
  marker: boolean;
}
interface Block {
  id: string;
  index: number;
  top: number;
  label: string;
}
const EMPTY = { type: "paragraph" };
const block = (type: string, attrs?: Record<string, unknown>) => ({
  type,
  attrs,
  content: [EMPTY],
});
const commands: Command[] = [
  {
    id: "paragraph",
    label: "Text",
    detail: "A plain paragraph",
    run: (editor) => {
      editor.chain().focus().setParagraph().run();
    },
  },
  ...([1, 2, 3] as const).map((level) => ({
    id: `heading-${level}`,
    label: `Heading ${level}`,
    detail: "Give an idea a little structure",
    run: (editor: Editor) => {
      editor.chain().focus().setHeading({ level }).run();
    },
  })),
  {
    id: "bullets",
    label: "Bullet list",
    detail: "Collect a few ideas",
    run: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    id: "numbered",
    label: "Numbered list",
    detail: "Take it step by step",
    run: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    id: "todo",
    label: "To-do list",
    detail: "Check things off",
    run: (editor) => {
      editor.chain().focus().toggleTaskList().run();
    },
  },
  {
    id: "toggle",
    label: "Toggle",
    detail: "Keep a detail tucked away",
    run: (editor) => {
      editor.chain().focus().insertContent(block("toggle")).run();
    },
  },
  {
    id: "quote",
    label: "Quote",
    detail: "A thought to remember",
    run: (editor) => {
      editor.chain().focus().toggleBlockquote().run();
    },
  },
  {
    id: "callout",
    label: "Callout",
    detail: "Let an idea stand out",
    run: (editor) => {
      editor.chain().focus().insertContent(block("callout")).run();
    },
  },
  {
    id: "divider",
    label: "Divider",
    detail: "A quiet pause",
    run: (editor) => {
      editor.chain().focus().setHorizontalRule().run();
    },
  },
  {
    id: "code",
    label: "Code",
    detail: "Highlighted JavaScript, Python, SQL and more",
    run: (editor) => {
      editor.chain().focus().toggleCodeBlock({ language: "javascript" }).run();
    },
  },
  {
    id: "table",
    label: "Table",
    detail: "A simple grid",
    run: (editor) => {
      editor
        .chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    },
  },
  {
    id: "date",
    label: "Today’s date",
    detail: "An inline date reference",
    run: (editor) => {
      editor
        .chain()
        .focus()
        .insertContent([
          {
            type: "dateMention",
            attrs: { date: new Date().toLocaleDateString("en-CA") },
          },
          { type: "text", text: " " },
        ])
        .run();
    },
  },
  {
    id: "columns",
    label: "Columns",
    detail: "Two columns that stack on a small screen",
    run: (editor) => {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "columns",
          content: [block("column"), block("column")],
        })
        .run();
    },
  },
  {
    id: "math",
    label: "Equation",
    detail: "A mathematical expression",
    run: (editor) => {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "equation",
          attrs: { expression: "x^{2} + y^{2} = r^{2}" },
        })
        .run();
    },
  },
];
function DragHandle({ item }: { item: Block }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      className="rich-block-handle"
      style={{
        top: item.top,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <Pressable
        className="icon-button drag-handle"
        {...attributes}
        {...listeners}
        aria-label={`Move block ${item.index + 1}: ${item.label}`}
      >
        <GripVertical size={17} />
      </Pressable>
    </div>
  );
}
function SessionEditor({
  pageId,
  session,
  onTextChange,
  onLock,
  onEnableEncryption,
}: {
  pageId: string;
  session: Session;
  onTextChange?: (text: string) => void;
  onLock: () => void;
  onEnableEncryption: () => void;
}) {
  const [status, setStatus] = useState("Saved on this device"),
    [menu, setMenu] = useState<Menu | null>(null),
    [query, setQuery] = useState(""),
    [activeCommand, setActiveCommand] = useState(0);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [find, setFind] = useState(false),
    [findText, setFindText] = useState(""),
    [findResult, setFindResult] = useState(""),
    [sketch, setSketch] = useState(false),
    [blocks, setBlocks] = useState<Block[]>([]),
    [notice, setNotice] = useState("");
  const [linkPanel, setLinkPanel] = useState(false),
    [linkUrl, setLinkUrl] = useState(""),
    [equationPanel, setEquationPanel] = useState(false),
    [equation, setEquation] = useState("x^{2} + y^{2} = r^{2}");
  const holder = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    composing = useRef(false),
    menuRef = useRef(menu),
    selected = useRef<() => void>(() => undefined),
    onText = useRef(onTextChange);
  const draggedBlock = useRef<number | null>(null);
  const saveQueue = useRef(Promise.resolve()),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    persist = useRef<() => Promise<void>>(() => Promise.resolve()),
    channel = useRef<BroadcastChannel | null>(null),
    mounted = useRef(true);
  const [saved] = useState(() => ({
    state: Y.encodeStateAsUpdate(session.doc),
    vector: Y.encodeStateVector(session.doc),
    pending: true,
  }));
  const attachmentFlight = useRef<Promise<void>>(Promise.resolve());
  menuRef.current = menu;
  onText.current = onTextChange;
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          undoRedo: false,
          codeBlock: { defaultLanguage: "javascript" },
          link: { openOnClick: false, protocols: ["https", "http", "mailto"] },
        }),
        Collaboration.configure({ document: session.doc }),
        TaskList,
        TaskItem.configure({ nested: true }),
        TableKit,
        AttachmentImage.configure({ allowBase64: true }),
        CodeSyntax,
        TextStyle,
        Color,
        Highlight,
        Callout,
        Toggle,
        Columns,
        Column,
        Equation,
        FileAttachment,
        PageMention,
        DateMention,
      ],
      editorProps: {
        attributes: {
          class: "rich-document",
          "aria-label": "Document editor",
          role: "textbox",
          "aria-multiline": "true",
        },
        handleDOMEvents: {
          compositionstart: () => {
            composing.current = true;
            setMenu(null);
            return false;
          },
          compositionend: () => {
            composing.current = false;
            return false;
          },
        },
        handleKeyDown: (view, event) => {
          if (
            event.isComposing ||
            event.keyCode === 229 ||
            view.composing ||
            composing.current
          )
            return false;
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "f"
          ) {
            setFind(true);
            return true;
          }
          if (event.key === "Escape") {
            setMenu(null);
            setFind(false);
            return false;
          }
          if (menuRef.current && event.key === "Enter") {
            selected.current();
            return true;
          }
          if (
            menuRef.current &&
            (event.key === "ArrowDown" || event.key === "ArrowUp")
          ) {
            setActiveCommand((value) =>
              Math.max(0, value + (event.key === "ArrowDown" ? 1 : -1)),
            );
            return true;
          }
          if (event.key === "/") {
            setQuery("");
            setActiveCommand(0);
            setMenu({
              kind: "block",
              from: view.state.selection.from,
              marker: true,
            });
          }
          if (
            event.key === "@" ||
            (event.key === "[" &&
              view.state.doc.textBetween(
                Math.max(0, view.state.selection.from - 1),
                view.state.selection.from,
              ) === "[")
          ) {
            setQuery("");
            setActiveCommand(0);
            setMenu({
              kind: "mention",
              from: view.state.selection.from - (event.key === "[" ? 1 : 0),
              marker: true,
            });
          }
          return false;
        },
        handlePaste: (_view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []);
          if (!files.length || composing.current) return false;
          event.preventDefault();
          void attach(files);
          return true;
        },
        handleDrop: (_view, event) => {
          const files = Array.from(event.dataTransfer?.files ?? []);
          if (!files.length || composing.current) return false;
          event.preventDefault();
          void attach(files);
          return true;
        },
      },
      onUpdate: ({ editor: instance }) => {
        const open = menuRef.current;
        if (!open || composing.current || instance.view.composing) return;
        const selection = instance.state.selection.from;
        if (selection < open.from) {
          setMenu(null);
          return;
        }
        const typed = instance.state.doc.textBetween(open.from, selection);
        const value = typed.replace(/^(?:\/|@|\[\[)/, "");
        if (value.includes("\n") || value.length > 64) setMenu(null);
        else {
          setQuery(value);
          setActiveCommand(0);
        }
      },
    },
    [session.doc],
  );
  const refreshHandles = useCallback(() => {
    if (!editor || !holder.current) return;
    const rect = holder.current.getBoundingClientRect();
    const offsets: number[] = [];
    editor.state.doc.forEach((node, offset, index) => {
      offsets[index] = offset;
    });
    const bounds = (index: number) => {
      const offset = offsets[index];
      if (offset === undefined) return null;
      const element = editor.view.nodeDOM(offset);
      return element instanceof HTMLElement
        ? element.getBoundingClientRect()
        : null;
    };
    const viewport = window.visualViewport;
    const height = viewport?.height ?? window.innerHeight;
    const overscan = Math.max(200, height / 2);
    const top = (viewport?.offsetTop ?? 0) - overscan;
    const bottom = top + height + overscan * 2;
    // Blocks are in document order. Find the visible range without laying out
    // every block or mounting thousands of sortable controls while typing.
    let lower = 0;
    let upper = offsets.length;
    while (lower < upper) {
      const middle = (lower + upper) >>> 1;
      if ((bounds(middle)?.bottom ?? Infinity) < top) lower = middle + 1;
      else upper = middle;
    }
    const first = lower;
    upper = offsets.length;
    while (lower < upper) {
      const middle = (lower + upper) >>> 1;
      if ((bounds(middle)?.top ?? Infinity) <= bottom) lower = middle + 1;
      else upper = middle;
    }
    const indices = Array.from({ length: lower - first }, (_, index) => first + index);
    if (
      draggedBlock.current !== null &&
      draggedBlock.current < offsets.length &&
      !indices.includes(draggedBlock.current)
    ) indices.push(draggedBlock.current);
    indices.sort((a, b) => a - b);
    const next: Block[] = [];
    for (const index of indices) {
      const blockBounds = bounds(index);
      if (!blockBounds) continue;
      const node = editor.state.doc.child(index);
      next.push({
        id: `block-${index}`,
        index,
        top: blockBounds.top - rect.top,
        label: node.textContent.slice(0, 32) || node.type.name,
      });
    }
    setBlocks(previous =>
      previous.length === next.length && previous.every((item, index) => {
        const current = next[index];
        return current && item.id === current.id && item.top === current.top && item.label === current.label;
      }) ? previous : next,
    );
  }, [editor]);
  useEffect(() => {
    if (!editor) return;
    let frame = 0;
    const scheduleHandles = () => {
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        refreshHandles();
      });
    };
    const observer = new ResizeObserver(scheduleHandles);
    if (holder.current) observer.observe(holder.current);
    editor.on("update", scheduleHandles);
    editor.on("selectionUpdate", scheduleHandles);
    window.addEventListener("scroll", scheduleHandles, true);
    window.addEventListener("resize", scheduleHandles);
    window.visualViewport?.addEventListener("resize", scheduleHandles);
    scheduleHandles();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      editor.off("update", scheduleHandles);
      editor.off("selectionUpdate", scheduleHandles);
      window.removeEventListener("scroll", scheduleHandles, true);
      window.removeEventListener("resize", scheduleHandles);
      window.visualViewport?.removeEventListener("resize", scheduleHandles);
    };
  }, [editor, refreshHandles]);
  useEffect(() => {
    if (!editor) return;
    mounted.current = true;
    const account = store.accountId;
    channel.current =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(`veloradesk-document:${account}:${pageId}`);
    persist.current = () => {
      const action = async () => {
        if (account !== store.accountId) return;
        if (session.key && session.envelope) {
          // A full merged state supersedes only shards this client actually decrypted.
          const shards = await store.loadEncryptedShards(pageId);
          for (const { envelope } of shards)
            Y.applyUpdate(
              session.doc,
              await decryptWithKey(envelope, session.key),
              "encrypted-merge",
            );
          if (shards.length)
            session.envelope = currentEnvelope([
              session.envelope,
              ...shards.map((item) => item.envelope),
            ]);
          const state = Y.encodeStateAsUpdate(session.doc);
          if (
            state.length === saved.state.length &&
            state.every(
              (value, index) => value === saved.state[index],
            )
          ) {
            if (mounted.current) setStatus("Saved on this device");
            return;
          }
          const envelope = await encryptWithKey(
            state,
            session.key,
            session.envelope,
          );
          session.envelope = envelope;
          await store.saveEncryptedDoc(
            pageId,
            envelope,
            shards.slice(-1000).map((item) => item.id),
          );
          channel.current?.postMessage({ kind: "encrypted", envelope });
          saved.state = state;
        } else {
          if (!saved.pending) {
            if (mounted.current) setStatus("Saved on this device");
            return;
          }
          // Persist only changes since the last successful write. The store
          // merges them into its durable snapshot and queues the same delta.
          const vector = Y.encodeStateVector(session.doc);
          const update = Y.encodeStateAsUpdate(session.doc, saved.vector);
          saved.pending = false;
          if (update.length === 2 && update[0] === 0 && update[1] === 0) {
            if (mounted.current) setStatus("Saved on this device");
            return;
          }
          try {
            await store.saveDoc(pageId, update);
          } catch (cause) {
            saved.pending = true;
            throw cause;
          }
          saved.vector = vector;
          onText.current?.(editor.getText());
        }
        if (mounted.current) setStatus("Saved on this device");
      };
      const next = saveQueue.current.then(action);
      saveQueue.current = next.catch(() => {
        if (mounted.current)
          setStatus("Could not save. Keep this tab open and export your work.");
      });
      return next;
    };
    const schedule = (update: Uint8Array, origin: unknown) => {
      saved.pending = true;
      if (mounted.current) setStatus("Saving…");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void persist.current().catch(() => undefined);
      }, 500);
      if (!session.key && origin !== "broadcast" && origin !== "store")
        channel.current?.postMessage({ kind: "update", update });
    };
    const broadcast = channel.current;
    if (broadcast)
      broadcast.onmessage = (event) => {
        if (
          event.data?.kind === "update" &&
          !session.key &&
          event.data.update instanceof Uint8Array
        )
          Y.applyUpdate(session.doc, event.data.update, "broadcast");
        if (event.data?.kind === "encrypted" && session.key)
          void decryptWithKey(
            event.data.envelope as EncryptedEnvelope,
            session.key,
          )
            .then((update) =>
              Y.applyUpdate(session.doc, update, "encrypted-merge"),
            )
            .catch(() => {
              if (mounted.current)
                setStatus(
                  "Another tab changed document protection. Lock and reopen this document.",
                );
            });
      };
    const unsubscribe = store.subscribe(() => {
      if (account !== store.accountId) return;
      if (session.key)
        void store
          .loadEncryptedDocs(pageId)
          .then(async (envelopes) => {
            for (const envelope of envelopes)
              Y.applyUpdate(
                session.doc,
                await decryptWithKey(envelope, session.key!),
                "encrypted-merge",
              );
          })
          .catch(() => undefined);
      else
        void store
          .loadDoc(pageId)
          .then((update) => {
            if (update && mounted.current)
              Y.applyUpdate(session.doc, update, "store");
          })
          .catch(() => undefined);
    });
    session.doc.on("update", schedule);
    // An untouched empty journal is not materialized until the first edit.
    if (!session.key && !editor.isEmpty) onText.current?.(editor.getText());
    const flush = async () => {
      // ProseMirror may still have DOM input waiting in its mutation observer.
      // Read it before encoding Yjs state and before navigation unmounts the view.
      if (!editor.isDestroyed) {
        const view = editor.view as unknown as {
          domObserver?: { flush(): void };
        };
        view.domObserver?.flush();
      }
      clearTimeout(timer.current);
      await attachmentFlight.current;
      await persist.current();
    };
    const backgroundFlush = () => {
      void flush().catch(() => undefined);
    };
    const unregisterFlush = registerEditorFlush(flush);
    const visibility = () => {
      if (document.visibilityState === "hidden") backgroundFlush();
    };
    window.addEventListener("pagehide", backgroundFlush);
    window.addEventListener("velora-flush-editors", backgroundFlush);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      session.doc.off("update", schedule);
      unsubscribe();
      unregisterFlush();
      window.removeEventListener("pagehide", backgroundFlush);
      window.removeEventListener("velora-flush-editors", backgroundFlush);
      document.removeEventListener("visibilitychange", visibility);
      broadcast?.close();
      channel.current = null;
      void persist.current().catch(() => undefined);
    };
  }, [editor, pageId, saved, session]);
  function attach(files: File[]) {
    const next = attachmentFlight.current.then(() => readAttachments(files));
    attachmentFlight.current = next.catch(() => undefined);
    return next;
  }
  async function readAttachments(files: File[]) {
    if (!editor) return;
    const owner = store.accountId;
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024 - 16) {
        setNotice(
          "Choose a file smaller than 10 MB. Larger files can be linked instead.",
        );
        continue;
      }
      try {
        const compressed = await compressImage(file);
        const id = crypto.randomUUID();
        const encrypted = await encryptAttachment(
          new Uint8Array(await compressed.arrayBuffer()),
          id,
        );
        if (owner !== store.accountId)
          throw new Error("Workspace account changed");
        await store.saveAttachment(
          pageId,
          new Blob([new Uint8Array(encrypted.bytes).buffer], {
            type: "application/octet-stream",
          }),
          "Encrypted attachment",
          id,
        );
        const attrs = {
          attachmentId: id,
          fileKey: encrypted.key,
          fileIv: encrypted.iv,
          mime: compressed.type,
          name: file.name,
          size: compressed.size,
        };
        if (/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type))
          editor
            .chain()
            .focus()
            .insertContent([
              {
                type: "image",
                attrs: { ...attrs, src: `attachment:${id}`, alt: file.name },
              },
              { type: "paragraph" },
            ])
            .run();
        else
          editor
            .chain()
            .focus()
            .insertContent([
              { type: "fileAttachment", attrs },
              { type: "paragraph" },
            ])
            .run();
      } catch {
        setNotice(`Could not read ${file.name}.`);
      }
    }
  }
  function clearMarker() {
    if (editor && menu?.marker)
      editor
        .chain()
        .focus()
        .deleteRange({ from: menu.from, to: editor.state.selection.from })
        .run();
  }
  function run(command: Command) {
    if (!editor || composing.current || editor.view.composing) return;
    clearMarker();
    command.run(editor);
    setMenu(null);
  }
  function mention(id: string, label: string) {
    if (!editor || composing.current) return;
    clearMarker();
    editor
      .chain()
      .focus()
      .insertContent([
        { type: "pageMention", attrs: { id, label } },
        { type: "text", text: " " },
      ])
      .run();
    setMenu(null);
  }
  const filtered = commands.filter((command) =>
    `${command.label} ${command.id}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const mentions =
    menu?.kind === "mention"
      ? store
          .listPages()
          .filter(
            (page) =>
              page.id !== pageId &&
              page.title.toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, 12)
      : [];
  selected.current = () => {
    if (menu?.kind === "mention") {
      const page = mentions[Math.min(activeCommand, mentions.length - 1)];
      if (page) mention(page.id, page.title);
    } else {
      const command = filtered[Math.min(activeCommand, filtered.length - 1)];
      if (command) run(command);
    }
  };
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 300, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  // Visible handles keep their index in the complete document while scrolling.
  const blockCount = editor?.state.doc.childCount ?? 0;
  const blockIds = useMemo(
    () => Array.from({ length: blockCount }, (_, index) => `block-${index}`),
    [blockCount],
  );
  function moveBlock(event: DragEndEvent) {
    if (!editor || !event.over || event.active.id === event.over.id) return;
    const from = blocks.find((item) => item.id === event.active.id)?.index,
      to = blocks.find((item) => item.id === event.over!.id)?.index;
    if (from === undefined || to === undefined) return;
    const nodes: { pos: number; size: number }[] = [];
    editor.state.doc.forEach((node, pos) =>
      nodes.push({ pos, size: node.nodeSize }),
    );
    const source = nodes[from],
      destination = nodes[to];
    if (!source || !destination) return;
    const node = editor.state.doc.child(from);
    const position =
      from < to
        ? destination.pos + destination.size - source.size
        : destination.pos;
    const transaction = editor.state.tr
      .delete(source.pos, source.pos + source.size)
      .insert(position, node);
    editor.view.dispatch(transaction);
    refreshHandles();
  }
  function findNext() {
    if (!editor || !findText) return;
    const matches: { from: number; to: number }[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;
      let index = node.text
        .toLocaleLowerCase()
        .indexOf(findText.toLocaleLowerCase());
      while (index !== -1) {
        matches.push({ from: pos + index, to: pos + index + findText.length });
        index = node.text
          .toLocaleLowerCase()
          .indexOf(findText.toLocaleLowerCase(), index + 1);
      }
    });
    const match =
      matches.find((item) => item.from > editor.state.selection.from) ??
      matches[0];
    if (match)
      editor.chain().focus().setTextSelection(match).scrollIntoView().run();
    setFindResult(
      matches.length
        ? `${matches.length} match${matches.length === 1 ? "" : "es"}`
        : "No matches",
    );
  }
  async function lock() {
    try {
      clearTimeout(timer.current);
      await attachmentFlight.current;
      await persist.current();
      onLock();
    } catch {
      setNotice("Wait until the document saves before locking.");
    }
  }
  if (!editor) return <p className="rich-hint">Opening your document…</p>;
  return (
    <div className="rich-editor">
      <div
        className={`rich-toolbar ${toolsExpanded ? "expanded" : ""}`}
        role="toolbar"
        aria-label="Document formatting"
      >
        <Pressable
          className="icon-button"
          aria-label="Add a block"
          onClick={() => {
            setQuery("");
            setMenu({
              kind: "block",
              from: editor.state.selection.from,
              marker: false,
            });
          }}
        >
          <Plus size={18} />
        </Pressable>
        <Pressable
          className="icon-button"
          aria-label="Bold text"
          aria-pressed={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={18} />
        </Pressable>
        <Pressable
          className="icon-button rich-tool-secondary"
          aria-label="Italic text"
          aria-pressed={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={18} />
        </Pressable>
        <Pressable
          className="icon-button rich-tool-secondary"
          aria-label="Underline text"
          aria-pressed={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline size={18} />
        </Pressable>
        <Pressable
          className="icon-button rich-tool-secondary"
          aria-label="Highlight text"
          aria-pressed={editor.isActive("highlight")}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
        >
          <Highlighter size={18} />
        </Pressable>
        <Pressable
          className="icon-button rich-tool-secondary"
          aria-label="Heading 2"
          onClick={() => editor.chain().focus().setHeading({ level: 2 }).run()}
        >
          <Heading2 size={18} />
        </Pressable>
        <Pressable
          className="icon-button rich-tool-secondary"
          aria-label="Bullet list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={18} />
        </Pressable>
        <Pressable
          className="icon-button"
          aria-label="Checklist"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <ListChecks size={18} />
        </Pressable>
        <label className="rich-color rich-tool-secondary">
          <Palette size={18} />
          <span className="sr-only">Text color</span>
          <select
            aria-label="Text color"
            defaultValue="inherit"
            onChange={(event) =>
              editor
                .chain()
                .focus()
                .setColor(
                  event.target.value === "inherit"
                    ? "inherit"
                    : `var(--${event.target.value})`,
                )
                .run()
            }
          >
            <option value="inherit">Text color</option>
            <option value="accent">Blue</option>
            <option value="success">Green</option>
            <option value="purple">Purple</option>
            <option value="warm">Amber</option>
            <option value="danger">Red</option>
          </select>
        </label>
        <Pressable
          className="icon-button rich-tool-secondary"
          aria-label="Insert image"
          onClick={() => imageInput.current?.click()}
        >
          <ImagePlus size={18} />
        </Pressable>
        <Pressable
          className="icon-button rich-tool-secondary"
          aria-label="Attach file"
          onClick={() => fileInput.current?.click()}
        >
          <FilePlus2 size={18} />
        </Pressable>
        <Pressable
          className="icon-button rich-tool-secondary"
          aria-label="Add a link"
          onClick={() => setLinkPanel((value) => !value)}
        >
          ↗
        </Pressable>
        <Pressable
          className="icon-button rich-tool-secondary"
          aria-label="Add equation"
          onClick={() => setEquationPanel((value) => !value)}
        >
          <Code2 size={18} />
        </Pressable>
        <Pressable
          className="icon-button rich-tool-secondary"
          aria-label="Find in document"
          onClick={() => setFind((value) => !value)}
        >
          <Search size={18} />
        </Pressable>
        <Pressable
          className="icon-button"
          aria-label="Undo typing"
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={18} />
        </Pressable>
        <Pressable
          className="icon-button rich-tool-secondary"
          aria-label="Redo typing"
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={18} />
        </Pressable>
        <Pressable
          className="icon-button rich-tool-secondary"
          aria-label="Sketch canvas"
          aria-pressed={sketch}
          onClick={() => setSketch((value) => !value)}
        >
          <PenLine size={18} />
        </Pressable>
        <Pressable
          className="icon-button rich-tool-secondary"
          aria-label={session.key ? "Lock document" : "Protect document"}
          onClick={() => {
            if (session.key) void lock();
            else
              void attachmentFlight.current
                .then(() => persist.current())
                .then(onEnableEncryption)
                .catch(() =>
                  setNotice(
                    "Wait until attachments and edits save before protecting this document.",
                  ),
                );
          }}
        >
          <LockKeyhole size={18} />
        </Pressable>
        <Pressable
          className="icon-button rich-tools-toggle"
          aria-label={toolsExpanded ? "Less formatting" : "More formatting"}
          aria-expanded={toolsExpanded}
          onClick={() => setToolsExpanded((value) => !value)}
        >
          {toolsExpanded ? <X size={18} /> : <MoreHorizontal size={18} />}
        </Pressable>
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        aria-label="Choose attachment"
        onChange={(event) => {
          void attach(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        multiple
        hidden
        aria-label="Choose image"
        onChange={(event) => {
          void attach(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      {find && (
        <div className="rich-inline-panel">
          <input
            autoFocus
            className="text-field"
            aria-label="Find text"
            placeholder="Find in this document"
            value={findText}
            onChange={(event) => setFindText(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              )
                findNext();
            }}
          />
          <Pressable className="button plain" onClick={findNext}>
            Next
          </Pressable>
          <span role="status">{findResult}</span>
          <Pressable
            className="icon-button"
            aria-label="Close find"
            onClick={() => setFind(false)}
          >
            <X size={18} />
          </Pressable>
        </div>
      )}
      {linkPanel && (
        <div className="rich-inline-panel">
          <input
            autoFocus
            className="text-field"
            type="url"
            aria-label="Link address"
            placeholder="https://"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
          />
          <Pressable
            className="button plain"
            onClick={() => {
              if (/^(https?:\/\/|mailto:)/i.test(linkUrl)) {
                editor.chain().focus().setLink({ href: linkUrl }).run();
                setLinkPanel(false);
              } else setNotice("Use an https, http or mailto address.");
            }}
          >
            Add link
          </Pressable>
        </div>
      )}
      {equationPanel && (
        <div className="rich-inline-panel">
          <input
            className="text-field"
            aria-label="Equation expression"
            value={equation}
            onChange={(event) => setEquation(event.target.value)}
          />
          <Pressable
            className="button plain"
            onClick={() => {
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "equation",
                  attrs: { expression: equation },
                })
                .run();
              setEquationPanel(false);
            }}
          >
            Insert equation
          </Pressable>
        </div>
      )}
      {menu && (
        <div
          className="rich-command-menu"
          role="group"
          aria-label={
            menu.kind === "mention" ? "Mention a page" : "Block commands"
          }
        >
          <input
            className="text-field"
            aria-label="Filter block commands"
            placeholder={
              menu.kind === "mention" ? "Find a page" : "Choose a block…"
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveCommand(0);
            }}
          />
          {menu.kind === "mention" ? (
            mentions.map((page, index) => (
              <Pressable
                key={page.id}
                className={`rich-command ${index === Math.min(activeCommand, mentions.length - 1) ? "active" : ""}`}
                onClick={() => mention(page.id, page.title)}
              >
                {page.title}
              </Pressable>
            ))
          ) : (
            <>
              {filtered.map((command, index) => (
                <Pressable
                  key={command.id}
                  className={`rich-command ${index === Math.min(activeCommand, filtered.length - 1) ? "active" : ""}`}
                  onClick={() => run(command)}
                >
                  <strong>{command.label}</strong>
                  <small>{command.detail}</small>
                </Pressable>
              ))}
              <Pressable
                className="rich-command"
                onClick={() => {
                  clearMarker();
                  setMenu(null);
                  imageInput.current?.click();
                }}
              >
                <strong>Image</strong>
                <small>Photos, camera or photo library</small>
              </Pressable>
              <Pressable
                className="rich-command"
                onClick={() => {
                  clearMarker();
                  setMenu(null);
                  fileInput.current?.click();
                }}
              >
                <strong>File</strong>
                <small>An attachment saved with this page</small>
              </Pressable>
              <Pressable
                className="rich-command"
                onClick={() => {
                  clearMarker();
                  setQuery("");
                  setMenu({
                    kind: "mention",
                    from: editor.state.selection.from,
                    marker: false,
                  });
                }}
              >
                <strong>Mention a page</strong>
                <small>Link your ideas</small>
              </Pressable>
            </>
          )}
          {!(menu.kind === "mention" ? mentions : filtered).length && (
            <p className="rich-hint">
              No matching {menu.kind === "mention" ? "pages" : "commands"}.
            </p>
          )}
          <Pressable className="button plain" onClick={() => setMenu(null)}>
            Close
          </Pressable>
        </div>
      )}
      <DndContext
        sensors={sensors}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        collisionDetection={closestCenter}
        onDragStart={event => {
          draggedBlock.current = blocks.find(item => item.id === event.active.id)?.index ?? null;
        }}
        onDragCancel={() => { draggedBlock.current = null; refreshHandles(); }}
        onDragEnd={event => { draggedBlock.current = null; moveBlock(event); refreshHandles(); }}
      >
        <SortableContext
          items={blockIds}
          strategy={verticalListSortingStrategy}
        >
          <div ref={holder} className="rich-document-wrap">
            <div className="rich-block-gutter">
              {blocks.map((item) => (
                <DragHandle key={item.id} item={item} />
              ))}
            </div>
            <EditorContent editor={editor} />
          </div>
        </SortableContext>
      </DndContext>
      {editor.isActive("table") && (
        <div className="rich-inline-panel">
          <Pressable
            className="button plain"
            onClick={() => editor.chain().focus().addRowAfter().run()}
          >
            Add row
          </Pressable>
          <Pressable
            className="button plain"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          >
            Add column
          </Pressable>
          <Pressable
            className="button plain"
            onClick={() => editor.chain().focus().deleteRow().run()}
          >
            Delete row
          </Pressable>
          <Pressable
            className="button plain"
            onClick={() => editor.chain().focus().deleteTable().run()}
          >
            Remove table
          </Pressable>
        </div>
      )}
      {sketch && (
        <Suspense fallback={<p role="status">Opening sketch…</p>}>
          <SketchCanvas doc={session.doc} />
        </Suspense>
      )}
      {notice && (
        <p className="notice" role="alert">
          {notice}
          <Pressable
            className="icon-button"
            aria-label="Dismiss editor message"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </Pressable>
        </p>
      )}
      <div className="rich-save-status" role="status">
        {session.key ? <ShieldCheck size={15} /> : <Check size={15} />} {status}
        {session.key && " · Encrypted"}
        <span>Type / for blocks · @ for pages</span>
      </div>
    </div>
  );
}
export default function RichTextEditor({
  pageId,
  onTextChange,
}: {
  pageId: string;
  onTextChange?: (text: string) => void;
}) {
  const [session, setSession] = useState<Session | null>(null),
    [envelopes, setEnvelopes] = useState<EncryptedEnvelope[] | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [protection, setProtection] = useState(false),
    [credential, setCredential] = useState(""),
    [recoveryMode, setRecoveryMode] = useState(false),
    [recoveryKey, setRecoveryKey] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [newPassphrase, setNewPassphrase] = useState("");
  const activeDoc = useRef<Y.Doc | null>(null);
  const protectionFlight = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => registerEditorFlush(() => protectionFlight.current), []);
  function protect(action: () => Promise<void>) {
    protectionFlight.current = protectionFlight.current.then(action);
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setSession(null);
    setEnvelopes(null);
    setError("");
    setProtection(false);
    setCredential("");
    setRecoveryKey("");
    void (async () => {
      await store.ready();
      const encrypted = await store.loadEncryptedDocs(pageId);
      if (!active) return;
      if (
        encrypted.length ||
        store.listPages().find((page) => page.id === pageId)?.properties
          .__locked
      ) {
        setEnvelopes(encrypted);
        return;
      }
      const doc = new Y.Doc(),
        update = await store.loadDoc(pageId);
      if (!active) {
        doc.destroy();
        return;
      }
      if (update) Y.applyUpdate(doc, update);
      activeDoc.current = doc;
      setSession({ doc });
    })()
      .catch(() => {
        if (active)
          setError(
            "Could not open local storage. Your document has not been changed.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      /* The editor flushes its pending save before release. */ const doc =
        activeDoc.current;
      activeDoc.current = null;
      if (doc) setTimeout(() => doc.destroy(), 1000);
    };
  }, [pageId]);
  async function unlock() {
    if (!envelopes?.length) {
      setError(
        "The encrypted content is unavailable. Reconnect to restore its encrypted updates.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const key = await unlockEnvelope(
          currentEnvelope(envelopes),
          credential,
          recoveryMode ? "recovery" : "passphrase",
        ),
        doc = new Y.Doc();
      for (const envelope of envelopes)
        Y.applyUpdate(doc, await decryptWithKey(envelope, key));
      activeDoc.current = doc;
      setSession({ doc, key, envelope: currentEnvelope(envelopes) });
      setCredential("");
      setEnvelopes(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to unlock.");
    } finally {
      setBusy(false);
    }
  }
  async function enable() {
    if (!session || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      const envelope = await encryptBytes(
          Y.encodeStateAsUpdate(session.doc),
          credential,
          recoveryKey,
        ),
        key = await unlockEnvelope(envelope, credential);
      await store.saveEncryptedDoc(pageId, envelope);
      setSession({ doc: session.doc, key, envelope });
      setProtection(false);
      setCredential("");
      setRecoveryKey("");
      setConfirmed(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to protect this document.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function resetPassphrase() {
    if (!envelopes?.length || !credential || !newPassphrase) return;
    setBusy(true);
    setError("");
    try {
      const changed = await rewrapPassphrase(
        currentEnvelope(envelopes),
        credential,
        newPassphrase,
      );
      await store.saveEncryptedDoc(pageId, changed);
      setEnvelopes([...envelopes, changed]);
      setNewPassphrase("");
      setError(
        "Passphrase changed. You can now unlock with your new passphrase.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not change passphrase.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <p className="rich-hint" role="status">
        Opening your document…
      </p>
    );
  return (
    <>
      {envelopes && !session && (
        <section className="rich-locked" aria-label="Locked document">
          <LockKeyhole size={36} />
          <h2>A private space.</h2>
          <p>
            This document’s content is encrypted. Your key stays in memory while
            it is open.
          </p>
          <label>
            {recoveryMode ? "Recovery key" : "Passphrase"}
            <input
              autoFocus
              className="text-field"
              type="password"
              autoComplete="off"
              value={credential}
              onChange={(event) => setCredential(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                )
                  void unlock();
              }}
            />
          </label>
          <Pressable
            className="button primary"
            disabled={busy || !credential}
            onClick={() => void unlock()}
          >
            {busy ? "Unlocking…" : "Unlock"}
          </Pressable>
          <Pressable
            className="button plain"
            onClick={() => {
              setRecoveryMode((value) => !value);
              setCredential("");
            }}
          >
            {recoveryMode ? "Use passphrase" : "Use recovery key"}
          </Pressable>
          {recoveryMode && (
            <div className="rich-recovery-reset">
              <label>
                New passphrase
                <input
                  className="text-field"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={newPassphrase}
                  onChange={(event) => setNewPassphrase(event.target.value)}
                />
              </label>
              <Pressable
                className="button plain"
                disabled={busy || newPassphrase.length < 8 || !credential}
                onClick={() => protect(resetPassphrase)}
              >
                Reset passphrase with recovery key
              </Pressable>
            </div>
          )}
          <p className="rich-hint">
            A lost passphrase and recovery key means lost content. Titles, dates
            and tags remain visible.
          </p>
        </section>
      )}
      {protection && session && (
        <section className="rich-protection" aria-label="Protect document">
          <h2>Protect document</h2>
          <p>
            Encrypt text, sketches and files. Titles, dates and tags remain
            visible. Existing unencrypted local copies are deleted.
          </p>
          <label>
            New passphrase
            <input
              autoFocus
              className="text-field"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={credential}
              onChange={(event) => setCredential(event.target.value)}
            />
          </label>
          <label>
            Recovery key
            <input
              className="text-field rich-key"
              readOnly
              value={recoveryKey}
              onFocus={(event) => event.target.select()}
            />
          </label>
          <p className="notice">
            Save this key somewhere safe. If you lose both this key and your
            passphrase, we cannot recover your content.
          </p>
          <label className="rich-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I saved my recovery key.
          </label>
          <Pressable
            className="button primary"
            disabled={busy || credential.length < 8 || !confirmed}
            onClick={() => protect(enable)}
          >
            {busy ? "Protecting…" : "Enable encryption"}
          </Pressable>
          <Pressable
            className="button plain"
            onClick={() => {
              setProtection(false);
              setCredential("");
              setRecoveryKey("");
            }}
          >
            Cancel
          </Pressable>
        </section>
      )}
      {session && (
        <div hidden={protection} inert={protection || busy}>
          <SessionEditor
            key={`${pageId}:${session.key ? "encrypted" : "plain"}`}
            pageId={pageId}
            session={session}
            onTextChange={onTextChange}
            onEnableEncryption={() => {
              setRecoveryKey(createRecoveryKey());
              setCredential("");
              setConfirmed(false);
              setProtection(true);
            }}
            onLock={() => {
              void store
                .loadEncryptedDocs(pageId)
                .then((next) => {
                  setEnvelopes(next);
                  setSession(null);
                  const doc = activeDoc.current;
                  activeDoc.current = null;
                  doc?.destroy();
                })
                .catch(() =>
                  setError("Could not lock while storage is unavailable."),
                );
            }}
          />
        </div>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
