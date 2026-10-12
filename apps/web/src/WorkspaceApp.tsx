import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Columns3,
  Download,
  FileText,
  Folder,
  Home,
  LayoutGrid,
  List,
  Menu,
  MoreHorizontal,
  Plus,
  PenLine,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Star,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { BrandMark, Pressable } from "@veloradesk/ui";
import { EdgeBack, SheetHandle, useCollapsingTitle, useKeyboardViewport, useWorkspaceSize } from "./WorkspaceChrome";
import { SyncRetry } from "./AccountGate";
import type {
  CalendarEvent,
  DatabaseDefinition,
  DatabaseView,
  Filter,
  FilterGroup,
  Page,
  PageType,
  PropertyDefinition,
  PropertyValue,
} from "@veloradesk/core/model";
import { store } from "@veloradesk/core/store";
import { completeProjectTask, inferProjectTypes, projectPresets, projectPreset, projectDefinition, projectType, taskDone, taskDue, visibleProjectFields, projectViews, weekNumber, type ProjectType, type ProjectTypes } from "@veloradesk/core/projects";
import { compareOrder, orderBetween } from "@veloradesk/core/order";
import { saveAppearance, startAppearance } from "./appearance";
import { platform } from "@veloradesk/core/platform";
import "./workspace.css";
import { flushEditors, registerEditorFlush } from "./editor-lifecycle";
import { AppLockSettings } from "./ApplicationLock";
import { startReminders, enablePush, disablePush } from "./notifications";
import { LocalSearch } from "./search";
const AccountPanel = lazy(() => import("./AccountPanel"));
const ImportExportPanel = lazy(() => import("./ImportExportPanel"));
const DesktopSettings = lazy(() => import("./DesktopSettings"));
const InstallSettings = lazy(() => import("./InstallSettings"));

const RichTextEditor = lazy(() => import("./RichTextEditor"));
const CalendarModule = lazy(() => import("./CalendarModule"));
type Module = "Today" | "Calendar" | "Notes" | "Journal" | "Projects";
type Toast = { message: string; undo?: () => Promise<void> };
const modules: { name: Module; icon: typeof Home }[] = [
  { name: "Today", icon: Home },
  { name: "Projects", icon: LayoutGrid },
  { name: "Calendar", icon: CalendarDays },
  { name: "Notes", icon: FileText },
  { name: "Journal", icon: BookOpen },
 ];
const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const displayDate = (value: string) =>
  new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
const icons = [
  "📄",
  "📓",
  "🌿",
  "💡",
  "✨",
  "📌",
  "🎯",
  "📚",
  "🏡",
  "🪴",
  "🗂️",
  "📝",
];
const titleOf = (page: Page) =>
  page.properties.__locked ? "Locked entry" : page.title || "Untitled";
const pageIcon = (page: Page) =>
  page.icon ||
  (page.type === "journal" ? "📓" : page.type === "database" ? "▦" : "📄");
const moodNames = ["Difficult", "Low", "Okay", "Good", "Great"];
const viewIcons = {
  table: Table2,
  list: List,
  board: Columns3,
  calendar: CalendarDays,
  gallery: LayoutGrid,
};
const propertyTypes: PropertyDefinition["type"][] = [
  "text",
  "number",
  "select",
  "multi-select",
  "status",
  "date",
  "checkbox",
  "url",
  "email",
  "phone",
  "files",
  "relation",
  "rollup",
];
const readSetting = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const writeSetting = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Settings remain available for this session. */
  }
};

