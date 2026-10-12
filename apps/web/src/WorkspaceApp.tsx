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
  Heart,
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
import { EdgeBack, SheetHandle, useCollapsingTitle } from "./WorkspaceChrome";
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
type Module = "Today" | "Calendar" | "Notes" | "Journal" | "Workspace";
type Toast = { message: string; undo?: () => Promise<void> };
const modules: { name: Module; icon: typeof Home }[] = [
  { name: "Today", icon: Home },
  { name: "Calendar", icon: CalendarDays },
  { name: "Notes", icon: FileText },
  { name: "Journal", icon: BookOpen },
  { name: "Workspace", icon: LayoutGrid },
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
      <span className="ws-muted">Opening your workspace…</span>
    </div>
  );
}
function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ws-empty">
      <svg width="96" height="88" viewBox="0 0 96 88" aria-hidden="true">
        <rect
          x="24"
          y="10"
          width="48"
          height="64"
          rx="12"
          fill="var(--surface)"
          stroke="var(--line)"
        />
        <path
          d="M36 30h24M36 40h18M36 50h24"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M17 62l-5 4m68-43 5-3M77 72l5 5"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
function Sheet({
  open,
  onOpenChange,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const opener = useRef<HTMLElement | null>(null),
    content = useRef<HTMLDivElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
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
  const [module, setModule] = useState<Module>("Today");
  const [pages, setPages] = useState<Page[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [databases, setDatabases] = useState<DatabaseDefinition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSetting("velora-sidebar-collapsed", "false") === "true");
  const [trashOpen, setTrashOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [toast, setToast] = useState<Toast | null>(null);
  const [error, setError] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [sort, setSort] = useState("updated");
  const [listView, setListView] = useState<"list" | "gallery">("list");
  const [filter, setFilter] = useState("");
  const [focus, setFocus] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(
    Number(readSetting("velora-sidebar-width", "232")),
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
      const [nextPages, nextEvents, nextDatabases] = await Promise.all([
        store.listPages(true),
        store.listEvents(),
        store.listDatabases(),
      ]);
      setPages(nextPages);
      setEvents(nextEvents);
      setDatabases(nextDatabases);
      setLoaded(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your local workspace could not be opened.",
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
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), toast.undo ? 10000 : 5000);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    let stopped = false;
    let cleanup: (() => void) | undefined;
    void import("./cloud-state")
      .then((module) => {
        if (!stopped) cleanup = module.startCloud();
      })
      .catch((cause) => setError(String(cause)));
    return () => {
      stopped = true;
      cleanup?.();
    };
  }, []);
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
    void flushEditors().then(() => { setSelectedId(null); mainRef.current?.focus(); })
      .catch(cause => setError(String(cause)));
  }, []);
  const toggleSidebar = () => setSidebarCollapsed(previous => {
    const next = !previous;
    localStorage.setItem("velora-sidebar-collapsed", String(next));
    return next;
  });
  const openPage = (id: string) => {
    void flushEditors()
      .then(() => {
        const page = store.listPages().find((item) => item.id === id);
        if (page) {
          setModule(
            page.type === "note"
              ? "Notes"
              : page.type === "journal"
                ? "Journal"
                : "Workspace",
          );
          setSelectedId(id);
          setSidebarOpen(false);
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
    const page = await store.createPage(type, title, extras);
    setModule(
      type === "note" ? "Notes" : type === "journal" ? "Journal" : "Workspace",
    );
    setSelectedId(page.id);
    setCaptureOpen(false);
    setTemplatesOpen(false);
    notify(type === "journal" ? "Journal entry created" : "Ready when you are");
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
        event.shiftKey &&
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
      className={`ws-app ${focus ? "focus-mode" : ""} ${selected ? "has-detail" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
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
            <nav aria-label="Main navigation">
              {modules.map(({ name, icon: Icon }) => (
                <Pressable
                  key={name}
                  className={`ws-nav ${module === name ? "selected" : ""}`}
                  aria-current={module === name ? "page" : undefined}
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
                onClick={() => setTemplatesOpen(true)}
              >
                <LayoutGrid size={16} />
                Templates
              </Pressable>
            </div>
            <div className="ws-sidebar-footer">
              <Pressable
                className="ws-sidebar-link"
                onClick={() => setTrashOpen(true)}
              >
                <Trash2 size={17} />
                Trash
                <span className="ws-count">
                  {pages.filter((page) => page.deletedAt).length || ""}
                </span>
              </Pressable>
              <Pressable
                className="ws-sidebar-link"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings size={17} />
                Settings
              </Pressable>
              <span className="ws-local-status">
                <span className="ws-status-dot" />
                {online
                  ? "Saved on this device"
                  : "Offline · edits saved locally"}
              </span>
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
      <main className="ws-main" ref={mainRef} tabIndex={-1}>
        {selected && <EdgeBack main={mainRef} onBack={back} />}
        <header className="ws-topbar">
          <div className="ws-topbar-leading">
            {!focus && <Pressable className="ws-icon ws-sidebar-toggle"
              aria-label={sidebarCollapsed ? "Open sidebar" : "Collapse sidebar"}
              aria-expanded={!sidebarCollapsed} onClick={toggleSidebar}>
              {sidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </Pressable>}
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
                  aria-label={`Back to ${module}`}
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
              <span className="ws-breadcrumb">Your personal workspace</span>
            )}
          </div>
          <div className="ws-topbar-actions">
            {focus ? (
              <Pressable
                className="ws-button ws-tinted"
                onClick={() => setFocus(false)}
              >
                Leave focus
              </Pressable>
            ) : (
              <>
                <span className="ws-topbar-status">
                  <Check size={14} /> Local first
                </span>
                <Pressable
                  className="ws-icon"
                  aria-label="Search workspace"
                  onClick={() => setSearchOpen(true)}
                >
                  <Search size={20} />
                </Pressable>
                <Pressable
                  className="ws-button ws-filled ws-capture-desktop"
                  onClick={() => setCaptureOpen(true)}
                >
                  <Plus size={16} />
                  Capture
                </Pressable>
              </>
            )}
          </div>
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
            onCreateJournal={() =>
              void run(() => create("journal", "", { date: localDate() }))
            }
            onCreateTasks={() => void run(() => createDatabase(true))}
            onComplete={(page) =>
              void run(async () => {
                const previous = { ...page.properties };
                await store.patchPage(page.id, {
                  properties: { ...previous, completed: true, status: "Done" },
                });
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
                  <p className="ws-eyebrow">
                    {module === "Journal"
                      ? "A little space for yourself"
                      : module === "Notes"
                        ? "Catch a thought"
                        : "Make room for ideas"}
                  </p>
                  <h1>{module}</h1>
                </div>
                {module !== "Journal" && (
                <Pressable
                  className="ws-icon ws-tinted"
                  aria-label={`New ${module === "Notes" ? "note" : "page"}`}
                  onClick={() =>
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
              {module === "Journal" && (
                <JournalOverview
                  pages={livePages.filter((page) => page.type === "journal")}
                  onOpen={openPage}
                  onWrite={() => void run(() => create("journal", "", { date: localDate() }))}
                />
              )}
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
              {module === "Workspace" && (
                <div className="ws-workspace-create">
                  <Pressable
                    className="ws-button ws-tinted"
                    onClick={() => void run(() => createDatabase())}
                  >
                    <Table2 size={16} />
                    New database
                  </Pressable>
                  <Pressable
                    className="ws-button"
                    onClick={() => setTemplatesOpen(true)}
                  >
                    Templates
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
                  >
                    {filter
                      ? "Try a different word or tag."
                      : module === "Journal"
                        ? "Write a few words, keep a memory, or simply check in."
                        : module === "Notes"
                          ? "Ideas, checklists, and everything you want to keep."
                          : "Create a page or database. Everything is saved on your device."}
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
          <Pressable
            className="ws-quick-capture"
            aria-label="Quick capture"
            onClick={() => setCaptureOpen(true)}
          >
            <Plus size={24} />
          </Pressable>
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
        title="Quick capture"
      >
        <Capture
          onCreate={(type, title) =>
            run(() =>
              create(type, title, {
                date: type === "journal" ? localDate() : null,
              }),
            )
          }
        />
      </Sheet>
      <Sheet
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Search your workspace"
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
        <p className="ws-muted">Deleted items can be restored here.</p>
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

function Today({
  pages,
  events,
  onOpen,
  onCapture,
  onCreateJournal,
  onCreateTasks,
  onComplete,
}: {
  pages: Page[];
  events: CalendarEvent[];
  onOpen: (id: string) => void;
  onCapture: () => void;
  onCreateJournal: () => void;
  onCreateTasks: () => void;
  onComplete: (page: Page) => void;
}) {
  const today = localDate();
  const dailyEvents = events
    .filter(
      (event) =>
        !event.deletedAt &&
        event.start.slice(0, 10) <= today &&
        event.end.slice(0, 10) >= today,
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  const journals = pages.filter(
    (page) => page.type === "journal" && page.date === today,
  );
  const tasks = pages.filter(
    (page) =>
      page.type === "row" &&
      !page.properties.completed &&
      page.properties.status !== "Done" &&
      typeof page.properties.due === "string" &&
      page.properties.due <= today,
  );
  const favorites = pages.filter((page) => page.favorite);
  const recent = [...pages]
    .filter((page) => !page.properties.__template && page.type !== "row")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
  return (
    <div className="ws-today">
      <div className="ws-today-heading">
        <div>
          <p className="ws-eyebrow">
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <h1>
            A little clarity,
            <br />
            for today.
          </h1>
          <p className="ws-muted">
            Your plans, thoughts, and memories in one place.
          </p>
        </div>
        <div className="ws-today-illustration" aria-hidden="true">
          <span>☀</span>
          <div className="ws-illustration-page">
            <span />
            <span />
            <span />
            <Check size={24} />
          </div>
        </div>
      </div>
      <div className="ws-today-grid">
        <section className="ws-card">
          <div className="ws-card-heading">
            <h2>
              <CalendarDays size={19} />
              Today's agenda
            </h2>
            <span className="ws-count">{dailyEvents.length}</span>
          </div>
          {dailyEvents.length ? (
            dailyEvents.map((event) => (
              <div className="ws-agenda-row" key={event.id}>
                <span className="ws-event-line" />
                <time>
                  {event.allDay
                    ? "All day"
                    : new Date(event.start).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                </time>
                <span>
                  <strong>{event.title || "Untitled event"}</strong>
                  {event.location && <small>{event.location}</small>}
                </span>
                {event.pageId && (
                  <Pressable
                    className="ws-icon"
                    aria-label={`Open notes for ${event.title}`}
                    onClick={() => onOpen(event.pageId!)}
                  >
                    <FileText size={18} />
                  </Pressable>
                )}
              </div>
            ))
          ) : (
            <div className="ws-quiet-empty">
              <CalendarDays size={28} />
              <p>Your day has room to breathe.</p>
              <span>Events you add to Calendar appear here.</span>
            </div>
          )}
        </section>
        <section className="ws-card">
          <div className="ws-card-heading">
            <h2>
              <Check size={19} />
              Due tasks
            </h2>
            <span className="ws-count">{tasks.length}</span>
          </div>
          {tasks.length ? (
            tasks.map((task) => (
              <div className="ws-task-row" key={task.id}>
                <Pressable
                  className="ws-task-check"
                  aria-label={`Complete ${titleOf(task)}`}
                  onClick={() => onComplete(task)}
                >
                  <span />
                </Pressable>
                <Pressable
                  className="ws-task-title"
                  onClick={() => onOpen(task.id)}
                >
                  {titleOf(task)}
                  <small>
                    {typeof task.properties.due === "string"
                      ? displayDate(task.properties.due)
                      : ""}
                  </small>
                </Pressable>
              </div>
            ))
          ) : (
            <div className="ws-quiet-empty">
              <Check size={28} />
              <p>Nothing due right now.</p>
              <Pressable
                className="ws-button ws-tinted"
                onClick={onCreateTasks}
              >
                Create a Tasks database
              </Pressable>
            </div>
          )}
        </section>
        <section className="ws-card ws-journal-card">
          <span className="ws-tile">
            <BookOpen size={24} />
          </span>
          <div>
            <h2>A moment for yourself</h2>
            <p>
              {journals.length
                ? `${journals.length} ${journals.length === 1 ? "entry" : "entries"} today. You can always write a little more.`
                : "How are you feeling today? A few words are enough."}
            </p>
            <Pressable
              className="ws-button ws-tinted"
              onClick={
                journals.length
                  ? () => onOpen(journals[0]!.id)
                  : onCreateJournal
              }
            >
              {journals.length
                ? "Continue your journal"
                : "Write in your journal"}
              <ChevronRight size={16} />
            </Pressable>
          </div>
        </section>
        <section className="ws-card ws-capture-card">
          <Plus size={26} />
          <h2>Catch a thought</h2>
          <p>A note, a plan, a page. Keep it before it slips away.</p>
          <Pressable className="ws-button ws-filled" onClick={onCapture}>
            Quick capture
          </Pressable>
        </section>
      </div>
      {favorites.length > 0 && (
        <section className="ws-today-section">
          <h2>
            <Star size={18} />
            Pinned pages
          </h2>
          <div className="ws-recent-grid">
            {favorites.map((page) => (
              <PageButton key={page.id} page={page} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}
      <section className="ws-today-section">
        <h2>
          <Clock3 size={18} />
          Recently opened
        </h2>
        <div className="ws-card">
          {recent.length ? (
            recent.map((page) => (
              <PageButton key={page.id} page={page} onOpen={onOpen} />
            ))
          ) : (
            <div className="ws-quiet-empty">
              <p>Your workspace is a clean slate.</p>
              <Pressable className="ws-button ws-tinted" onClick={onCapture}>
                <Plus size={16} />
                Create your first item
              </Pressable>
            </div>
          )}
        </div>
      </section>
      <Memories pages={pages} onOpen={onOpen} />
    </div>
  );
}

function Memories({
  pages,
  onOpen,
}: {
  pages: Page[];
  onOpen: (id: string) => void;
}) {
  const today = localDate();
  const memories = pages.filter(
    (page) =>
      page.type === "journal" &&
      page.date &&
      page.date.slice(5) === today.slice(5) &&
      page.date < today,
  );
  return memories.length ? (
    <section className="ws-today-section">
      <h2>
        <Heart size={18} />
        On this day
      </h2>
      <div className="ws-card">
        {memories.map((page) => (
          <PageButton key={page.id} page={page} onOpen={onOpen} />
        ))}
      </div>
    </section>
  ) : null;
}

function JournalHome({ pages, onOpen, onWrite }: {
  pages: Page[]; onOpen: (id: string) => void; onWrite: (date: string) => void;
}) {
  const [query, setQuery] = useState("");
  const entries = pages.filter(page => `${page.title} ${page.properties.__locked ? "" : page.properties.__text ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a, b) => (b.date ?? b.createdAt.slice(0, 10)).localeCompare(a.date ?? a.createdAt.slice(0, 10)));
  return <section className="ws-journal-home" aria-label="Journal">
    <header className="ws-journal-home-heading"><div><p className="ws-eyebrow">YOUR DAYS, IN YOUR WORDS</p><h1>Journal</h1></div>
      <span className="ws-journal-count">{pages.length} {pages.length === 1 ? "entry" : "entries"}</span></header>
    <div className="ws-journal-home-grid">
      <aside className="ws-journal-home-aside"><JournalOverview pages={pages} onOpen={onOpen} onWrite={() => onWrite(localDate())} />
        <div className="ws-journal-prompt"><PenLine size={20} /><h3>A place to pause.</h3><p>A thought, a small win, or a moment you want to keep.</p></div>
      </aside>
      <div className="ws-journal-entry-browser">
        <div className="ws-journal-browser-heading"><h2>Your entries</h2></div>
        <label className="ws-search-field"><Search size={17} /><input type="search" aria-label="Search journal" placeholder="Find an entry" value={query} onChange={event => setQuery(event.target.value)} /></label>
        {entries.length ? <PageList pages={entries} onOpen={onOpen} gallery={false} /> : <div className="ws-journal-empty"><BookOpen size={30} /><h3>{query ? "No matching entries" : "Your story starts here"}</h3><p>{query ? "Try a different word." : "Write today. Your moments will collect here."}</p></div>}
      </div>
    </div>
  </section>;
}

function JournalOverview({ pages, onOpen, onWrite }: {
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
  const today = pages.find((page) => page.date === localDate());
  return (
    <div className="ws-journal-overview">
      <div className="ws-journal-invitation">
        <div className="ws-journal-today-label"><span className="ws-journal-today-date">{new Date().getDate()}</span><span><strong>Today</strong><time>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</time></span></div>
        <h2>{today ? "Pick up where you left off." : "A little time for yourself."}</h2>
        <p className="ws-journal-invitation-copy">{today ? "Your words are waiting for you." : "Start with whatever is on your mind."}</p>
        <Pressable className="ws-button primary" onClick={() => today ? onOpen(today.id) : onWrite()}>
          <PenLine size={18} />{today ? "Continue writing" : "Write today"}
        </Pressable>
      </div>
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
      <details className="ws-journal-history">
        <summary>{streak ? `${streak} ${streak === 1 ? "day" : "days"} of writing` : "Writing history"}<span>Last 12 weeks</span></summary>
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

function Capture({
  onCreate,
}: {
  onCreate: (type: PageType, title: string) => Promise<void>;
}) {
  const [type, setType] = useState<PageType>("note");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        void onCreate(type, title.trim()).finally(() => setBusy(false));
      }}
    >
      <div className="ws-segment" aria-label="Capture type">
        {(["note", "page", "journal"] as const).map((value) => (
          <Pressable
            key={value}
            className={type === value ? "selected" : ""}
            aria-pressed={type === value}
            onClick={() => setType(value)}
          >
            {value === "note" ? "Note" : value === "page" ? "Page" : "Journal"}
          </Pressable>
        ))}
      </div>
      <label className="ws-field-label">
        {type === "journal" ? "A title, if you like" : "What is on your mind?"}
        <input
          className="ws-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={
            type === "journal" ? "Today…" : "A thought worth keeping…"
          }
        />
      </label>
      <p className="ws-muted">
        Start with a title. Add details in the editor. Saved on this device.
      </p>
      <Pressable type="submit" className="ws-button ws-filled" disabled={busy}>
        {busy ? "Creating…" : "Create and write"}
        <ChevronRight size={16} />
      </Pressable>
    </form>
  );
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
          placeholder="Search pages, notes, journal, and events"
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
          <option value="row">Database rows</option>
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
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [title, setTitle] = useState(page.title);
  const [titleState, setTitleState] = useState("Saved");
  const titleInput = useRef<HTMLInputElement>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTitle = useRef<string | null>(null);
  const titleFlight = useRef<Promise<void>>(Promise.resolve());
  const lastText = useRef("");
  useEffect(() => {
    if (pendingTitle.current === null) {
      setTitle(page.title);
      setTitleState("Saved");
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
        if (pendingTitle.current === null) setTitleState("Saved");
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
    setTitleState("Saving…");
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      void persistTitle().catch((cause) => onError(String(cause)));
    }, 300);
  };
  const ancestors: Page[] = [];
  let parent = page.parentId;
  const visited = new Set<string>();
  while (parent && !visited.has(parent)) {
    visited.add(parent);
    const item = pages.find((candidate) => candidate.id === parent);
    if (!item) break;
    ancestors.unshift(item);
    parent = item.parentId;
  }
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
      {ancestors.length > 0 && (
        <nav className="ws-ancestors" aria-label="Page breadcrumbs">
          {ancestors.map((item) => (
            <span key={item.id}>
              <Pressable onClick={() => onOpen(item.id)}>
                {titleOf(item)}
              </Pressable>
              <ChevronRight size={14} />
            </span>
          ))}
        </nav>
      )}
      <div className="ws-page-detail-toolbar">
        <span className="ws-save-state" role="status">
          <Check size={13} />
          {titleState}
        </span>
        <div>
          <Pressable
            className="ws-icon"
            aria-label={
              page.favorite ? "Remove from favorites" : "Add to favorites"
            }
            aria-pressed={page.favorite}
            onClick={() => void onPatch({ favorite: !page.favorite })}
          >
            <Star size={18} fill={page.favorite ? "currentColor" : "none"} />
          </Pressable>
          <Pressable
            className="ws-icon"
            aria-label="Page options"
            onClick={() => setMenuOpen(true)}
          >
            <MoreHorizontal size={20} />
          </Pressable>
        </div>
      </div>
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
          placeholder={page.type === "journal" ? "Title, if you like" : "Untitled"}
          readOnly={Boolean(page.properties.__locked)}
          onChange={(event) => saveTitle(event.target.value)}
          onBlur={() => {
            void persistTitle().catch((cause) => onError(String(cause)));
          }}
        />
      </div>
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
      {page.type === "database" ? (
        definition ? (
          <DatabaseEditor
            definition={definition}
            pages={pages}
            databases={databases}
            onOpen={onOpen}
            onError={onError}
          />
        ) : (
          <p className="ws-muted">Preparing database…</p>
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
      {page.type !== "database" && (page.type === "page" || pages.some((child) => child.parentId === page.id) || backlinks.length > 0) && (
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
      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Page options">
        <div className="ws-page-menu">
          <Pressable className="ws-menu-row" onClick={() => void onPatch({ favorite: !page.favorite })}>
            <Star size={18} />{page.favorite ? "Remove from favorites" : "Add to favorites"}
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
                  : "Saved as a template",
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
        <small>File names only. Add actual files in the row editor.</small>
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
  onOpen,
  onError,
}: {
  definition: DatabaseDefinition;
  pages: Page[];
  databases: DatabaseDefinition[];
  onOpen: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [viewId, setViewId] = useState(definition.views[0]?.id ?? "");
  const [configOpen, setConfigOpen] = useState(false);
  const [propertyOpen, setPropertyOpen] = useState(false);
  const [newPropertyName, setNewPropertyName] = useState("");
  const [newPropertyType, setNewPropertyType] =
    useState<PropertyDefinition["type"]>("text");
  const [newPropertyOptions, setNewPropertyOptions] = useState("");
  const [relationDatabase, setRelationDatabase] = useState("");
  const [rollupProperty, setRollupProperty] = useState("");
  const view = definition.views.find((item) => item.id === viewId) ??
    definition.views[0] ?? {
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
      views: definition.views.map((item) =>
        item.id === view.id ? { ...item, ...patch } : item,
      ),
    });
  const addRow = async (properties: Record<string, PropertyValue> = {}) => {
    try {
      const row = await store.createPage("row", "", {
        databaseId: definition.id,
        parentId: definition.id,
        properties,
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
    definition.properties.find((property) => property.id === view.groupBy) ??
    definition.properties.find(
      (property) => property.type === "status" || property.type === "select",
    );
  const groups = [
    ...new Set([
      ...(grouping?.options ?? []),
      ...rows.map((row) =>
        String(row.properties[grouping?.id ?? ""] ?? "No group"),
      ),
    ]),
  ];
  if (!groups.length) groups.push("No group");
  const dateProperty = definition.properties.find(
    (property) => property.type === "date",
  );
  return (
    <div className="ws-database">
      <div className="ws-database-toolbar">
        <div
          className="ws-view-tabs"
          role="tablist"
          aria-label="Database views"
        >
          {definition.views.map((item) => {
            const Icon = viewIcons[item.type];
            return (
              <Pressable
                key={item.id}
                role="tab"
                aria-selected={view.id === item.id}
                className={view.id === item.id ? "selected" : ""}
                onClick={() => setViewId(item.id)}
              >
                <Icon size={16} />
                {item.name}
              </Pressable>
            );
          })}
        </div>
        <div className="ws-database-actions">
          <Pressable className="ws-button" onClick={() => setConfigOpen(true)}>
            Filter & sort
            {view.filter || view.sort?.length ? (
              <span className="ws-status-dot" />
            ) : null}
          </Pressable>
          <Pressable
            className="ws-button"
            onClick={() => setPropertyOpen(true)}
          >
            <Plus size={14} />
            Property
          </Pressable>
          <Pressable
            className="ws-button ws-tinted"
            onClick={() => void addRow()}
          >
            <Plus size={16} />
            New row
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
                {definition.properties.map((property) => (
                  <th key={property.id} scope="col">
                    {property.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {definition.properties.map((property) => (
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
          {rows.map((row) => (
            <PageButton key={row.id} page={row} onOpen={onOpen} />
          ))}
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
                Add item
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
              <span>{row.tags.join(" · ") || "Open to add details"}</span>
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
  const [storage, setStorage] = useState<StorageEstimate | null>(null);
  const [persistent, setPersistent] = useState<boolean | null>(null);
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
  useEffect(() => {
    void navigator.storage?.estimate?.().then(setStorage);
    void navigator.storage?.persisted?.().then(setPersistent);
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
  const bytes = (value = 0) => `${(value / 1024 / 1024).toFixed(1)} MB`;
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
        <h3>Account and sync</h3>
        <p>Your data is stored on this device. Cloud sync is optional.</p>
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
        <h3>Storage on this device</h3>
        <p>
          {storage
            ? `${bytes(storage.usage)} used of ${bytes(storage.quota)} available to this browser.`
            : "Storage information is unavailable in this browser."}
        </p>
        {storage?.quota ? (
          <progress
            value={storage.usage ?? 0}
            max={storage.quota}
            aria-label="Local storage usage"
          />
        ) : null}
        <p className="ws-muted">
          {persistent
            ? "Persistent storage is enabled."
            : "The browser may clear local data. Keep exports, or connect cloud sync."}
        </p>
        <Pressable
          className="ws-button ws-tinted"
          onClick={() =>
            void platform.persistStorage().then((value) => {
              setPersistent(value);
              onNotify(
                value
                  ? "Persistent storage enabled"
                  : "Your browser decides whether to keep storage. Export regularly.",
              );
            })
          }
        >
          Keep this workspace on device
        </Pressable>
      </section>
      <section>
        <h3>Import and export</h3>
        <p>
          Export the complete workspace, including document snapshots. Encrypted
          entries remain encrypted.
        </p>
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
        <ImportExportSettings onNotify={onNotify} onError={onError} />
      </section>
      <section>
        <h3>Notifications</h3>
        <p>
          In-app reminders appear while Kimpor Workspace is open. Background reminders
          require an installed web app and configured cloud notifications.
        </p>
        <div className="ws-settings-actions">
          <Pressable
            className="ws-button"
            onClick={() =>
              void enablePush()
                .then(onNotify)
                .catch((cause) => onError(String(cause)))
            }
          >
            Enable notifications
          </Pressable>
          <Pressable
            className="ws-button"
            onClick={() =>
              void disablePush()
                .then(() => onNotify("Background notifications disabled."))
                .catch((cause) => onError(String(cause)))
            }
          >
            Disable background notifications
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
            Quick capture<kbd>Ctrl / ⌘ Shift N</kbd>
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
      <section>
        <h3>Language and region</h3>
        <p>
          Dates and times follow your device locale ({navigator.language}).
          Mixed English, Khmer, and Chinese text is supported.
        </p>
        <p className="ws-muted">
          Time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </p>
      </section>
      <section>
        <h3>Diagnostics</h3>
        <p>
          Connection: {navigator.onLine ? "Online" : "Offline"}. Local IndexedDB
          is the source of truth.
        </p>
        <a href={`${import.meta.env.BASE_URL}design`}>
          Open the design gallery
        </a>
      </section>
      <section>
        <h3 className="ws-danger">Delete local data</h3>
        <p>
          Export first. This removes the workspace from this device. Connected
          cloud data is managed separately in your account.
        </p>
        <Pressable
          className="ws-button ws-danger"
          onClick={() => {
            if (
              window.prompt(
                "Type DELETE to remove all local data on this device.",
              ) !== "DELETE"
            )
              return;
            void store
              .clearAll()
              .then(() => onNotify("Local workspace cleared"))
              .catch((cause) => onError(String(cause)));
          }}
        >
          <Trash2 size={16} />
          Delete data on this device
        </Pressable>
      </section>
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
