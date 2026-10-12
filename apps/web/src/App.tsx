import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MotionConfig } from "motion/react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Command,
  Component,
  Feather,
  FlaskConical,
  Layers,
  LayoutGrid,
  Menu,
  Monitor,
  Moon,
  Palette,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  X,
} from "lucide-react";
import { BrandMark, Pressable } from "@veloradesk/ui";
import { platform } from "@veloradesk/core/platform";
const EditorSpike = lazy(() => import("./EditorSpike"));
type Theme = "system" | "light" | "dark";
const sections = [
  { id: "overview", title: "Overview", icon: LayoutGrid },
  { id: "appearance", title: "Appearance", icon: Palette },
  { id: "controls", title: "Controls", icon: SlidersHorizontal },
  { id: "patterns", title: "Patterns", icon: Layers },
];
function readSetting(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function saveSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Theme still works when storage is blocked. */
  }
}
function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <Pressable
      className="switch"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={onChange}
    >
      <span className="switch-track">
        <span className="switch-knob" />
      </span>
    </Pressable>
  );
}
function Logo() {
  return (
    <span className="logo" aria-hidden="true">
      <BrandMark />
    </span>
  );
}
function Sheet({
  open,
  onOpenChange,
  title,
  children,
  origin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  origin: React.RefObject<HTMLElement | null>;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (origin.current?.isConnected)
              origin.current.focus({ preventScroll: true });
          }}
        >
          <div className="sheet-grabber" />
          <div className="row between">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Pressable className="icon-button" aria-label="Close dialog">
                <X />
              </Pressable>
            </Dialog.Close>
          </div>
          <Dialog.Description className="muted">
            Make a little room for what matters.
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function App() {
  const lastOpener = useRef<HTMLElement | null>(null);
  const [theme, setTheme] = useState<Theme>(
    () => readSetting("velora-theme", "system") as Theme,
  );
  const [reduced, setReduced] = useState(
    () => readSetting("velora-reduce-motion", "false") === "true",
  );
  const [section, setSection] = useState("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [name, setName] = useState("A little space of my own");
  const [checked, setChecked] = useState(true);
  const [inspector, setInspector] = useState(false);
  const [route, setRoute] = useState(
    location.pathname.includes("/spikes/") ? "editor" : "design",
  );
  useEffect(() => {
    const onPop = () =>
      setRoute(location.pathname.includes("/spikes/") ? "editor" : "design");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
      void platform.applyTheme(resolved);
      saveSetting("velora-theme", theme);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reduced);
    saveSetting("velora-reduce-motion", String(reduced));
  }, [reduced]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        !e.isComposing &&
        e.keyCode !== 229 &&
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "k"
      ) {
        e.preventDefault();
        lastOpener.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        setPalette((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  function navigate(id: string) {
    setRoute("design");
    history.pushState(null, "", `${import.meta.env.BASE_URL}design`);
    setSection(id);
    setMobileNav(false);
    setTimeout(
      () => document.getElementById(id)?.scrollIntoView({ block: "start" }),
      0,
    );
  }
  function openSpike() {
    history.pushState(null, "", `${import.meta.env.BASE_URL}spikes/editor`);
    setRoute("editor");
    setMobileNav(false);
  }
  const nav = (
    <>
      <div className="brand">
        <Logo />
        <div>
          <strong>Kimpor Workspace</strong>
          <span className="caption muted">A space for your life</span>
        </div>
      </div>
      <div className="sidebar-caption">FOUNDATION</div>
      <nav aria-label="Foundation navigation">
        {sections.map((item) => (
          <Pressable
            key={item.id}
            className={`nav-item ${section === item.id && route === "design" ? "selected" : ""}`}
            aria-current={
              section === item.id && route === "design" ? "page" : undefined
            }
            onClick={() => navigate(item.id)}
          >
            <item.icon size={19} />
            {item.title}
            {item.id === "overview" && <span className="nav-dot" />}
          </Pressable>
        ))}
      </nav>
      <div className="sidebar-caption">LABORATORY</div>
      <Pressable
        className={`nav-item ${route === "editor" ? "selected" : ""}`}
        onClick={openSpike}
      >
        <FlaskConical size={19} />
        Editor study<span className="mini-label">01</span>
      </Pressable>
      <div className="sidebar-bottom">
        <div className="local-note">
          <ShieldCheck size={19} />
          <div>
            <strong>Yours, by design</strong>
            <p>Your workspace.</p>
          </div>
        </div>
        <Pressable className="nav-item" onClick={() => setSheet(true)}>
          <CircleHelp size={19} />
          About this preview
        </Pressable>
        <div className="version">
          <span className="status-dot" />
          Foundation preview <span>0.0.1</span>
        </div>
      </div>
    </>
  );
  return (
    <MotionConfig reducedMotion={reduced ? "always" : "user"}>
      <div
        className={`app ${inspector ? "show-grid" : ""}`}
        onClickCapture={(event) => {
          const target = event.target as HTMLElement;
          if (!target.closest(".dialog-content"))
            lastOpener.current = target.closest("button");
        }}
      >
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <aside className="sidebar">{nav}</aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="row">
              <Pressable
                className="icon-button mobile-menu"
                aria-label="Open navigation"
                onClick={() => setMobileNav(true)}
              >
                <Menu />
              </Pressable>
              <span className="breadcrumb">Foundation</span>
              <ChevronRight size={14} />
              <strong>
                {route === "editor" ? "Editor study" : "Design gallery"}
              </strong>
            </div>
            <div className="row">
              <Pressable
                className="icon-button"
                aria-label="Open command palette"
                onClick={() => setPalette(true)}
              >
                <Search size={19} />
              </Pressable>
            </div>
          </header>
          <main id="main" className="content">
            {route === "editor" ? (
              <Suspense
                fallback={
                  <div className="card skeleton" aria-label="Loading editor" />
                }
              >
                <EditorSpike />
              </Suspense>
            ) : (
              <>
                <section id="overview" className="intro">
                  <div className="eyebrow">
                    <span className="status-dot" />
                    THE BEGINNING OF SOMETHING PERSONAL
                  </div>
                  <h1>
                    A quieter place
                    <br />
                    for everything.
                  </h1>
                  <p>
                    Your days, thoughts and little discoveries.
                    <br className="desktop-break" /> One thoughtful foundation,
                    made to feel like home.
                  </p>
                </section>
                <div className="hero card">
                  <div className="hero-copy">
                    <span className="eyebrow">MEET YOUR WORKSPACE</span>
                    <h2>
                      Room to think.
                      <br />
                      Space to be you.
                    </h2>
                    <p>
                      Simple by intention. Personal by nature.
                      <br />
                      Take a look at the details coming together.
                    </p>
                    <Pressable
                      className="button filled"
                      onClick={() => navigate("controls")}
                    >
                      Explore the details <ArrowRight size={16} />
                    </Pressable>
                  </div>
                  <div className="hero-art" aria-hidden="true">
                    <div className="art-card art-back">
                      <span className="art-icon">
                        <BookOpen />
                      </span>
                      <div className="art-line" />
                      <div className="art-line short" />
                    </div>
                    <div className="art-card art-front">
                      <div className="art-title">
                        <span className="art-sun">
                          <Sun size={20} />
                        </span>
                        <span>A little clarity</span>
                      </div>
                      <div className="art-check">
                        <span>✓</span> Make room for a new idea
                      </div>
                      <div className="art-check">
                        <span>✓</span> Find your own rhythm
                      </div>
                      <div className="art-footer">
                        <span className="tiny-line" />
                        <Feather size={20} />
                      </div>
                    </div>
                    <span className="art-spark one">✦</span>
                    <span className="art-spark two">✧</span>
                  </div>
                </div>
                <section id="appearance" className="section">
                  <div className="section-heading">
                    <div>
                      <span className="section-number">01 / APPEARANCE</span>
                      <h2>Feels right, day or night.</h2>
                    </div>
                    <span className="muted caption">
                      The same calm, in every light
                    </span>
                  </div>
                  <div className="appearance-grid">
                    <div className="card appearance-card">
                      <div className="row between">
                        <span className="card-label">
                          <Palette size={18} />
                          Your surroundings
                        </span>
                        <span className="badge">LIVE PREVIEW</span>
                      </div>
                      <div
                        className="theme-options"
                        role="group"
                        aria-label="Appearance"
                      >
                        {(
                          [
                            { value: "light", title: "Light", icon: Sun },
                            { value: "dark", title: "Dark", icon: Moon },
                            { value: "system", title: "Auto", icon: Monitor },
                          ] as const
                        ).map((option) => (
                          <Pressable
                            className={`theme-option ${theme === option.value ? "chosen" : ""}`}
                            key={option.value}
                            aria-pressed={theme === option.value}
                            onClick={() => setTheme(option.value)}
                          >
                            <span className={`theme-mini ${option.value}`}>
                              <i />
                              <b />
                              <em />
                            </span>
                            <span>
                              <option.icon size={15} />
                              {option.title}
                              {theme === option.value && <Check size={14} />}
                            </span>
                          </Pressable>
                        ))}
                      </div>
                      <p className="caption muted">
                        System appearance
                      </p>
                    </div>
                    <div className="card detail-card">
                      <div className="row">
                        <span className="tile blue">
                          <Feather size={22} />
                        </span>
                        <div>
                          <h3>A softer kind of blue</h3>
                          <p className="muted">
                            A considered accent, with room to breathe.
                          </p>
                        </div>
                      </div>
                      <div
                        className="swatch-ramp"
                        role="img"
                        aria-label="Brand palette"
                      >
                        <span className="swatch seed" />
                        <span className="swatch accent" />
                        <span className="swatch tint" />
                        <span className="swatch paper" />
                      </div>
                      <div className="row between">
                        <span className="caption muted">
                          Denim-inspired · made for both themes
                        </span>
                        <span className="color-value">#265B9A</span>
                      </div>
                    </div>
                  </div>
                </section>
                <section id="controls" className="section">
                  <div className="section-heading">
                    <div>
                      <span className="section-number">
                        02 / LITTLE INTERACTIONS
                      </span>
                      <h2>Every detail answers back.</h2>
                    </div>
                    <Component size={21} className="muted" />
                  </div>
                  <div className="two-grid">
                    <div className="card controls-card">
                      <div className="card-label">A gentle nudge</div>
                      <p className="muted">
                        Clear actions. A satisfying little response.
                      </p>
                      <div className="button-demo">
                        <Pressable
                          className="button filled"
                          onClick={() =>
                            setToast("A fresh start. This is a button preview.")
                          }
                        >
                          <Plus size={17} />
                          New beginning
                        </Pressable>
                        <Pressable
                          className="button tinted"
                          onClick={() => setSheet(true)}
                        >
                          Take a closer look
                        </Pressable>
                      </div>
                      <div className="button-demo">
                        <Pressable
                          className="button plain"
                          onClick={() =>
                            setToast("You have all the time you need.")
                          }
                        >
                          Maybe later <ArrowRight size={16} />
                        </Pressable>
                        <Pressable className="button outline" disabled>
                          Unavailable
                        </Pressable>
                      </div>
                      <div className="control-divider" />
                      <div className="row between">
                        <div>
                          <strong>Less motion, same feeling</strong>
                          <p className="caption muted">
                            Keep things still when you prefer.
                          </p>
                        </div>
                        <Switch
                          label="Reduce motion"
                          checked={reduced}
                          onChange={() => setReduced(!reduced)}
                        />
                      </div>
                    </div>
                    <div className="card controls-card">
                      <div className="card-label">Make it your own</div>
                      <p className="muted">
                        A familiar feel, down to the smallest field.
                      </p>
                      <label className="field-label" htmlFor="workspace-name">
                        A name for your space
                      </label>
                      <input
                        id="workspace-name"
                        className="text-field"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onPointerDown={(e) =>
                          (e.currentTarget.dataset.pressed = "true")
                        }
                        onPointerUp={(e) =>
                          delete e.currentTarget.dataset.pressed
                        }
                        onPointerLeave={(e) =>
                          delete e.currentTarget.dataset.pressed
                        }
                      />
                      <div className="row check-row">
                        <Pressable
                          className="checkbox"
                          role="checkbox"
                          aria-checked={checked}
                          aria-label="Leave room for a little wonder"
                          onClick={() => setChecked(!checked)}
                        >
                          <span>{checked && <Check size={14} />}</span>
                        </Pressable>
                        <span className={checked ? "completed" : ""}>
                          Leave room for a little wonder
                        </span>
                      </div>
                      <div className="status-pills">
                        <span className="pill green">
                          <Check size={14} />A good moment
                        </span>
                        <span className="pill violet">
                          <Feather size={14} />
                          An idea to keep
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
                <section id="patterns" className="section">
                  <div className="section-heading">
                    <div>
                      <span className="section-number">
                        03 / THOUGHTFUL BY DEFAULT
                      </span>
                      <h2>Comfort in the familiar.</h2>
                    </div>
                  </div>
                  <div className="two-grid">
                    <div className="card list-card">
                      <Pressable
                        className="list-row"
                        onClick={() => setSheet(true)}
                      >
                        <span className="tile blue">
                          <ShieldCheck size={21} />
                        </span>
                        <span>
                          <strong>Your space stays yours</strong>
                          <small>Privacy built in</small>
                        </span>
                        <ChevronRight size={18} />
                      </Pressable>
                      <Pressable
                        className="list-row"
                        onClick={() => {
                          platform.download(
                            "kimpor-workspace-appearance.json",
                            JSON.stringify(
                              {
                                format: "veloradesk-appearance-preview",
                                version: 1,
                                theme,
                                reducedMotion: reduced,
                              },
                              null,
                              2,
                            ),
                          );
                          setToast("Appearance settings exported.");
                        }}
                      >
                        <span className="tile warm">
                          <ArrowDownToLine size={21} />
                        </span>
                        <span>
                          <strong>Take your preferences with you</strong>
                          <small>
                            Export this preview’s appearance settings
                          </small>
                        </span>
                        <ChevronRight size={18} />
                      </Pressable>
                      <Pressable className="list-row" onClick={openSpike}>
                        <span className="tile violet">
                          <FlaskConical size={21} />
                        </span>
                        <span>
                          <strong>Ideas in any language</strong>
                          <small>
                            Explore the English · ខ្មែរ · 中文 editor study
                          </small>
                        </span>
                        <ChevronRight size={18} />
                      </Pressable>
                    </div>
                    <div className="card quiet-card">
                      <div className="quiet-illustration" aria-hidden="true">
                        <Feather size={34} />
                        <span />
                      </div>
                      <h3>A little room for possibility.</h3>
                      <p>
                        Nothing to catch up on here.
                        <br />
                        Just a fresh start, whenever you’re ready.
                      </p>
                      <Pressable
                        className="button plain"
                        onClick={() =>
                          setToast("A small moment, just for you.")
                        }
                      >
                        Enjoy the quiet <ArrowRight size={16} />
                      </Pressable>
                    </div>
                  </div>
                </section>
                <footer>
                  <div className="row">
                    <Logo />
                    <span>
                      Thoughtfully taking shape.
                      <br />
                      <span className="caption muted">
                        Kimpor Workspace · Foundation preview
                      </span>
                    </span>
                  </div>
                  <Pressable
                    className="button plain"
                    aria-pressed={inspector}
                    onClick={() => setInspector(!inspector)}
                  >
                    <Settings2 size={16} />
                    {inspector ? "Hide layout grid" : "Layout grid"}
                  </Pressable>
                </footer>
              </>
            )}
          </main>
        </div>
        <Sheet
          origin={lastOpener}
          open={mobileNav}
          onOpenChange={setMobileNav}
          title="Your foundation"
        >
          <div className="mobile-nav-content">{nav}</div>
        </Sheet>
        <Sheet
          origin={lastOpener}
          open={sheet}
          onOpenChange={setSheet}
          title="Thoughtfully taking shape"
        >
          <div className="about-mark">
            <Logo />
          </div>
          <p>
            A space for your days, notes and ideas.
          </p>
          <p className="caption muted">
            The monogram comes from Kimpor’s handwritten signature. The full
            signature remains private.
          </p>
          <Dialog.Close asChild>
            <Pressable className="button filled full">
              Back to exploring
            </Pressable>
          </Dialog.Close>
        </Sheet>
        <Sheet
          origin={lastOpener}
          open={palette}
          onOpenChange={setPalette}
          title="Where would you like to go?"
        >
          <label className="sr-only" htmlFor="command-search">
            Search commands
          </label>
          <input
            autoFocus
            id="command-search"
            className="text-field"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the foundation…"
          />
          {[
            ...sections.map((s) => ({
              title: s.title,
              action: () => navigate(s.id),
            })),
            { title: "Editor study", action: openSpike },
          ]
            .filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
            .map((s) => (
              <Pressable
                className="list-row"
                key={s.title}
                onClick={() => {
                  s.action();
                  setPalette(false);
                  setQuery("");
                }}
              >
                <Command size={17} />
                {s.title}
                <ArrowRight size={16} />
              </Pressable>
            ))}
        </Sheet>
        <div className="announcements" role="status" aria-live="polite">
          {toast && (
            <div className="toast">
              <Check size={18} />
              {toast}
              <Pressable
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setToast("")}
              >
                <X size={16} />
              </Pressable>
            </div>
          )}

        </div>
      </div>
    </MotionConfig>
  );
}