function Loading() {
  return (
    <div className="ws-loading" role="status">
      <span className="ws-skeleton" />
      <span className="ws-skeleton" />
      <span className="ws-skeleton short" />
    </div>
  );
}
function Empty({ title, action }: { title: string; children: ReactNode; action?: ReactNode; }) {
  return <div className="ws-empty" aria-label={title}><FileText size={32} />{action ?? <Pressable className="ws-button" onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))}>Done</Pressable>}</div>;
}
function Sheet({
  open,
  onOpenChange,
  title,
  children,
  wide = false,
  onAfterClose,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  onAfterClose?: () => void;
}) {
  const opener = useRef<HTMLElement | null>(null),
    content = useRef<HTMLDivElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={document.getElementById("root")}>
        <Dialog.Overlay className="ws-overlay" />
        <Dialog.Content
          ref={content}
          className={`ws-sheet ${wide ? "wide" : ""}`}
          onOpenAutoFocus={(event) => {
            opener.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            event.preventDefault();
            (
              content.current?.querySelector<HTMLElement>(
                'input:not([type="file"]),button:not(.ws-sheet-handle)',
              ) ?? content.current
            )?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener.current?.isConnected) opener.current.focus();
            onAfterClose?.();
          }}
        >
          <SheetHandle content={content} open={open} />
          <div className="ws-sheet-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Pressable className="ws-icon" aria-label={`Close ${title}`}>
                <X size={20} />
              </Pressable>
            </Dialog.Close>
          </div>
          <Dialog.Description className="ws-sr-only">
            {title} options
          </Dialog.Description>
          <div className="ws-sheet-body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function PageButton({
  page,
  onOpen,
  small = false,
  style,
}: {
  page: Page;
  onOpen: (id: string) => void;
  small?: boolean;
  style?: CSSProperties;
}) {
  return (
    <Pressable
      className={`ws-page-row ${small ? "compact" : ""} ${page.type === "journal" && !small ? "ws-journal-entry" : ""}`}
      style={style}
      onClick={() => onOpen(page.id)}
    >
      {page.type === "journal" && !small ? (
        <span className="ws-journal-date-badge" aria-hidden="true">
          <span>{new Date(`${page.date ?? page.createdAt.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: "short" })}</span>
          <strong>{Number((page.date ?? page.createdAt.slice(0, 10)).slice(-2))}</strong>
        </span>
      ) : <span className="ws-page-icon" aria-hidden="true">{pageIcon(page)}</span>}
      <span className="ws-page-row-text">
        <strong>{titleOf(page)}</strong>
        {page.type === "journal" && !small && <small className="ws-journal-preview">{page.properties.__locked ? "Protected entry" : String(page.properties.__text ?? "").trim().slice(0, 140) || "A moment from your day"}</small>}
        <span>
          {page.type === "journal" && page.date
            ? displayDate(page.date)
            : `${page.type === "row" ? "Database row" : page.type.charAt(0).toUpperCase() + page.type.slice(1)} · ${new Date(page.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
        </span>
      </span>
      {page.favorite && <Star size={14} className="ws-accent" />}
      <ChevronRight size={16} className="ws-muted" />
    </Pressable>
  );
}

function useWindowedRange(
  ref: RefObject<HTMLDivElement | null>,
  count: number,
  estimatedHeight: number,
  enabled = count > 100,
) {
  const [range, setRange] = useState({ start: 0, end: Math.min(count, 40), height: estimatedHeight });
  useLayoutEffect(() => {
    if (!enabled || !ref.current) return;
    const element = ref.current;
    let frame = 0;
    let observedRow: Element | null = null;
    const measure = () => {
      frame = 0;
      const row = element.firstElementChild;
      if (row !== observedRow) {
        if (observedRow) observer.unobserve(observedRow);
        if (row) observer.observe(row);
        observedRow = row;
      }
      const height = row instanceof HTMLElement ? (row.getBoundingClientRect().height + (parseFloat(getComputedStyle(row).marginBottom) || 0)) || estimatedHeight : estimatedHeight;
      const top = element.getBoundingClientRect().top;
      const viewport = window.visualViewport?.height ?? window.innerHeight;
      const start = Math.min(count, Math.max(0, Math.floor(-top / height) - 12));
      const end = Math.min(count, Math.max(start, Math.ceil((viewport - top) / height) + 12));
      setRange(previous => previous.start === start && previous.end === end && previous.height === height
        ? previous : { start, end, height });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [ref, count, estimatedHeight, enabled]);
  return enabled ? {
    start: range.start, end: range.end, height: range.height, windowed: true,
    style: {
      height: count * range.height,
      position: "relative" as const,
      overflowAnchor: "none" as const,
    },
  } : { start: 0, end: count, height: estimatedHeight, windowed: false, style: undefined };
}
function PageList({ pages, onOpen, gallery }: { pages: Page[]; onOpen: (id: string) => void; gallery: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const journals = pages.length > 0 && pages.every(page => page.type === "journal");
  const range = useWindowedRange(ref, pages.length, journals ? 120 : 80, !gallery && pages.length > 100);
  return <div ref={ref} className={`ws-page-list ${gallery ? "gallery" : ""} ${journals ? "ws-journal-entries" : ""}`} style={range.style}>
    {pages.slice(range.start, range.end).map((page, index) => <PageButton key={page.id} page={page} onOpen={onOpen}
      style={range.windowed ? { position: "absolute", top: (range.start + index) * range.height, left: 0 } : undefined} />)}
  </div>;
}
function Tree({ pages, onOpen, onMove, selected }: {
  pages: Page[];
  onOpen: (id: string) => void;
  onMove: (id: string, parentId: string | null, after?: string | null) => void;
  selected: string | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => {
    const result = new Map<string | null, Page[]>();
    for (const page of pages) {
      if (page.type === "row" || page.type === "journal") continue;
      const siblings = result.get(page.parentId) ?? [];
      siblings.push(page);
      result.set(page.parentId, siblings);
    }
    for (const siblings of result.values()) siblings.sort((a, b) =>
      compareOrder(a.properties.__order, b.properties.__order) || a.createdAt.localeCompare(b.createdAt));
    return result;
  }, [pages]);
  const rows = useMemo(() => {
    const result: { page: Page; depth: number }[] = [];
    const stack = [...(groups.get(null) ?? [])].reverse().map(page => ({ page, depth: 0 }));
    const visited = new Set<string>();
    while (stack.length) {
      const row = stack.pop()!;
      if (visited.has(row.page.id)) continue;
      visited.add(row.page.id);
      result.push(row);
      if (expanded.has(row.page.id)) {
        for (const page of [...(groups.get(row.page.id) ?? [])].reverse()) stack.push({ page, depth: row.depth + 1 });
      }
    }
    return result;
  }, [groups, expanded]);
  const range = useWindowedRange(ref, rows.length, 44);
  return <div ref={ref} className="ws-tree" role="tree" style={range.style}>
    {rows.slice(range.start, range.end).map(({ page, depth }, rowIndex) => {
      const siblings = groups.get(page.parentId) ?? [];
      const index = siblings.findIndex(item => item.id === page.id);
      const hasChildren = !!groups.get(page.id)?.length;
      return <div key={page.id} role="treeitem" aria-level={depth + 1}
        style={range.windowed ? { position: "absolute", top: (range.start + rowIndex) * range.height, left: 0, right: 0 } : undefined}
        aria-posinset={index + 1} aria-setsize={siblings.length}
        aria-selected={selected === page.id} aria-expanded={hasChildren ? expanded.has(page.id) : undefined}
        onDragOver={event => { event.preventDefault(); event.stopPropagation(); }}
        onDrop={event => {
          event.preventDefault(); event.stopPropagation();
          const id = event.dataTransfer.getData("text/veloradesk-page");
          if (!id) return;
          const bounds = event.currentTarget.querySelector(".ws-tree-row")?.getBoundingClientRect();
          const position = bounds ? (event.clientY - bounds.top) / bounds.height : 0.5;
          if (position < 0.25) onMove(id, page.parentId, siblings[index - 1]?.id ?? null);
          else if (position > 0.75) onMove(id, page.parentId, page.id);
          else onMove(id, page.id);
        }}>
        <div className="ws-tree-row" style={{ paddingInlineStart: `calc(var(--space-2) + ${depth} * var(--space-3))` }}>
          <Pressable className="ws-icon" disabled={!hasChildren}
            aria-label={`${expanded.has(page.id) ? "Collapse" : "Expand"} ${titleOf(page)}`}
            onClick={() => setExpanded(old => {
              const next = new Set(old);
              if (next.has(page.id)) next.delete(page.id); else next.add(page.id);
              return next;
            })}>
            {expanded.has(page.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </Pressable>
          <Pressable className={`ws-tree-page ${selected === page.id ? "selected" : ""}`} draggable
            onDragStartCapture={event => event.dataTransfer.setData("text/veloradesk-page", page.id)}
            onClick={() => onOpen(page.id)}>
            <span aria-hidden="true">{pageIcon(page)}</span><span>{titleOf(page)}</span>
          </Pressable>
        </div>
      </div>;
    })}
  </div>;
}

export default function WorkspaceApp() {
  const layout = useWorkspaceSize();
  useKeyboardViewport();
  const [module, setModule] = useState<Module>("Today");
  const [pages, setPages] = useState<Page[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [databases, setDatabases] = useState<DatabaseDefinition[]>([]);
  const [projectTypes, setProjectTypes] = useState<ProjectTypes>({});
  const [projectOpen, setProjectOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tabletExpanded, setTabletExpanded] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSetting("velora-sidebar-collapsed", "false") === "true");
  const [trashOpen, setTrashOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [error, setError] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [sort, setSort] = useState("updated");
  const [listView, setListView] = useState<"list" | "gallery">("list");
  const [filter, setFilter] = useState("");
  const [focus, setFocus] = useState(false);
  const [editing, setEditing] = useState(false);
  const history = useRef<{ module: Module; selected: string | null; scroll: number }[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(
    240,
  );
  const [listWidth, setListWidth] = useState(
    Number(readSetting("velora-list-width", "320")),
  );
  const mainRef = useRef<HTMLElement>(null);
  useCollapsingTitle(mainRef);
  useLayoutEffect(() => {
    if (selectedId) window.scrollTo({ top: 0, behavior: "instant" });
  }, [selectedId]);
  const refresh = useCallback(async () => {
    try {
      const [nextPages, nextEvents, nextDatabases, nextProjectTypes] = await Promise.all([
        store.listPages(true),
        store.listEvents(),
        store.listDatabases(),
        store.getSetting<ProjectTypes>("project-types-v1", {}),
      ]);
      setPages(nextPages);
      setEvents(nextEvents);
      setDatabases(nextDatabases);
      setProjectTypes({ ...inferProjectTypes(nextPages, nextDatabases), ...nextProjectTypes });
      setLoaded(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not open workspace.",
      );
    }
  }, []);
  useEffect(() => {
    void refresh();
    const unsubscribe = store.subscribe(() => void refresh());
    void platform.persistStorage();
    return unsubscribe;
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), toast.undo ? 10000 : 5000);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(
    () =>
      startReminders(
        () => store.listEvents(),
        (message) => setToast({ message }),
      ),
    [],
  );
  useEffect(() => {
    let stopped = false;
    let unlisten: (() => void) | undefined;
    void platform
      .onQuickCapture(() => {
        if (document.documentElement.dataset.appLocked !== "true")
          setCaptureOpen(true);
      })
      .then((cleanup) => {
        if (stopped) cleanup();
        else unlisten = cleanup;
      });
    return () => {
      stopped = true;
      unlisten?.();
    };
  }, []);
  useEffect(() => {
    let stopped = false;
    let unlisten: (() => void) | undefined;
    void platform
      .onQuit(() => {
        void flushEditors()
          .then(() => platform.quit())
          .catch((cause) => setError(String(cause)));
      })
      .then((cleanup) => {
        if (stopped) cleanup();
        else unlisten = cleanup;
      });
    return () => {
      stopped = true;
      unlisten?.();
    };
  }, []);
  useEffect(() => startAppearance(), []);
  useEffect(() => {
    const report = (event: Event) =>
      setError(String((event as CustomEvent).detail));
    window.addEventListener("velora-appearance-error", report);
    return () => window.removeEventListener("velora-appearance-error", report);
  }, []);
  useEffect(() => {
    const close = () => {
      setSearchOpen(false);
      setSettingsOpen(false);
      setCaptureOpen(false);
      setSidebarOpen(false);
      setTemplatesOpen(false);
      setTrashOpen(false);
      setSelectedId(null);
    };
    window.addEventListener("velora-application-locked", close);
    return () => window.removeEventListener("velora-application-locked", close);
  }, []);
  const livePages = useMemo(
    () => pages.filter((page) => !page.deletedAt),
    [pages],
  );
  const selected = livePages.find((page) => page.id === selectedId);
  const notify = (message: string, undo?: () => Promise<void>) =>
    setToast({ message, undo });
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "That change could not be saved. Your existing data is safe.",
      );
    }
  };
  const navigate = useCallback((next: Module) => {
    void flushEditors()
      .then(() => {
        history.current = [];
        setModule(next);
        setSelectedId(null);
        setSidebarOpen(false);
        setFolderId(null);
        setFocus(false);
        mainRef.current?.focus();
      })
      .catch((cause) => setError(String(cause)));
  }, []);
  const back = useCallback(() => {
    void flushEditors().then(() => {
      const previous = history.current.pop();
      setSelectedId(previous?.selected ?? null);
      if (previous) setModule(previous.module);
      requestAnimationFrame(() => { if (mainRef.current) mainRef.current.scrollTop = previous?.scroll ?? 0; mainRef.current?.focus(); });
    })
      .catch(cause => setError(String(cause)));
  }, []);
  const toggleSidebar = () => {
    if (layout.tablet) { setTabletExpanded(previous => !previous); return; }
    setSidebarCollapsed(previous => {
    const next = !previous;
    localStorage.setItem("velora-sidebar-collapsed", String(next));
    return next;
    });
  };
  const openPage = (id: string) => {
    void flushEditors()
      .then(() => {
        const page = store.listPages().find((item) => item.id === id);
        if (page) {
          if (selectedId !== id) history.current.push({ module, selected: selectedId, scroll: mainRef.current?.scrollTop ?? 0 });
          setModule(
            page.type === "note"
              ? "Notes"
              : page.type === "journal"
                ? "Journal"
                : "Projects",
          );
          setSelectedId(id);
          setSidebarOpen(false);
          setEditing(false);
          requestAnimationFrame(() => { if (mainRef.current) mainRef.current.scrollTop = 0; mainRef.current?.focus(); });
        }
      })
      .catch((cause) => setError(String(cause)));
  };
  const create = async (
    type: PageType,
    title = "",
    extras: Partial<Page> = {},
  ) => {
    await flushEditors();
    history.current.push({ module, selected: selectedId, scroll: mainRef.current?.scrollTop ?? 0 });
    const page = await store.createPage(type, title, extras);
    setModule(
      type === "note" ? "Notes" : type === "journal" ? "Journal" : "Projects",
    );
    setSelectedId(page.id);
    setCaptureOpen(false);
    setTemplatesOpen(false);
    return page;
  };
  const movePage = async (
    id: string,
    parentId: string | null,
    after?: string | null,
  ) => {
    if (id === parentId) return;
    let ancestor = parentId;
    const visited = new Set<string>();
    while (ancestor) {
      if (ancestor === id || visited.has(ancestor)) {
        setError("A page cannot be moved into itself or one of its children.");
        return;
      }
      visited.add(ancestor);
      ancestor =
        livePages.find((page) => page.id === ancestor)?.parentId ?? null;
    }
    const previous = livePages.find((page) => page.id === id)?.parentId ?? null;
    const previousOrder = livePages.find((page) => page.id === id)?.properties
      .__order;
    const siblings = livePages
      .filter((page) => page.parentId === parentId && page.id !== id)
      .sort(
        (a, b) =>
          compareOrder(a.properties.__order, b.properties.__order) ||
          a.createdAt.localeCompare(b.createdAt),
      );
    if (
      siblings.some(
        (page, index) =>
          typeof page.properties.__order !== "string" ||
          (index > 0 &&
            compareOrder(
              siblings[index - 1]!.properties.__order,
              page.properties.__order,
            ) >= 0),
      )
    ) {
      for (const [index, page] of siblings.entries()) {
        page.properties = { ...page.properties, __order: `${index}/1` };
        await store.patchPage(page.id, { properties: page.properties });
      }
    }
    const index =
      after === null
        ? 0
        : after === undefined
          ? siblings.length
          : siblings.findIndex((page) => page.id === after) + 1;
    const order = orderBetween(
      siblings[index - 1]?.properties.__order ?? null,
      siblings[index]?.properties.__order ?? null,
    );
    await store.patchPage(id, {
      parentId,
      properties: {
        ...livePages.find((page) => page.id === id)?.properties,
        __order: order,
      },
    });
    notify("Page moved", () =>
      store
        .patchPage(id, {
          parentId: previous,
          properties: {
            ...store.listPages().find((page) => page.id === id)?.properties,
            __order: previousOrder ?? null,
          },
        })
        .then(() => {}),
    );
  };
  const trash = async (page: Page) => {
    await flushEditors();
    await store.trashPage(page.id);
    if (selectedId === page.id) setSelectedId(null);
    notify("Moved to Trash", () => store.restorePage(page.id).then(() => {}));
  };
  const duplicate = async (page: Page, fromTemplate = false) => {
    const created = await create(
      page.type === "row" ? "page" : page.type,
      `${titleOf(page)}${fromTemplate ? "" : " copy"}`,
      {
        parentId: page.parentId,
        icon: page.icon,
        tags: [...page.tags],
        properties: {
          ...page.properties,
          __template: false,
          __encrypted: false,
        },
        fullWidth: page.fullWidth,
        date: page.type === "journal" ? localDate() : page.date,
      },
    );
    if (page.properties.__locked) {
      for (const envelope of await store.loadEncryptedDocs(page.id))
        await store.saveEncryptedDoc(created.id, envelope);
      return;
    }
    const doc = await store.loadDoc(page.id);
    if (doc) await store.saveDoc(created.id, doc);
  };
  const createDatabase = async (tasks = false) => {
    const page = await create(
      "database",
      tasks ? "Tasks" : "Untitled database",
      { icon: tasks ? "☑️" : "▦" },
    );
    const now = new Date().toISOString();
    const definition: DatabaseDefinition = {
      id: page.id,
      userId: page.userId,
      properties: [
        { id: "title", name: "Name", type: "title" },
        {
          id: "status",
          name: "Status",
          type: "status",
          options: ["To do", "In progress", "Done"],
        },
        ...(tasks
          ? [
              { id: "due", name: "Due", type: "date" as const },
              { id: "completed", name: "Completed", type: "checkbox" as const },
            ]
          : []),
      ],
      views: (["table", "list", "board", "calendar", "gallery"] as const).map(
        (type) => ({
          id: crypto.randomUUID(),
          name: type.charAt(0).toUpperCase() + type.slice(1),
          type,
          groupBy: "status",
        }),
      ),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await store.saveDatabase(definition);
    if (tasks)
      await store.patchPage(page.id, { properties: { __tasks: true } });
  };
  const createProject = async (type: ProjectType, title = projectPreset(type)!.label) => {
    const page = await create("database", title, { icon: "▦", properties: { __projectType: type, __tasks: true } });
    const definition = projectDefinition(page, type);
    await store.saveDatabase(definition);
    const preset = projectPreset(type)!;
    for (const title of preset.checklist ?? []) await store.createPage("row", title, {
      databaseId: page.id, parentId: page.id,
      properties: { due: localDate(), completed: false, week: weekNumber(new Date()), status: "To do", cadence: "Weekly", __weekly: type === "weekly" || type === "model" },
    });
    setProjectOpen(false);
    return page;
  };
  const addTask = async (title: string, projectId: string, due: string, notes: string) => {
    let project = livePages.find(page => page.type === "database" && page.id === projectId)
      ?? livePages.find(page => page.type === "database" && page.properties.__tasks);
    project ??= await createProject("app", "Inbox");
    const definition = store.listDatabases().find(database => database.id === project!.id);
    const status = definition?.properties.find(property => property.type === "status");
    const date = definition?.properties.find(property => property.type === "date");
    const task = await store.createPage("row", title, { databaseId: project.databaseId ?? project.id, parentId: project.id,
      properties: { ...(status ? { [status.id]: status.options?.[0] ?? "To do" } : {}), ...(due ? { [date?.id ?? "due"]: due } : {}) } });
    if (notes.trim()) {
      const { markdownToDocument } = await import("@veloradesk/core/export");
      await store.saveDoc(task.id, markdownToDocument(notes));
    }
    setCaptureOpen(false); setSelectedId(null); setModule("Today");
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.keyCode === 229 ||
        document.documentElement.dataset.appLocked === "true"
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((value) => !value);
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "n"
      ) {
        event.preventDefault();
        setCaptureOpen(true);
      }
      if (event.key === "Escape" && focus) setFocus(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus]);
  const typeFilter =
    module === "Notes" ? "note" : module === "Journal" ? "journal" : undefined;
  const listPages = livePages
    .filter(
      (page) =>
        page.type !== "row" &&
        !page.properties.__template &&
        (!typeFilter || page.type === typeFilter) &&
        (typeFilter
          ? !folderId || page.parentId === folderId
          : page.type !== "journal" && page.type !== "note") &&
        (titleOf(page)
          .toLocaleLowerCase()
          .includes(filter.toLocaleLowerCase()) ||
          page.tags
            .join(" ")
            .toLocaleLowerCase()
            .includes(filter.toLocaleLowerCase())),
    )
    .sort((a, b) =>
      sort === "title"
        ? titleOf(a).localeCompare(titleOf(b))
        : sort === "created"
          ? b.createdAt.localeCompare(a.createdAt)
          : b.updatedAt.localeCompare(a.updatedAt),
    );
  const resize = (kind: "sidebar" | "list", event: React.PointerEvent) => {
    const initial = kind === "sidebar" ? sidebarWidth : listWidth;
    const start = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => {
      const width = Math.max(
        kind === "sidebar" ? 180 : 240,
        Math.min(
          kind === "sidebar" ? 360 : 520,
          initial + next.clientX - start,
        ),
      );
      if (kind === "sidebar") setSidebarWidth(width);
      else setListWidth(width);
      writeSetting(`velora-${kind}-width`, String(width));
    };
    const done = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", done);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done, { once: true });
  };
  return (
    <div
      data-module={module}
      data-writing={Boolean(selected && selected.type !== "database")}
      data-editing={editing}
      data-layout={layout.phone ? "phone" : layout.tablet ? "tablet" : "desktop"}
      onFocusCapture={event => setEditing(event.target instanceof Element && !!event.target.closest(".rich-editor,.ws-page-title"))}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEditing(false); }}
      className={`ws-app ${focus ? "focus-mode" : ""} ${selected ? "has-detail" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${tabletExpanded ? "tablet-expanded" : ""}`}
      style={
        {
          "--ws-sidebar-width": `${sidebarWidth}px`,
          "--ws-list-width": `${listWidth}px`,
        } as React.CSSProperties
      }
    >
      {!focus && (
        <>
          <aside
            className={`ws-sidebar ${sidebarOpen ? "open" : ""}`}
            aria-label="Sidebar"
            aria-hidden={layout.phone && !sidebarOpen}
            inert={layout.phone && !sidebarOpen}
          >
            <div className="ws-brand">
              <span className="logo">
                <BrandMark size={28} />
              </span>
              <strong>Kimpor Workspace</strong>
              <Pressable
                className="ws-icon ws-sidebar-close"
                aria-label="Close sidebar"
                onClick={() => setSidebarOpen(false)}
              >
                <X size={20} />
              </Pressable>
            </div>
            <Pressable
              className="ws-sidebar-search"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={18} />
              <span>Search anything</span>
              <kbd>⌘ K</kbd>
            </Pressable>
            <Pressable className="ws-icon ws-sidebar-collapse" aria-label={layout.tablet ? tabletExpanded ? "Compact sidebar" : "Expand sidebar" : sidebarCollapsed ? "Expand sidebar" : "Compact sidebar"} onClick={toggleSidebar}>{sidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}</Pressable>
            <nav aria-label="Main navigation">
              {modules.map(({ name, icon: Icon }) => (
                <Pressable
                  key={name}
                  className={`ws-nav ${module === name ? "selected" : ""}`}
                  aria-current={module === name ? "page" : undefined}
                  aria-label={name}
                  onClick={() => navigate(name)}
                >
                  <Icon size={20} />
                  <span>{name}</span>
                </Pressable>
              ))}
            </nav>
            <div className="ws-sidebar-section">
              <div className="ws-sidebar-section-title">
                <span>YOUR PAGES</span>
                <Pressable
                  className="ws-icon"
                  aria-label="New page"
                  onClick={() => void run(() => create("page"))}
                >
                  <Plus size={16} />
                </Pressable>
              </div>
              <Tree
                pages={livePages}
                selected={selectedId}
                onOpen={openPage}
                onMove={(id, parent, after) =>
                  void run(() => movePage(id, parent, after))
                }
              />
              <Pressable
                className="ws-sidebar-link"
                aria-label="Templates"
                onClick={() => setTemplatesOpen(true)}
              >
                <LayoutGrid size={16} />
                Templates
              </Pressable>
            </div>
            <div className="ws-sidebar-footer">
              <Pressable
                className="ws-sidebar-link"
                aria-label="Trash"
                onClick={() => setTrashOpen(true)}
              >
                <Trash2 size={17} />
                <span>Trash</span>
                <span className="ws-count">
                  {pages.filter((page) => page.deletedAt).length || ""}
                </span>
              </Pressable>
              <Pressable
                className="ws-sidebar-link"
                aria-label="Settings"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings size={17} />
                <span>Settings</span>
              </Pressable>
            </div>
          </aside>
          <div
            className="ws-resize ws-sidebar-resize"
            role="separator"
            aria-label="Resize sidebar"
            aria-orientation="vertical"
            onPointerDown={(event) => resize("sidebar", event)}
          />
        </>
      )}
      <main className="ws-main" ref={mainRef} tabIndex={-1} inert={layout.phone && sidebarOpen}>
        {selected && <EdgeBack main={mainRef} onBack={back} />}
        <header className="ws-topbar">
          <div className="ws-topbar-leading">
            {!focus && (
              <Pressable
                className="ws-icon ws-menu-button"
                aria-label="Open sidebar"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu size={20} />
              </Pressable>
            )}
            {selected ? (
              <>
                <Pressable
                  className="ws-icon ws-detail-back"
                  aria-label={`Back to ${history.current.at(-1)?.module ?? module}`}
                  onClick={back}
                >
                  <ChevronLeft size={20} />
                </Pressable>
                <span className="ws-breadcrumb">
                  {module}
                  <ChevronRight size={14} />
                  <strong>{titleOf(selected)}</strong>
                </span>
              </>
            ) : (
              <span className="ws-breadcrumb"></span>
            )}
          </div>
          <div className="ws-topbar-actions">{selected ? <>
            <SyncRetry /><Pressable className="ws-icon" aria-label="Page options" onClick={() => window.dispatchEvent(new CustomEvent("kimpor-page-options", { detail: selected.id }))}><MoreHorizontal size={20} /></Pressable>
          </> : <>
            <SyncRetry /><Pressable className="ws-icon" aria-label="Search workspace" onClick={() => setSearchOpen(true)}><Search size={20} /></Pressable>
            {module === "Today" && livePages.some(page => page.type === "row") && <Pressable className="ws-button ws-filled ws-capture-desktop" onClick={() => setCaptureOpen(true)}><Plus size={16} />New task</Pressable>}
          </>}</div>
        </header>
        {error && (
          <div role="alert" className="ws-error">
            <span>{error}</span>
            <Pressable
              className="ws-icon"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={18} />
            </Pressable>
          </div>
        )}
        {!loaded ? (
          <Loading />
        ) : module === "Calendar" && !selected ? (
          <Suspense fallback={<Loading />}>
            <CalendarModule onOpenPage={openPage} />
          </Suspense>
        ) : module === "Today" && !selected ? (
          <Today
            pages={livePages}
            events={events}
            onOpen={openPage}
            onCapture={() => setCaptureOpen(true)}
            databases={databases}
            onCalendar={() => navigate("Calendar")}
            onComplete={(page) =>
              void run(async () => {
                const previous = { ...page.properties };
                await completeProjectTask(store, page, databases.find(database => database.id === page.databaseId));
                notify("Task completed", () =>
                  store
                    .patchPage(page.id, { properties: previous })
                    .then(() => {}),
                );
              })
            }
          />
        ) : module === "Journal" && !selected ? (
          <JournalHome pages={livePages.filter(page => page.type === "journal")}
            onOpen={openPage} onWrite={(date) => {
              const existing = livePages.find(page => page.type === "journal" && page.date === date);
              if (existing) openPage(existing.id);
              else void run(() => create("journal", "", { date }));
            }} />
        ) : (
          <div className={`ws-module-body ${selected ? "with-detail" : ""}`}>
            <section className="ws-list-pane" aria-label={`${module} list`}>
              <div className="ws-list-heading">
                <div>
                  <h1>{module}</h1>
                </div>
                {module !== "Journal" && listPages.length > 0 && (
                <Pressable
                  className="ws-icon ws-tinted"
                  aria-label={`New ${module === "Notes" ? "note" : "project"}`}
                  onClick={() => module === "Projects" ? setProjectOpen(true) :
                    void run(() =>
                      create(
                        module === "Notes" ? "note" : "page",
                        "",
                        {
                          date: null,
                          parentId: folderId,
                        },
                      ),
                    )
                  }
                >
                  <Plus size={20} />
                </Pressable>
                )}
              </div>
              <div className="ws-list-tools">
                <label className="ws-search-field">
                  <Search size={16} />
                  <input
                    type="search"
                    aria-label={`Search ${module}`}
                    placeholder={`Search ${module.toLowerCase()}`}
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  />
                </label>
                <select
                  aria-label={`Sort ${module}`}
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="updated">Last edited</option>
                  <option value="created">Created</option>
                  <option value="title">Title</option>
                </select>
                <Pressable
                  className="ws-icon"
                  aria-label={
                    listView === "list" ? "Show gallery view" : "Show list view"
                  }
                  onClick={() =>
                    setListView((value) =>
                      value === "list" ? "gallery" : "list",
                    )
                  }
                >
                  {listView === "list" ? (
                    <LayoutGrid size={18} />
                  ) : (
                    <List size={18} />
                  )}
                </Pressable>
              </div>
              {module === "Notes" && (
                <div className="ws-folder-tools">
                  <select
                    aria-label="Notes folder"
                    value={folderId ?? ""}
                    onChange={(event) =>
                      setFolderId(event.target.value || null)
                    }
                  >
                    <option value="">All notes</option>
                    {livePages
                      .filter((page) => page.properties.__folder)
                      .map((page) => (
                        <option key={page.id} value={page.id}>
                          {titleOf(page)}
                        </option>
                      ))}
                  </select>
                  <Pressable
                    className="ws-icon"
                    aria-label="New notes folder"
                    onClick={() =>
                      void run(async () => {
                        const name = window.prompt("Folder name");
                        if (name?.trim())
                          await create("page", name.trim(), {
                            properties: { __folder: true },
                            icon: "🗂️",
                            parentId: folderId,
                          });
                      })
                    }
                  >
                    <Folder size={18} />
                    <Plus size={12} />
                  </Pressable>
                </div>
              )}
              {listPages.length ? (
                <PageList pages={listPages} onOpen={openPage} gallery={listView === "gallery"} />
              ) : (
                <div className={`ws-page-list ${listView === "gallery" ? "gallery" : ""}`}>
                  <Empty
                    title={
                      filter
                        ? "No matching items"
                        : `Your ${module.toLowerCase()} starts here`
                    }
                    action={<Pressable className="ws-button ws-tinted" onClick={() => filter ? setFilter("") : module === "Projects" ? setProjectOpen(true) : void run(() => create("note"))}>{filter ? "Clear" : module === "Projects" ? "New project" : "New note"}</Pressable>}
                  >
                    {filter
                      ? "Try a different word or tag."
                      : module === "Journal"
                        ? "Write a few words, keep a memory, or simply check in."
                        : module === "Notes"
                          ? "Ideas, checklists, and everything you want to keep."
                          : ""}
                  </Empty>
                </div>
              )}
            </section>
            {selected && (
              <>
                <div
                  className="ws-resize ws-list-resize"
                  role="separator"
                  aria-label="Resize list pane"
                  aria-orientation="vertical"
                  onPointerDown={(event) => resize("list", event)}
                />
                <section
                  className={`ws-detail-pane ${selected.fullWidth ? "full-width" : ""}`}
                  aria-label="Page detail"
                >
                  <PageDetail
                    page={selected}
                    pages={livePages}
                    databases={databases}
                    projectTypes={projectTypes}
                    onOpen={openPage}
                    onPatch={(patch) =>
                      run(() => store.patchPage(selected.id, patch))
                    }
                    onTrash={() => void run(() => trash(selected))}
                    onDuplicate={() => void run(() => duplicate(selected))}
                    onMove={(parent) =>
                      void run(() => movePage(selected.id, parent))
                    }
                    onFocus={() => setFocus(true)}
                    onNotify={notify}
                    onError={setError}
                  />
                </section>
              </>
            )}
          </div>
        )}
      </main>
      {!focus && (
        <>
          {(module === "Today" || module === "Projects") && !selected && <Pressable
            className="ws-quick-capture"
            aria-label="New task"
            onClick={() => setCaptureOpen(true)}
          >
            <Plus size={24} />
          </Pressable>}
          <nav className="ws-tabbar" aria-label="Bottom navigation">
            {modules.map(({ name, icon: Icon }) => (
              <Pressable
                key={name}
                className={`ws-tab ${module === name ? "selected" : ""}`}
                aria-current={module === name ? "page" : undefined}
                onClick={() => navigate(name)}
              >
                <Icon size={22} />
                <span>{name}</span>
              </Pressable>
            ))}
          </nav>
        </>
      )}
      {sidebarOpen && (
        <Pressable
          className="ws-sidebar-scrim"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sheet
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        title="New task"
      >
        <Capture projects={livePages.filter(page => page.type === "database")}
          onCreate={(title, projectId, due, notes) => run(() => addTask(title, projectId, due, notes))} />
      </Sheet>
      <Sheet open={projectOpen} onOpenChange={setProjectOpen} title="New project">
        <div className="ws-project-types">{projectPresets.map(preset => <Pressable key={preset.type} className="ws-page-row"
          onClick={() => void run(() => createProject(preset.type))}><LayoutGrid size={20} /><strong>{preset.label}</strong><ChevronRight size={18} /></Pressable>)}</div>
      </Sheet>
      <Sheet
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Search"
        wide
      >
        <SearchPanel
          pages={livePages}
          events={events}
          onOpen={(id) => {
            openPage(id);
            setSearchOpen(false);
          }}
          onCalendar={() => {
            navigate("Calendar");
            setSearchOpen(false);
          }}
          onAction={(name) => {
            navigate(name);
            setSearchOpen(false);
          }}
        />
      </Sheet>
      <Sheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title="Settings"
        wide
      >
        <SettingsPanel onNotify={notify} onError={setError} />
      </Sheet>
      <Sheet open={trashOpen} onOpenChange={setTrashOpen} title="Trash">

        {pages.filter((page) => page.deletedAt).length ? (
          pages
            .filter((page) => page.deletedAt)
            .map((page) => (
              <div className="ws-trash-row" key={page.id}>
                <span>
                  {pageIcon(page)} {titleOf(page)}
                </span>
                <Pressable
                  className="ws-button ws-tinted"
                  onClick={() =>
                    void run(async () => {
                      await store.restorePage(page.id);
                      notify("Item restored");
                    })
                  }
                >
                  Restore
                </Pressable>
              </div>
            ))
        ) : (
          <Empty title="Trash is empty">
            Your deleted pages will appear here.
          </Empty>
        )}
      </Sheet>
      <Sheet
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        title="Templates"
      >
        <div className="ws-template-list">
          <Pressable
            className="ws-page-row"
            onClick={() => void run(() => createDatabase(true))}
          >
            <span className="ws-page-icon">☑️</span>
            <span className="ws-page-row-text">
              <strong>Tasks</strong>
              <span>Status, due dates, and a place in Today</span>
            </span>
            <Plus size={18} />
          </Pressable>
          {["Morning", "Evening", "Gratitude", "Weekly review"].map((name) => (
            <Pressable
              className="ws-page-row"
              key={name}
              onClick={() =>
                void run(() =>
                  create("journal", "", {
                    date: localDate(),
                    properties: { template: name },
                  }),
                )
              }
            >
              <span className="ws-page-icon">🌿</span>
              <span className="ws-page-row-text">
                <strong>{name}</strong>
                <span>A gentle journal prompt</span>
              </span>
              <Plus size={18} />
            </Pressable>
          ))}
          {livePages
            .filter(
              (page) => page.properties.__template && !page.properties.__locked,
            )
            .map((page) => (
              <PageButton
                page={page}
                key={page.id}
                onOpen={() => void run(() => duplicate(page, true))}
              />
            ))}
        </div>
        <p className="ws-muted">
          Turn any page into a reusable template from its page menu.
        </p>
      </Sheet>
      {toast && (
        <div className="ws-toast" role="status">
          <Check size={18} />
          <span>{toast.message}</span>
          {toast.undo && (
            <Pressable
              className="ws-button"
              onClick={() =>
                void run(async () => {
                  await toast.undo?.();
                  setToast(null);
                })
              }
            >
              Undo
            </Pressable>
          )}
          <Pressable
            className="ws-icon"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </Pressable>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, project, definition, onOpen, onComplete }: { task: Page; project?: Page;
  definition?: DatabaseDefinition; onOpen: (id: string) => void; onComplete?: (page: Page) => void;
}) {
  const [completing, setCompleting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const due = taskDue(task, definition);
  const status = definition?.properties.find(property => property.type === "status");
  return <div className={`ws-task-row${completing ? " completing" : ""}`}>
    {onComplete && <Pressable className="ws-task-check" role="checkbox" aria-checked={completing} aria-label={`Complete ${titleOf(task)}`}
      onClick={() => { if (completing) return; setCompleting(true); timer.current = setTimeout(() => onComplete(task), 200); }}>
      <span>{completing && <Check size={16} />}</span>
    </Pressable>}
    <Pressable className="ws-task-title" onClick={() => onOpen(task.id)}><strong>{titleOf(task)}</strong>
      <small>{[project && titleOf(project), due && displayDate(due), status && task.properties[status.id]].filter(Boolean).join(" · ")}</small>
    </Pressable>
  </div>;
}

function Today({ pages, events, databases, onOpen, onCapture, onCalendar, onComplete }: {
  pages: Page[]; events: CalendarEvent[]; databases: DatabaseDefinition[];
  onOpen: (id: string) => void; onCapture: () => void; onCalendar: () => void; onComplete: (page: Page) => void;
}) {
  const today = localDate();
  const definitions = new Map(databases.map(database => [database.id, database]));
  const tasks = pages.filter(page => page.type === "row");
  const open = tasks.filter(task => !taskDone(task, definitions.get(task.databaseId ?? "")));
  const groups = [
    { label: "Earlier", items: open.filter(task => { const due = taskDue(task, definitions.get(task.databaseId ?? "")); return due && due < today; }) },
    { label: "Today", items: open.filter(task => taskDue(task, definitions.get(task.databaseId ?? ""))?.slice(0,10) === today) },
    { label: "Upcoming", items: open.filter(task => { const due = taskDue(task, definitions.get(task.databaseId ?? "")); return due && due > today; }).sort((a,b) => (taskDue(a, definitions.get(a.databaseId ?? "")) ?? "").localeCompare(taskDue(b, definitions.get(b.databaseId ?? "")) ?? "")) },
    { label: "Anytime", items: open.filter(task => !taskDue(task, definitions.get(task.databaseId ?? ""))) },
  ];
  const dailyEvents = events.filter(event => !event.deletedAt && event.start.slice(0,10) <= today && event.end.slice(0,10) >= today).sort((a,b) => a.start.localeCompare(b.start));
  const done = tasks.filter(task => taskDone(task, definitions.get(task.databaseId ?? "")));
  const project = (task: Page) => pages.find(page => page.type === "database" && (page.id === task.databaseId || page.databaseId === task.databaseId));
  return <div className="ws-today ws-task-today">
    <header className="ws-today-hero"><div><p className="ws-eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p><h1>Today</h1></div></header>
    <div className="ws-today-grid">
      <section className="ws-card ws-today-tasks" aria-label="Tasks">
        {open.length ? groups.filter(group => group.items.length).map(group => <section className="ws-task-group" key={group.label}>
          <h2>{group.label}</h2>{group.items.map(task => <TaskRow key={task.id} task={task} project={project(task)} definition={definitions.get(task.databaseId ?? "")} onOpen={onOpen} onComplete={onComplete} />)}
        </section>) : <div className="ws-quiet-empty"><Check size={28} /><Pressable className="ws-button ws-tinted" onClick={onCapture}>Add task</Pressable></div>}
        {done.length > 0 && <details className="ws-done-tasks"><summary>Done <span className="ws-count">{done.length}</span></summary>{done.map(task => <TaskRow key={task.id} task={task} project={project(task)} definition={definitions.get(task.databaseId ?? "")} onOpen={onOpen} />)}</details>}
      </section>
      <section className="ws-card" aria-label="Agenda"><div className="ws-card-heading"><h2>Agenda</h2></div>
        {dailyEvents.length ? dailyEvents.map(event => <div className="ws-agenda-row" key={event.id}><span className="ws-event-dot" /><span><strong>{event.title || "Untitled"}</strong><small>{event.allDay ? "All day" : new Date(event.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}{event.location ? ` · ${event.location}` : ""}</small></span>
          {event.pageId && <Pressable className="ws-icon" aria-label={`Open ${event.title}`} onClick={() => onOpen(event.pageId!)}><ChevronRight size={18} /></Pressable>}
        </div>) : <div className="ws-quiet-empty"><CalendarDays size={28} /><Pressable className="ws-button" onClick={onCalendar}>Calendar</Pressable></div>}
      </section>
    </div>
  </div>;
}

function JournalHome({ pages, onOpen, onWrite }: { pages: Page[]; onOpen: (id: string) => void; onWrite: (date: string) => void; }) {
  const [query, setQuery] = useState("");
  const entries = pages.filter(page => `${page.title} ${page.properties.__locked ? "" : page.properties.__text ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a,b) => (b.date ?? b.createdAt.slice(0,10)).localeCompare(a.date ?? a.createdAt.slice(0,10)));
  const today = pages.find(page => page.date === localDate());
  const write = () => today ? onOpen(today.id) : onWrite(localDate());
  return <section className="ws-journal-home" aria-label="Journal">
    <header className="ws-journal-home-heading"><h1>Journal</h1>{pages.length > 0 && <Pressable className="ws-button ws-tinted" aria-label={today ? "Continue" : "Write"} onClick={write}><PenLine size={18} />{today ? "Continue" : "Write"}</Pressable>}</header>
    {pages.length > 0 && <label className="ws-search-field"><Search size={18} /><input type="search" aria-label="Search journal" placeholder="Search" value={query} onChange={event => setQuery(event.target.value)} /></label>}
    {entries.length ? <PageList pages={entries} onOpen={onOpen} gallery={false} /> : <div className="ws-journal-empty"><BookOpen size={32} /><Pressable className="ws-button ws-tinted" aria-label={query ? "Clear" : "Write"} onClick={() => query ? setQuery("") : write()}>{query ? "Clear" : "Write"}</Pressable></div>}
    {pages.length > 0 && <JournalOverview pages={pages} onOpen={onOpen} onWrite={() => onWrite(localDate())} />}
  </section>;
}

function JournalOverview({ pages, onOpen }: {
  pages: Page[];
  onOpen: (id: string) => void;
  onWrite: () => void;
}) {
  const days = Array.from({ length: 84 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - 83 + index);
    return localDate(date);
  });
  let streak = 0;
  const dates = new Set(pages.map((page) => page.date));
  for (let offset = 0; offset < 366; offset++) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    if (!dates.has(localDate(date))) break;
    streak++;
  }
  return (
    <div className="ws-journal-overview">
      <details className="ws-journal-history">
        <summary>History<ChevronDown size={16} aria-hidden="true" /></summary>
        <p className="ws-journal-history-caption">Last 12 weeks{streak ? ` · ${streak} ${streak === 1 ? "day" : "days"} of writing` : ""}</p>
      <div className="ws-journal-week" aria-label="Journal this week">
        {days.slice(-7).map((date) => {
          const entry = pages.find((page) => page.date === date);
          return <Pressable key={date} className={entry ? "written" : ""}
            aria-label={`${displayDate(date)}: ${entry ? "entry written" : "no entry"}`}
            onClick={() => entry && onOpen(entry.id)} disabled={!entry}>
            <span>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "narrow" })}</span>
            <span>{Number(date.slice(-2))}</span>
            <i aria-hidden="true" />
          </Pressable>;
        })}
      </div>
        <div className="ws-heatmap" aria-label="Journal entries in the last twelve weeks">
          {days.map((date) => {
            const entry = pages.find((page) => page.date === date);
            return <span key={date} className={`ws-heatmap-day ${entry ? "written" : ""}`}
              title={`${displayDate(date)}: ${entry ? "entry written" : "no entry"}`} />;
          })}
        </div>
      </details>
    </div>
  );
}

function Capture({ projects, onCreate }: { projects: Page[];
  onCreate: (title: string, projectId: string, due: string, notes: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  return <form className="ws-task-capture" onSubmit={event => {
    event.preventDefault(); if (busy || !title.trim()) return; setBusy(true);
    void onCreate(title.trim(), projectId, due, notes).finally(() => setBusy(false));
  }}>
    <input className="ws-input ws-task-name-input" aria-label="Task name" placeholder="Task name" autoFocus required value={title} onChange={event => setTitle(event.target.value)} />
    <details><summary>Details</summary>
      <label className="ws-field-label">Project<select className="ws-input" value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">Inbox</option>{projects.map(project => <option value={project.id} key={project.id}>{titleOf(project)}</option>)}</select></label>
      <label className="ws-field-label">Date<input className="ws-input" type="date" value={due} onChange={event => setDue(event.target.value)} /></label>
      <label className="ws-field-label">Notes<textarea className="ws-input" value={notes} onChange={event => setNotes(event.target.value)} /></label>
    </details>
    <Pressable type="submit" className="ws-button ws-filled" disabled={busy || !title.trim()}>Add task</Pressable>
  </form>;
}

function SearchPanel({
  pages,
  events,
  onOpen,
  onCalendar,
  onAction,
}: {
  pages: Page[];
  events: CalendarEvent[];
  onOpen: (id: string) => void;
  onCalendar: () => void;
  onAction: (name: Module) => void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [date, setDate] = useState("");
  const searcher = useRef<LocalSearch | null>(null);
  const [resultIds, setResultIds] = useState<string[]>([]);
  useEffect(() => {
    searcher.current = new LocalSearch();
    return () => {
      searcher.current?.dispose();
      searcher.current = null;
    };
  }, []);
  useEffect(() => {
    let active = true;
    searcher.current?.index([
      ...pages
        .filter((page) => !page.properties.__locked)
        .map((page) => ({
          id: "page:" + page.id,
          type: page.type,
          title: page.title,
          text:
            page.tags.join(" ") + " " + String(page.properties.__text ?? ""),
          date: page.date ?? page.createdAt.slice(0, 10),
        })),
      ...events
        .filter((event) => !event.deletedAt)
        .map((event) => ({
          id: "event:" + event.id,
          type: "event",
          title: event.title,
          text: event.location + " " + event.notes,
          date: event.start.slice(0, 10),
        })),
    ]);
    void searcher.current
      ?.search(query, {
        type: type === "all" ? undefined : type,
        after: date || undefined,
        before: date || undefined,
      })
      .then((ids) => {
        if (active) setResultIds(ids);
      });
    return () => {
      active = false;
    };
  }, [pages, events, query, type, date]);
  const results = resultIds
    .filter((id) => id.startsWith("page:"))
    .map((id) => pages.find((page) => page.id === id.slice(5)))
    .filter((page): page is Page => !!page)
    .slice(0, 30);
  const eventResults = resultIds
    .filter((id) => id.startsWith("event:"))
    .map((id) => events.find((event) => event.id === id.slice(6)))
    .filter((event): event is CalendarEvent => !!event)
    .slice(0, 15);
  return (
    <div>
      <label className="ws-search-field large">
        <Search size={20} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          aria-label="Search query"
        />
      </label>
      <div className="ws-search-filters">
        <select
          value={type}
          aria-label="Search item type"
          onChange={(event) => setType(event.target.value)}
        >
          <option value="all">All types</option>
          <option value="page">Pages</option>
          <option value="note">Notes</option>
          <option value="journal">Journal</option>
          <option value="event">Events</option>
          <option value="row">Tasks</option>
        </select>
        <input
          type="date"
          value={date}
          aria-label="Search date"
          onChange={(event) => setDate(event.target.value)}
        />
      </div>
      {!query && !date ? (
        <>
          <p className="ws-eyebrow">GO TO</p>
          {modules.map(({ name, icon: Icon }) => (
            <Pressable
              className="ws-page-row"
              key={name}
              onClick={() => onAction(name)}
            >
              <Icon size={20} />
              <strong>{name}</strong>
              <ChevronRight size={16} />
            </Pressable>
          ))}
        </>
      ) : (
        <div aria-live="polite">
          <p className="ws-muted">
            {results.length + eventResults.length}{" "}
            {results.length + eventResults.length === 1 ? "result" : "results"}
          </p>
          {results.map((page) => (
            <PageButton key={page.id} page={page} onOpen={onOpen} />
          ))}
          {eventResults.map((event) => (
            <Pressable
              className="ws-page-row"
              key={event.id}
              onClick={onCalendar}
            >
              <CalendarDays size={20} />
              <span className="ws-page-row-text">
                <strong>{event.title}</strong>
                <span>{displayDate(event.start)}</span>
              </span>
              <ChevronRight size={16} />
            </Pressable>
          ))}
          {!results.length && !eventResults.length && (
            <Empty title="Nothing found yet">
              Try another word, type, or date.
            </Empty>
          )}
        </div>
      )}
    </div>
  );
}

function PageDetail({
  page,
  pages,
  databases,
  projectTypes,
  onOpen,
  onPatch,
  onTrash,
  onDuplicate,
  onMove,
  onFocus,
  onNotify,
  onError,
}: {
  page: Page;
  pages: Page[];
  databases: DatabaseDefinition[];
  projectTypes: ProjectTypes;
  onOpen: (id: string) => void;
  onPatch: (patch: Partial<Page>) => Promise<void>;
  onTrash: () => void;
  onDuplicate: () => void;
  onMove: (parent: string | null) => void;
  onFocus: () => void;
  onNotify: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const openFormatting = useRef(false);
  useEffect(() => {
    const open = (event: Event) => { if ((event as CustomEvent).detail === page.id) setMenuOpen(true); };
    window.addEventListener("kimpor-page-options", open);
    return () => window.removeEventListener("kimpor-page-options", open);
  }, [page.id]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [title, setTitle] = useState(page.title);
  const [titleState, setTitleState] = useState("");
  const titleInput = useRef<HTMLInputElement>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTitle = useRef<string | null>(null);
  const titleFlight = useRef<Promise<void>>(Promise.resolve());
  const lastText = useRef("");
  useEffect(() => {
    if (pendingTitle.current === null) {
      setTitle(page.title);
      setTitleState("");
    }
    lastText.current = "";
  }, [page.id, page.title]);
  const persistTitle = useCallback(() => {
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = null;
    const next = pendingTitle.current;
    if (next === null) return titleFlight.current;
    pendingTitle.current = null;
    titleFlight.current = titleFlight.current
      .catch(() => {})
      .then(() => store.patchPage(page.id, { title: next }))
      .then(() => {
        if (pendingTitle.current === null) setTitleState("");
      })
      .catch((cause) => {
        if (pendingTitle.current === null) pendingTitle.current = next;
        setTitleState("Needs attention");
        throw cause;
      });
    return titleFlight.current;
  }, [page.id]);
  useEffect(() => registerEditorFlush(persistTitle), [persistTitle]);
  useEffect(
    () => () => {
      if (titleTimer.current) clearTimeout(titleTimer.current);
    },
    [],
  );
  const saveTitle = (next: string) => {
    setTitle(next);
    pendingTitle.current = next;
    setTitleState("");
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      void persistTitle().catch((cause) => onError(String(cause)));
    }, 300);
  };
  const definition = databases.find((database) => database.id === page.id);
  const backlinks = pages.filter(
    (candidate) =>
      !candidate.properties.__encrypted &&
      typeof candidate.properties.__text === "string" &&
      candidate.properties.__text.includes(`[[${page.title}]]`) &&
      candidate.id !== page.id,
  );
  return (
    <div
      className="ws-page-detail" data-page-type={page.type}
      key={page.id}
      onClickCapture={(event) => {
        const link = event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[data-page-mention]")
          : null;
        if (!link) return;
        event.preventDefault();
        event.stopPropagation();
        const id = link.dataset.pageMention;
        if (id && pages.some((candidate) => candidate.id === id)) onOpen(id);
        else onNotify("This page is in Trash or unavailable.");
      }}
    >
      {page.cover && (
        <div
          className={`ws-page-cover ${["blue", "purple", "warm"].includes(page.cover) ? page.cover : ""}`}
        />
      )}
      {titleState && <Pressable className="ws-sync-retry" aria-label="Retry title" onClick={() => void persistTitle().catch(cause => onError(String(cause)))}><span className="ws-status-dot" />Retry</Pressable>}
      <div className="ws-page-title-row">
        <Pressable
          className="ws-page-emoji"
          aria-label="Change page icon"
          onClick={() => setMenuOpen(true)}
        >
          {pageIcon(page)}
        </Pressable>
        <input
          ref={titleInput}
          className="ws-page-title"
          value={page.properties.__locked ? "Locked entry" : title}
          aria-label="Page title"
          placeholder="Untitled"
          readOnly={Boolean(page.properties.__locked)}
          onChange={(event) => saveTitle(event.target.value)}
          onBlur={() => {
            void persistTitle().catch((cause) => onError(String(cause)));
          }}
        />
      </div>
      {page.type === "database" ? (
        definition ? (
          <DatabaseEditor
            definition={definition}
            pages={pages}
            databases={databases}
            projectType={projectType(page, projectTypes)}
            onOpen={onOpen}
            onError={onError}
          />
        ) : (
          <Loading />
        )
      ) : (
        <Suspense fallback={<Loading />}>
          <RichTextEditor
            pageId={page.id}
            onTextChange={(text) => {
              if (text === lastText.current) return;
              lastText.current = text;
              if (!page.properties.__locked && text !== page.properties.__text)
                void onPatch({
                  properties: { ...page.properties, __text: text },
                });
            }}
          />
        </Suspense>
      )}
      {page.type !== "database" && <details className="ws-page-details"><summary>Details</summary>
      {page.type === "journal" && <div className="ws-journal-entry-date"><CalendarDays size={15} /><time>{displayDate(page.date ?? localDate())}</time>
        <Pressable className="ws-journal-mood-summary" aria-label="Journal date and mood" onClick={() => setMenuOpen(true)}>
          {page.properties.mood ? ["😔", "🙁", "😐", "🙂", "😊"][Number(page.properties.mood) - 1] : "How I feel"}
        </Pressable></div>}
      {page.tags.length > 0 && (
        <div className="ws-tags">
          {page.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      )}
      {page.type === "row" && (
        <RowProperties
          page={page}
          definition={databases.find(
            (database) => database.id === page.databaseId,
          )}
          pages={pages}
          onPatch={onPatch}
        />
      )}
      {(page.type === "page" || pages.some((child) => child.parentId === page.id) || backlinks.length > 0) && (
        <div className="ws-page-links">
          <div className="ws-page-links-heading">
            <h3>Inside this page</h3>
            <Pressable
              className="ws-button"
              onClick={() =>
                void store
                  .createPage("page", "", { parentId: page.id })
                  .then((child) => onOpen(child.id))
                  .catch((cause) => onError(String(cause)))
              }
            >
              <Plus size={16} />
              Page
            </Pressable>
          </div>
          {pages
            .filter((child) => child.parentId === page.id)
            .map((child) => (
              <PageButton key={child.id} page={child} onOpen={onOpen} small />
            ))}
          {backlinks.length > 0 && (
            <>
              <h3>Backlinks</h3>
              {backlinks.map((link) => (
                <PageButton key={link.id} page={link} onOpen={onOpen} small />
              ))}
            </>
          )}
        </div>
      )}
      </details>}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Page options" onAfterClose={() => {
        if (openFormatting.current) { openFormatting.current = false; requestAnimationFrame(() => window.dispatchEvent(new Event("kimpor-editor-tools"))); }
      }}>
        {page.type !== "database" && <Pressable className="ws-button" onClick={() => { openFormatting.current = true; setMenuOpen(false); }}>Formatting</Pressable>}
        <div className="ws-page-menu">
          <Pressable className="ws-menu-row" onClick={() => void onPatch({ favorite: !page.favorite })}>
            <Star size={18} />{page.favorite ? "Unfavorite" : "Favorite"}
          </Pressable>
          {page.type === "journal" && (
        <div className="ws-journal-meta">
          <label>
            Date
            <input
              className="ws-inline-input"
              type="date"
              aria-label="Journal date"
              value={page.date ?? localDate()}
              onChange={(event) => void onPatch({ date: event.target.value })}
            />
          </label>
          <div className="ws-mood" aria-label="Mood">
            {moodNames.map((name, index) => (
              <Pressable
                key={name}
                className={page.properties.mood === index + 1 ? "selected" : ""}
                aria-label={name}
                aria-pressed={page.properties.mood === index + 1}
                onClick={() =>
                  void onPatch({
                    properties: { ...page.properties, mood: index + 1 },
                  })
                }
              >
                {["😔", "🙁", "😐", "🙂", "😊"][index]}
              </Pressable>
            ))}
          </div>
        </div>
      )}

          <div className="ws-icon-picker" aria-label="Page icons">
            {icons.map((icon) => (
              <Pressable
                key={icon}
                aria-label={`Use ${icon} icon`}
                onClick={() => void onPatch({ icon })}
              >
                {icon}
              </Pressable>
            ))}
          </div>
          <label className="ws-field-label">
            Cover
            <select
              className="ws-input"
              value={page.cover}
              onChange={(event) => void onPatch({ cover: event.target.value })}
            >
              <option value="">No cover</option>
              <option value="blue">Blue gradient</option>
              <option value="purple">Purple gradient</option>
              <option value="warm">Warm gradient</option>
            </select>
          </label>
          <label className="ws-field-label">
            Tags (separate with commas)
            <input
              className="ws-input"
              defaultValue={page.tags.join(", ")}
              onBlur={(event) =>
                void onPatch({
                  tags: [
                    ...new Set(
                      event.target.value
                        .split(",")
                        .map((tag) => tag.trim())
                        .filter(Boolean),
                    ),
                  ],
                })
              }
            />
          </label>
          <label className="ws-field-label">
            Move to
            <select
              className="ws-input"
              value={page.parentId ?? ""}
              onChange={(event) => onMove(event.target.value || null)}
            >
              <option value="">Workspace root</option>
              {pages
                .filter(
                  (item) =>
                    item.id !== page.id &&
                    item.type !== "row" &&
                    item.type !== "journal",
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {titleOf(item)}
                  </option>
                ))}
            </select>
          </label>
          <Pressable
            className="ws-menu-row"
            aria-pressed={page.fullWidth}
            onClick={() => void onPatch({ fullWidth: !page.fullWidth })}
          >
            <Columns3 size={18} />
            Full width{page.fullWidth && <Check size={18} />}
          </Pressable>
          <Pressable
            className="ws-menu-row"
            onClick={() => {
              onFocus();
              setMenuOpen(false);
            }}
          >
            <BookOpen size={18} />
            Focus mode
          </Pressable>
          <Pressable
            className="ws-menu-row"
            onClick={() => {
              setMenuOpen(false);
              setVersionsOpen(true);
            }}
          >
            <Clock3 size={18} />
            Version history
          </Pressable>
          <Pressable
            className="ws-menu-row"
            disabled={Boolean(page.properties.__locked)}
            onClick={() => {
              onDuplicate();
              setMenuOpen(false);
            }}
          >
            <FileText size={18} />
            Duplicate
          </Pressable>
          <Pressable
            className="ws-menu-row"
            disabled={Boolean(page.properties.__locked)}
            onClick={() => {
              void onPatch({
                properties: {
                  ...page.properties,
                  __template: !page.properties.__template,
                },
              });
              onNotify(
                page.properties.__template
                  ? "Template removed"
                  : "Template added",
              );
            }}
          >
            <LayoutGrid size={18} />
            {page.properties.__template
              ? "Remove template"
              : "Save as template"}
          </Pressable>
          {["page", "note"].includes(page.type) && (
            <Pressable
              className="ws-menu-row"
              onClick={() => {
                void onPatch({ type: page.type === "note" ? "page" : "note" });
                setMenuOpen(false);
              }}
            >
              <FileText size={18} />
              Convert to {page.type === "note" ? "page" : "note"}
            </Pressable>
          )}
          <Pressable
            className="ws-menu-row ws-danger"
            onClick={() => {
              onTrash();
              setMenuOpen(false);
            }}
          >
            <Trash2 size={18} />
            Move to Trash
          </Pressable>
        </div>
      </Sheet>
      <Sheet
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        title="Version history"
      >
        <VersionHistory
          pageId={page.id}
          onNotify={onNotify}
          onError={onError}
        />
      </Sheet>
    </div>
  );
}

function VersionHistory({
  pageId,
  onNotify,
  onError,
}: {
  pageId: string;
  onNotify: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [versions, setVersions] = useState<{ id: string; createdAt: string }[]>(
    [],
  );
  useEffect(() => {
    void Promise.resolve(store.listVersions(pageId))
      .then(setVersions)
      .catch((cause) => onError(String(cause)));
  }, [pageId, onError]);
  return (
    <>
      <p className="ws-muted">
        Restore a saved document snapshot. The current document is preserved as
        another version.
      </p>
      {versions.length ? (
        versions.map((version) => (
          <div className="ws-trash-row" key={version.id}>
            <time>{new Date(version.createdAt).toLocaleString()}</time>
            <Pressable
              className="ws-button ws-tinted"
              onClick={() => {
                if (
                  window.confirm(
                    "Restore this version? Your current document will be preserved.",
                  )
                )
                  void store
                    .restoreVersion(pageId, version.id)
                    .then(() => onNotify("Version restored"))
                    .catch((cause) => onError(String(cause)));
              }}
            >
              Restore
            </Pressable>
          </div>
        ))
      ) : (
        <Empty title="No earlier versions yet">
          Snapshots appear as you edit your document.
        </Empty>
      )}
    </>
  );
}

function RowProperties({
  page,
  definition,
  pages,
  onPatch,
}: {
  page: Page;
  definition?: DatabaseDefinition;
  pages: Page[];
  onPatch: (patch: Partial<Page>) => Promise<void>;
}) {
  return definition ? (
    <div className="ws-row-properties">
      {definition.properties
        .filter((property) => property.type !== "title")
        .map((property) => (
          <label key={property.id}>
            <span>{property.name}</span>
            <PropertyInput
              property={property}
              value={page.properties[property.id] ?? null}
              row={page}
              pages={pages}
              onChange={(value) =>
                void onPatch({
                  properties: { ...page.properties, [property.id]: value },
                })
              }
            />
          </label>
        ))}
    </div>
  ) : null;
}

function propertyValue(row: Page, key: string) {
  return key === "title" ? row.title : (row.properties[key] ?? null);
}
function matchesFilter(row: Page, filter: Filter | FilterGroup): boolean {
  if ("children" in filter)
    return filter.operator === "and"
      ? filter.children.every((child) => matchesFilter(row, child))
      : filter.children.some((child) => matchesFilter(row, child));
  const value = propertyValue(row, filter.property);
  if (filter.operator === "empty")
    return (
      value === null || value === "" || (Array.isArray(value) && !value.length)
    );
  const actual = String(value ?? "").toLocaleLowerCase();
  const expected = String(filter.value ?? "").toLocaleLowerCase();
  if (filter.operator === "contains") return actual.includes(expected);
  if (filter.operator === "before") return actual < expected;
  if (filter.operator === "after") return actual > expected;
  return actual === expected;
}
function PropertyInput({
  property,
  value,
  row,
  pages,
  onChange,
}: {
  property: PropertyDefinition;
  value: PropertyValue;
  row: Page;
  pages: Page[];
  onChange: (value: PropertyValue) => void;
}) {
  if (property.type === "checkbox")
    return (
      <Pressable
        className="ws-property-check"
        role="checkbox"
        aria-checked={Boolean(value)}
        aria-label={property.name}
        onClick={() => onChange(!value)}
      >
        <span>{value ? <Check size={14} /> : null}</span>
      </Pressable>
    );
  if (property.type === "select" || property.type === "status")
    return (
      <select
        value={String(value ?? "")}
        aria-label={property.name}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">—</option>
        {property.options?.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    );
  if (property.type === "relation")
    return (
      <select
        multiple
        value={Array.isArray(value) ? value : []}
        aria-label={property.name}
        onChange={(event) =>
          onChange(
            [...event.target.selectedOptions].map((option) => option.value),
          )
        }
      >
        {pages
          .filter((page) => page.databaseId === property.relationDatabaseId)
          .map((page) => (
            <option key={page.id} value={page.id}>
              {titleOf(page)}
            </option>
          ))}
      </select>
    );
  if (property.type === "rollup") {
    const relation = Array.isArray(value)
      ? value
      : Object.values(row.properties).find(
          (candidate) =>
            Array.isArray(candidate) &&
            candidate.some((id) => pages.some((page) => page.id === id)),
        );
    const linked = pages.filter(
      (page) => Array.isArray(relation) && relation.includes(page.id),
    );
    const values = linked.map(
      (page) => page.properties[property.rollupProperty ?? ""],
    );
    const numbers = values.filter(
      (item): item is number => typeof item === "number",
    );
    return (
      <output aria-label={property.name}>
        {numbers.length
          ? numbers.reduce((sum, item) => sum + item, 0)
          : values
              .filter((item) => item !== undefined && item !== null)
              .join(", ") ||
            linked.length ||
            "—"}
      </output>
    );
  }
  if (property.type === "multi-select")
    return (
      <input
        aria-label={property.name}
        placeholder="Separate with commas"
        value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
        list={`options-${property.id}`}
      />
    );
  if (property.type === "files")
    return (
      <span className="ws-files-property">
        <label className="ws-file-button">
          Attach
          <input
            type="file"
            multiple
            aria-label={property.name}
            onChange={(event) =>
              onChange([
                ...(Array.isArray(value) ? value : []),
                ...[...(event.target.files ?? [])].map((file) => file.name),
              ])
            }
          />
        </label>
        {Array.isArray(value) &&
          value.map((name) => <span key={name}>{name}</span>)}
        <small></small>
      </span>
    );
  return (
    <input
      aria-label={property.name}
      type={
        property.type === "number"
          ? "number"
          : property.type === "date"
            ? "date"
            : property.type === "url"
              ? "url"
              : property.type === "email"
                ? "email"
                : property.type === "phone"
                  ? "tel"
                  : "text"
      }
      value={property.type === "date" ? String(value ?? "").slice(0, 10) : String(value ?? "")}
      onChange={(event) =>
        onChange(
          property.type === "number"
            ? event.target.value === ""
              ? null
              : Number(event.target.value)
            : event.target.value,
        )
      }
    />
  );
}

function DatabaseEditor({
  definition,
  pages,
  databases,
  projectType: type,
  onOpen,
  onError,
}: {
  definition: DatabaseDefinition;
  pages: Page[];
  databases: DatabaseDefinition[];
  projectType?: ProjectType;
  onOpen: (id: string) => void;
  onError: (message: string) => void;
}) {
  const preset = projectPreset(type);
  const views = projectViews(definition, type);
  const [viewId, setViewId] = useState(views.find(view => view.type === preset?.view)?.id ?? views[0]?.id ?? "");
  const visibleFields = visibleProjectFields(definition, type);
  const [configOpen, setConfigOpen] = useState(false);
  const [propertyOpen, setPropertyOpen] = useState(false);
  const [newPropertyName, setNewPropertyName] = useState("");
  const [newPropertyType, setNewPropertyType] =
    useState<PropertyDefinition["type"]>("text");
  const [newPropertyOptions, setNewPropertyOptions] = useState("");
  const [relationDatabase, setRelationDatabase] = useState("");
  const [rollupProperty, setRollupProperty] = useState("");
  const view = views.find((item) => item.id === viewId) ??
    views[0] ?? {
      id: "table",
      name: "Table",
      type: "table" as const,
    };
  const rawRows = pages.filter(
    (page) => page.type === "row" && page.databaseId === definition.id,
  );
  const rows = rawRows
    .filter((row) => !view.filter || matchesFilter(row, view.filter))
    .sort((a, b) => {
      for (const sort of view.sort ?? []) {
        const left = propertyValue(a, sort.property);
        const right = propertyValue(b, sort.property);
        const result =
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left ?? "").localeCompare(String(right ?? ""));
        if (result) return sort.direction === "desc" ? -result : result;
      }
      return a.createdAt.localeCompare(b.createdAt);
    });
  const save = async (next: DatabaseDefinition) => {
    try {
      await store.saveDatabase({
        ...next,
        updatedAt: new Date().toISOString(),
      });
    } catch (cause) {
      onError(String(cause));
    }
  };
  const patchView = (patch: Partial<DatabaseView>) =>
    void save({
      ...definition,
      views: views.map((item) =>
        item.id === view.id ? { ...item, ...patch } : item,
      ),
    });
  const completeRow = (row: Page) => completeProjectTask(store, row, definition);
  const addRow = async (properties: Record<string, PropertyValue> = {}) => {
    try {
      const row = await store.createPage("row", "", {
        databaseId: definition.id,
        parentId: definition.id,
        properties: { ...(preset?.type === "rework" ? { item: Math.max(0, ...rawRows.map(row => Number(row.properties.item) || 0)) + 1, status: "Open" } : {}),
          ...(preset?.type === "app" ? { status: "Idea" } : {}), ...properties },
      });
      onOpen(row.id);
    } catch (cause) {
      onError(String(cause));
    }
  };
  const patchRow = (row: Page, key: string, value: PropertyValue) =>
    void store
      .patchPage(
        row.id,
        key === "title"
          ? { title: String(value ?? "") }
          : { properties: { ...row.properties, [key]: value } },
      )
      .catch((cause) => onError(String(cause)));
  const grouping =
    (preset?.group === "area" ? definition.properties.find(property => /room|area/i.test(property.name)) : undefined) ??
    definition.properties.find((property) => property.id === view.groupBy) ??
    definition.properties.find(
      (property) => property.type === "status" || property.type === "select",
    );
  const groupKey = (row: Page) => preset?.group === "week"
    ? String(row.properties.week ?? (taskDue(row, definition) ? weekNumber(new Date(`${taskDue(row, definition)}T12:00:00`)) : "Anytime"))
    : String(row.properties[grouping?.id ?? ""] ?? "No group");
  const groups = [...new Set([...(preset?.group === "week" ? [] : grouping?.options ?? []), ...rows.map(groupKey)])];
  if (!groups.length) groups.push("No group");
  const dateProperty = definition.properties.find(
    (property) => property.type === "date",
  );
  return (
    <div className="ws-database">
      <div className="ws-database-toolbar">
        <select aria-label="Project view" className="ws-view-picker" value={view.id} onChange={event => setViewId(event.target.value)}>
          {views.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
        <div className="ws-database-actions">
          <Pressable className="ws-button" onClick={() => setConfigOpen(true)}>
            More
            {view.filter || view.sort?.length ? (
              <span className="ws-status-dot" />
            ) : null}
          </Pressable>
          <Pressable
            className="ws-button ws-tinted"
            onClick={() => void addRow()}
          >
            <Plus size={16} />
            New task
          </Pressable>
        </div>
      </div>
      <div className="ws-db-count">
        {rows.length} {rows.length === 1 ? "item" : "items"}
        {rows.length !== rawRows.length ? ` of ${rawRows.length}` : ""}
      </div>
      {view.type === "table" && (
        <div className="ws-db-table-scroll">
          <table className="ws-db-table">
            <thead>
              <tr>
                {visibleFields.map((property) => (
                  <th key={property.id} scope="col">
                    {property.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {visibleFields.map((property) => (
                    <td key={property.id}>
                      {property.type === "title" ? (
                        <div className="ws-db-title">
                          <Pressable
                            className="ws-icon"
                            aria-label={`Open ${titleOf(row)}`}
                            onClick={() => onOpen(row.id)}
                          >
                            <FileText size={16} />
                          </Pressable>
                          <input
                            value={row.title}
                            aria-label="Row title"
                            placeholder="Untitled"
                            onChange={(event) =>
                              patchRow(row, "title", event.target.value)
                            }
                          />
                        </div>
                      ) : (
                        <PropertyInput
                          property={property}
                          value={row.properties[property.id] ?? null}
                          row={row}
                          pages={pages}
                          onChange={(value) =>
                            patchRow(row, property.id, value)
                          }
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view.type === "list" && (
        <div className="ws-db-list">
          {((preset?.group === "area" || preset?.group === "week") ? groups : [""]).map(group => <section key={group}>
            {group && <h3>{preset?.group === "week" && group !== "Anytime" ? `Week ${group}` : group}</h3>}
            {rows.filter(row => !taskDone(row, definition) && (!group || groupKey(row) === group)).map(row => <div className="ws-project-task" key={row.id}>
              <TaskRow task={row} definition={definition} onOpen={onOpen} onComplete={row => void completeRow(row).catch(cause => onError(String(cause)))} />
              <div className="ws-task-secondary">{visibleFields.filter(property => property.type !== "title" && property.type !== "status" && property.type !== "date").map(property => <span key={property.id}>{row.properties[property.id] == null ? null : `${property.name} ${String(row.properties[property.id])}`}</span>)}</div>
            </div>)}
          </section>)}
          {rows.some(row => taskDone(row, definition)) && <details className="ws-done-tasks"><summary>Done</summary>{rows.filter(row => taskDone(row, definition)).map(row => <TaskRow key={row.id} task={row} definition={definition} onOpen={onOpen} />)}</details>}
        </div>
      )}
      {view.type === "board" && (
        <div className="ws-db-board">
          {groups.map((group) => (
            <section
              className="ws-board-column"
              key={group}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/veloradesk-row");
                const row = rows.find((item) => item.id === id);
                if (row && grouping)
                  patchRow(
                    row,
                    grouping.id,
                    group === "No group" ? null : group,
                  );
              }}
            >
              <h3>
                {group}
                <span className="ws-count">
                  {
                    rows.filter(
                      (row) =>
                        String(
                          row.properties[grouping?.id ?? ""] ?? "No group",
                        ) === group,
                    ).length
                  }
                </span>
              </h3>
              {rows
                .filter(
                  (row) =>
                    String(row.properties[grouping?.id ?? ""] ?? "No group") ===
                    group,
                )
                .map((row) => (
                  <Pressable
                    key={row.id}
                    draggable
                    onDragStartCapture={(event) =>
                      event.dataTransfer.setData("text/veloradesk-row", row.id)
                    }
                    className="ws-board-card"
                    onClick={() => onOpen(row.id)}
                  >
                    <strong>{titleOf(row)}</strong>
                    {dateProperty && row.properties[dateProperty.id] && (
                      <small>
                        {displayDate(String(row.properties[dateProperty.id]))}
                      </small>
                    )}
                  </Pressable>
                ))}
              <Pressable
                className="ws-button"
                onClick={() =>
                  void addRow(
                    grouping
                      ? { [grouping.id]: group === "No group" ? null : group }
                      : {},
                  )
                }
              >
                <Plus size={16} />
                Add task
              </Pressable>
            </section>
          ))}
        </div>
      )}
      {view.type === "gallery" && (
        <div className="ws-db-gallery">
          {rows.map((row) => (
            <Pressable
              key={row.id}
              className="ws-gallery-card"
              onClick={() => onOpen(row.id)}
            >
              <span className="ws-gallery-cover">{pageIcon(row)}</span>
              <strong>{titleOf(row)}</strong>
              {row.tags.length > 0 && <small>{row.tags.join(" · ")}</small>}
            </Pressable>
          ))}
        </div>
      )}
      {view.type === "calendar" &&
        (dateProperty ? (
          <DatabaseCalendar
            rows={rows}
            dateProperty={dateProperty.id}
            onOpen={onOpen}
            onAdd={(date) => void addRow({ [dateProperty.id]: date })}
          />
        ) : (
          <Empty title="Choose a date property">
            Add a Date property to place rows on your calendar.
          </Empty>
        ))}
      {!rows.length && view.type !== "calendar" && (
        <Empty title="A fresh database">
          Add a row. Each item is a page with its own notes.
        </Empty>
      )}
      <Sheet
        open={configOpen}
        onOpenChange={setConfigOpen}
        title="View settings"
      >
        <label className="ws-field-label">
          View name
          <input
            className="ws-input"
            value={view.name}
            onChange={(event) => patchView({ name: event.target.value })}
          />
        </label>
        <label className="ws-field-label">
          View type
          <select
            className="ws-input"
            value={view.type}
            onChange={(event) =>
              patchView({ type: event.target.value as DatabaseView["type"] })
            }
          >
            {Object.keys(viewIcons).map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="ws-field-label">
          Group by
          <select
            className="ws-input"
            value={view.groupBy ?? ""}
            onChange={(event) => patchView({ groupBy: event.target.value })}
          >
            <option value="">None</option>
            {definition.properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </label>
        <Pressable className="ws-button" onClick={() => setPropertyOpen(true)}>Add property</Pressable>
        <h3>Filters</h3>
        <FilterEditor
          filter={view.filter ?? { operator: "and", children: [] }}
          properties={definition.properties}
          onChange={(filter) => patchView({ filter })}
        />
        <h3>Sort</h3>
        {view.sort?.map((sort, index) => (
          <div className="ws-filter-row" key={index}>
            <select
              value={sort.property}
              aria-label="Sort property"
              onChange={(event) =>
                patchView({
                  sort: view.sort?.map((item, position) =>
                    position === index
                      ? { ...item, property: event.target.value }
                      : item,
                  ),
                })
              }
            >
              {definition.properties.map((property) => (
                <option value={property.id} key={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
            <select
              value={sort.direction}
              aria-label="Sort direction"
              onChange={(event) =>
                patchView({
                  sort: view.sort?.map((item, position) =>
                    position === index
                      ? {
                          ...item,
                          direction: event.target.value as "asc" | "desc",
                        }
                      : item,
                  ),
                })
              }
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
            <Pressable
              className="ws-icon"
              aria-label="Remove sort"
              onClick={() =>
                patchView({
                  sort: view.sort?.filter((_, position) => position !== index),
                })
              }
            >
              <X size={16} />
            </Pressable>
          </div>
        ))}
        <Pressable
          className="ws-button ws-tinted"
          onClick={() =>
            patchView({
              sort: [
                ...(view.sort ?? []),
                { property: "title", direction: "asc" },
              ],
            })
          }
        >
          <Plus size={16} />
          Add sort
        </Pressable>
        <Pressable
          className="ws-button"
          onClick={() => {
            const id = crypto.randomUUID();
            void save({
              ...definition,
              views: [
                ...definition.views,
                { ...view, id, name: `${view.name} copy` },
              ],
            });
            setViewId(id);
          }}
        >
          Duplicate saved view
        </Pressable>
      </Sheet>
      <Sheet
        open={propertyOpen}
        onOpenChange={setPropertyOpen}
        title="Database properties"
      >
        <div className="ws-property-list">
          {definition.properties.map((property) => (
            <div className="ws-trash-row" key={property.id}>
              <span>
                <strong>{property.name}</strong>
                <small>{property.type}</small>
              </span>
              {property.type !== "title" && (
                <Pressable
                  className="ws-icon ws-danger"
                  aria-label={`Remove ${property.name} property`}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove ${property.name}? Existing values remain in each row's data export.`,
                      )
                    )
                      void save({
                        ...definition,
                        properties: definition.properties.filter(
                          (item) => item.id !== property.id,
                        ),
                      });
                  }}
                >
                  <Trash2 size={16} />
                </Pressable>
              )}
            </div>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!newPropertyName.trim()) return;
            void save({
              ...definition,
              properties: [
                ...definition.properties,
                {
                  id: crypto.randomUUID(),
                  name: newPropertyName.trim(),
                  type: newPropertyType,
                  options: newPropertyOptions
                    .split(",")
                    .map((option) => option.trim())
                    .filter(Boolean),
                  relationDatabaseId: relationDatabase || undefined,
                  rollupProperty: rollupProperty || undefined,
                },
              ],
            });
            setNewPropertyName("");
            setPropertyOpen(false);
          }}
        >
          <label className="ws-field-label">
            Property name
            <input
              className="ws-input"
              value={newPropertyName}
              onChange={(event) => setNewPropertyName(event.target.value)}
              required
            />
          </label>
          <label className="ws-field-label">
            Type
            <select
              className="ws-input"
              value={newPropertyType}
              onChange={(event) =>
                setNewPropertyType(
                  event.target.value as PropertyDefinition["type"],
                )
              }
            >
              {propertyTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          {["select", "multi-select", "status"].includes(newPropertyType) && (
            <label className="ws-field-label">
              Options (separate with commas)
              <input
                className="ws-input"
                value={newPropertyOptions}
                onChange={(event) => setNewPropertyOptions(event.target.value)}
              />
            </label>
          )}
          {newPropertyType === "relation" && (
            <label className="ws-field-label">
              Related database
              <select
                className="ws-input"
                value={relationDatabase}
                onChange={(event) => setRelationDatabase(event.target.value)}
                required
              >
                <option value="">Choose a database</option>
                {databases
                  .filter((item) => item.id !== definition.id)
                  .map((item) => (
                    <option value={item.id} key={item.id}>
                      {pages.find((page) => page.id === item.id)?.title ||
                        "Untitled database"}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {newPropertyType === "rollup" && (
            <label className="ws-field-label">
              Property to sum / collect
              <input
                className="ws-input"
                value={rollupProperty}
                onChange={(event) => setRollupProperty(event.target.value)}
                placeholder="Related property ID"
              />
              <small>
                Uses this row's relation links. Numbers are summed; text values
                are collected.
              </small>
            </label>
          )}
          <Pressable type="submit" className="ws-button ws-filled">
            Add property
          </Pressable>
        </form>
      </Sheet>
    </div>
  );
}

function FilterEditor({
  filter,
  properties,
  onChange,
  depth = 0,
}: {
  filter: FilterGroup;
  properties: PropertyDefinition[];
  onChange: (filter: FilterGroup) => void;
  depth?: number;
}) {
  return (
    <div className="ws-filter-group">
      <select
        aria-label="Filter combination"
        value={filter.operator}
        onChange={(event) =>
          onChange({ ...filter, operator: event.target.value as "and" | "or" })
        }
      >
        <option value="and">Match all (AND)</option>
        <option value="or">Match any (OR)</option>
      </select>
      {filter.children.map((child, index) => (
        <div className="ws-filter-child" key={index}>
          {"children" in child ? (
            <FilterEditor
              filter={child}
              properties={properties}
              depth={depth + 1}
              onChange={(next) =>
                onChange({
                  ...filter,
                  children: filter.children.map((item, position) =>
                    position === index ? next : item,
                  ),
                })
              }
            />
          ) : (
            <div className="ws-filter-row">
              <select
                value={child.property}
                aria-label="Filter property"
                onChange={(event) =>
                  onChange({
                    ...filter,
                    children: filter.children.map((item, position) =>
                      position === index
                        ? { ...child, property: event.target.value }
                        : item,
                    ),
                  })
                }
              >
                {properties.map((property) => (
                  <option value={property.id} key={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
              <select
                value={child.operator}
                aria-label="Filter condition"
                onChange={(event) =>
                  onChange({
                    ...filter,
                    children: filter.children.map((item, position) =>
                      position === index
                        ? {
                            ...child,
                            operator: event.target.value as Filter["operator"],
                          }
                        : item,
                    ),
                  })
                }
              >
                {["contains", "equals", "before", "after", "empty"].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
              {child.operator !== "empty" && (
                <input
                  aria-label="Filter value"
                  value={String(child.value ?? "")}
                  onChange={(event) =>
                    onChange({
                      ...filter,
                      children: filter.children.map((item, position) =>
                        position === index
                          ? { ...child, value: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              )}
            </div>
          )}
          <Pressable
            className="ws-icon ws-filter-remove"
            aria-label="Remove filter"
            onClick={() =>
              onChange({
                ...filter,
                children: filter.children.filter(
                  (_, position) => position !== index,
                ),
              })
            }
          >
            <X size={16} />
          </Pressable>
        </div>
      ))}
      <div className="ws-filter-add">
        <Pressable
          className="ws-button"
          onClick={() =>
            onChange({
              ...filter,
              children: [
                ...filter.children,
                {
                  property: properties[0]?.id ?? "title",
                  operator: "contains",
                  value: "",
                },
              ],
            })
          }
        >
          <Plus size={14} />
          Rule
        </Pressable>
        {depth < 5 && (
          <Pressable
            className="ws-button"
            onClick={() =>
              onChange({
                ...filter,
                children: [
                  ...filter.children,
                  { operator: "or", children: [] },
                ],
              })
            }
          >
            <Plus size={14} />
            Group
          </Pressable>
        )}
      </div>
    </div>
  );
}

function DatabaseCalendar({
  rows,
  dateProperty,
  onOpen,
  onAdd,
}: {
  rows: Page[];
  dateProperty: string;
  onOpen: (id: string) => void;
  onAdd: (date: string) => void;
}) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const start = new Date(month);
  start.setDate(1 - start.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  return (
    <div>
      <div className="ws-db-calendar-heading">
        <Pressable
          className="ws-icon"
          aria-label="Previous month"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
          }
        >
          <ChevronLeft size={18} />
        </Pressable>
        <h3>
          {month.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          })}
        </h3>
        <Pressable
          className="ws-icon"
          aria-label="Next month"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
          }
        >
          <ChevronRight size={18} />
        </Pressable>
      </div>
      <div className="ws-db-calendar">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <strong key={day}>{day}</strong>
        ))}
        {days.map((date) => (
          <div
            className={`ws-db-day ${date.getMonth() !== month.getMonth() ? "outside" : ""}`}
            key={localDate(date)}
          >
            <Pressable
              className="ws-day-number"
              aria-label={`Add item on ${date.toLocaleDateString()}`}
              onClick={() => onAdd(localDate(date))}
            >
              {date.getDate()}
            </Pressable>
            {rows
              .filter((row) => row.properties[dateProperty] === localDate(date))
              .map((row) => (
                <Pressable
                  className="ws-db-event"
                  key={row.id}
                  onClick={() => onOpen(row.id)}
                >
                  {titleOf(row)}
                </Pressable>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsPanel({
  onNotify,
  onError,
}: {
  onNotify: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [theme, setTheme] = useState(readSetting("velora-theme", "system"));
  const [accent, setAccent] = useState(readSetting("velora-accent", "blue"));
  const [reduceMotion, setReduceMotion] = useState(
    readSetting("velora-reduce-motion", "false") === "true",
  );
  const [textSize, setTextSize] = useState(
    readSetting("velora-text-size", "15"),
  );
  const [density, setDensity] = useState(
    readSetting("velora-density", "comfortable"),
  );
  const [importBusy, setImportBusy] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const update = () => {
      setTheme(readSetting("velora-theme", "system"));
      setAccent(readSetting("velora-accent", "blue"));
      setTextSize(readSetting("velora-text-size", "15"));
      setDensity(readSetting("velora-density", "comfortable"));
      setReduceMotion(readSetting("velora-reduce-motion", "false") === "true");
    };
    window.addEventListener("velora-appearance", update);
    return () => window.removeEventListener("velora-appearance", update);
  }, []);
  const setAppearance = (next: string) => {
    setTheme(next);
    saveAppearance("velora-theme", next);
    const resolved =
      next === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : (next as "dark" | "light");
    document.documentElement.dataset.theme = resolved;
    void platform.applyTheme(resolved);
  };
  const exportAll = async () => {
    try {
      await flushEditors();
      const data = await store.exportData();
      platform.download(
        `kimpor-workspace-${localDate()}.json`,
        typeof data === "string" ? data : JSON.stringify(data, null, 2),
      );
      onNotify("Workspace exported");
    } catch (cause) {
      onError(String(cause));
    }
  };
  return (
    <div className="ws-settings">
      <section>
        <h3>Account</h3>
        <AccountSettings />
      </section>
      <section>
        <h3>Appearance</h3>
        <div className="ws-segment">
          {["system", "light", "dark"].map((value) => (
            <Pressable
              key={value}
              className={theme === value ? "selected" : ""}
              aria-pressed={theme === value}
              onClick={() => setAppearance(value)}
            >
              {value[0]?.toUpperCase()}
              {value.slice(1)}
            </Pressable>
          ))}
        </div>
        <label className="ws-setting-row">
          <span>Accent</span>
          <select
            value={accent}
            onChange={(event) => {
              setAccent(event.target.value);
              saveAppearance("velora-accent", event.target.value);
            }}
          >
            <option value="blue">Blue</option>
            <option value="green">Green</option>
            <option value="red">Red</option>
            <option value="purple">Purple</option>
            <option value="orange">Orange</option>
          </select>
        </label>
        <label className="ws-setting-row">
          <span>Text size</span>
          <input
            type="range"
            min="15"
            max="24"
            value={textSize}
            aria-label="Text size"
            onChange={(event) => {
              setTextSize(event.target.value);
              saveAppearance("velora-text-size", event.target.value);
              document.documentElement.style.setProperty(
                "--text-body",
                `${event.target.value}px`,
              );
            }}
          />
          <span>{textSize} px</span>
        </label>
        <label className="ws-setting-row">
          <span>Density</span>
          <select
            value={density}
            onChange={(event) => {
              setDensity(event.target.value);
              saveAppearance("velora-density", event.target.value);
              document.documentElement.dataset.density = event.target.value;
            }}
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <div className="ws-setting-row">
          <span>Reduce Motion</span>
          <Pressable
            className="ws-switch"
            role="switch"
            aria-checked={reduceMotion}
            aria-label="Reduce Motion"
            onClick={() => {
              const next = !reduceMotion;
              setReduceMotion(next);
              saveAppearance("velora-reduce-motion", String(next));
              document.documentElement.dataset.reduceMotion = String(next);
            }}
          >
            <span />
          </Pressable>
        </div>
      </section>
      <section>
        <h3>Import and export</h3>
        <ImportExportSettings onNotify={onNotify} onError={onError} />
        <details><summary>More</summary>
        <div className="ws-settings-actions">
          <Pressable
            className="ws-button ws-tinted"
            onClick={() => void exportAll()}
          >
            <Download size={16} />
            Export JSON
          </Pressable>
          <Pressable
            className="ws-button"
            onClick={() => importInput.current?.click()}
            disabled={importBusy}
          >
            {importBusy ? "Importing…" : "Import JSON"}
          </Pressable>
        </div>
        <input
          ref={importInput}
          className="ws-sr-only"
          type="file"
          accept="application/json,.json"
          aria-label="Import workspace JSON"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setImportBusy(true);
            void file
              .text()
              .then((text) => store.importData(text))
              .then(() => onNotify("Workspace imported"))
              .catch((cause) => onError(String(cause)))
              .finally(() => {
                setImportBusy(false);
                if (importInput.current) importInput.current.value = "";
              });
          }}
        />
        </details>
      </section>
      <section>
        <h3>Notifications</h3>
        <div className="ws-settings-actions">
          <Pressable
            className="ws-button"
            onClick={() =>
              void enablePush()
                .then(onNotify)
                .catch((cause) => onError(String(cause)))
            }
          >
            Enable
          </Pressable>
          <Pressable
            className="ws-button"
            onClick={() =>
              void disablePush()
                .then(() => onNotify("Background notifications disabled."))
                .catch((cause) => onError(String(cause)))
            }
          >
            Disable
          </Pressable>
        </div>
      </section>
      <AppLockSettings />
      <Suspense fallback={<Loading />}>
        <DesktopSettings />
        <InstallSettings />
      </Suspense>
      <section>
        <h3>Keyboard shortcuts</h3>
        <div className="ws-shortcuts">
          <span>
            Search / command palette<kbd>Ctrl / ⌘ K</kbd>
          </span>
          <span>
            New task<kbd>Ctrl / ⌘ N</kbd>
          </span>
          <span>
            Leave focus mode<kbd>Esc</kbd>
          </span>
          <span>
            Undo in editor<kbd>Ctrl / ⌘ Z</kbd>
          </span>
          <span>
            Editor commands<kbd>/</kbd>
          </span>
        </div>
      </section>
      <section><h3>Region</h3><div className="ws-setting-row"><span>{navigator.language}</span><span>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span></div></section>
    </div>
  );
}

// Cloud and portable formats load only when Settings is opened.
function AccountSettings() {
  return (
    <Suspense fallback={<Loading />}>
      <AccountPanel />
    </Suspense>
  );
}
function ImportExportSettings(props: {
  onNotify: (message: string) => void;
  onError: (message: string) => void;
}) {
  return (
    <Suspense fallback={<Loading />}>
      <ImportExportPanel {...props} />
    </Suspense>
  );
}
