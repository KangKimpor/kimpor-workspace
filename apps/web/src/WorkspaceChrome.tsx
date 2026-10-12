import { useEffect, useRef, useState, type RefObject } from "react";
import { Pressable } from "@veloradesk/ui";

export function useWorkspaceSize() {
  const [size, setSize] = useState(() => ({ width: document.getElementById("root")?.clientWidth ?? innerWidth, height: innerHeight }));
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  return { ...size, phone: size.width < 600, tablet: size.width >= 600 && size.width < 1024, desktop: size.width >= 1024 };
}

export function useKeyboardViewport() {
  useEffect(() => {
    const root = document.getElementById("root");
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      frame = 0;
      const height = viewport?.height ?? innerHeight;
      const top = viewport?.offsetTop ?? 0;
      const inset = Math.max(0, innerHeight - height - top);
      root?.style.setProperty("--keyboard-inset", `${inset}px`);
      root?.style.setProperty("--visual-height", `${height}px`);
      root?.style.setProperty("--visual-top", `${top}px`);
      if (root) root.dataset.keyboard = String(inset > 100);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update(); viewport?.addEventListener("resize", schedule); viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(frame); viewport?.removeEventListener("resize", schedule); viewport?.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
  }, []);
}

export function SheetHandle({ content, open }: {
  content: RefObject<HTMLDivElement | null>; open: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const drag = useRef<{ y: number; height: number; offset: number } | null>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!open) { content.current?.style.removeProperty("--ws-sheet-height"); return; }
    const frame = requestAnimationFrame(() => setExpanded((content.current?.getBoundingClientRect().height ?? 0) >= innerHeight * .7));
    return () => cancelAnimationFrame(frame);
  }, [content, open]);
  const resize = (large: boolean) => {
    const element = content.current;
    if (element) {
      const before = element.getBoundingClientRect().top;
      element.style.removeProperty("translate");
      element.style.setProperty("--ws-sheet-height", large ? "92dvh" : "56dvh");
      const offset = before - element.getBoundingClientRect().top;
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches && document.documentElement.dataset.reduceMotion !== "true") element.animate(
        [{ translate: `0 ${offset}px` }, { translate: "0 -4px", offset: .8 }, { translate: "0 0" }],
        { duration: 250, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
    }
    setExpanded(large);
  };
  return <Pressable className="ws-sheet-handle" aria-label="Resize sheet" aria-expanded={expanded}
    title="Drag or tap to resize"
    onClick={() => {
      if (moved.current) { moved.current = false; return; }
      resize((content.current?.getBoundingClientRect().height ?? 0) < innerHeight * .7);
    }}
    onKeyDown={event => {
      if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        event.preventDefault(); resize(event.key === "ArrowUp" || event.key === "End");
      }
    }}
    onPointerDown={event => {
      if (!event.isPrimary) return;
      drag.current = { y: event.clientY, height: content.current?.getBoundingClientRect().height ?? 0, offset: 0 };
      moved.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      if (!drag.current) return;
      const offset = drag.current.y - event.clientY;
      if (Math.abs(offset) > 8) moved.current = true;
      drag.current.offset = offset;
      content.current?.style.setProperty("translate", `0 ${Math.max(-innerHeight * .36, Math.min(innerHeight * .21, -offset))}px`);
    }}
    onPointerUp={event => {
      if (!drag.current) return;
      if (moved.current) resize(drag.current.height + drag.current.offset >= innerHeight * .7);
      else content.current?.style.removeProperty("translate");
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { drag.current = null; moved.current = false; content.current?.style.removeProperty("translate"); }}>
    <span aria-hidden="true" />
  </Pressable>;
}

export function EdgeBack({ main, onBack }: {
  main: RefObject<HTMLElement | null>; onBack: () => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const reset = () => {
    start.current = null;
    main.current?.style.setProperty("--ws-back-drag", "0px");
    if (main.current) delete main.current.dataset.backDragging;
  };
  return <div className="ws-edge-back" aria-hidden="true"
    onPointerDown={event => {
      if ((document.getElementById("root")?.clientWidth ?? innerWidth) >= 600 || event.pointerType !== "touch" || !event.isPrimary) return;
      start.current = { x: event.clientX, y: event.clientY };
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic pointer events have no active capture. */ }
    }}
    onPointerMove={event => {
      if (!start.current) return;
      const x = event.clientX - start.current.x, y = event.clientY - start.current.y;
      if (Math.abs(y) > 24 && Math.abs(y) > Math.abs(x)) { reset(); return; }
      if (x < 10) return;
      if (main.current) main.current.dataset.backDragging = "true";
      main.current?.style.setProperty("--ws-back-drag", `${Math.min(Math.max(0, x), (document.getElementById("root")?.clientWidth ?? innerWidth) * .6)}px`);
    }}
    onPointerUp={event => {
      const go = start.current && event.clientX - start.current.x >= Math.max(72, (document.getElementById("root")?.clientWidth ?? innerWidth) * .25);
      reset();
      if (go) onBack();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={reset} />;
}

export function useCollapsingTitle(main: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      main.current?.style.setProperty("--ws-title-progress", String(Math.max(0, 1 - (main.current?.scrollTop ?? scrollY) / 96)));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    const element = main.current;
    element?.addEventListener("scroll", schedule, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); element?.removeEventListener("scroll", schedule); };
  }, [main]);
}
