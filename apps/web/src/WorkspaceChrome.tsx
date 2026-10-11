import { useEffect, useRef, useState, type RefObject } from "react";
import { Pressable } from "@veloradesk/ui";

export function SheetHandle({ content, open }: {
  content: RefObject<HTMLDivElement | null>; open: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!open) { content.current?.style.removeProperty("--ws-sheet-height"); return; }
    const frame = requestAnimationFrame(() => setExpanded((content.current?.getBoundingClientRect().height ?? 0) >= innerHeight * .7));
    return () => cancelAnimationFrame(frame);
  }, [content, open]);
  const resize = (large: boolean) => {
    content.current?.style.setProperty("--ws-sheet-height", large ? "92dvh" : "56dvh");
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
      drag.current = { y: event.clientY, height: content.current?.getBoundingClientRect().height ?? 0 };
      moved.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      if (!drag.current) return;
      const offset = drag.current.y - event.clientY;
      if (Math.abs(offset) > 8) moved.current = true;
      const height = Math.min(innerHeight * .92, Math.max(innerHeight * .35, drag.current.height + offset));
      content.current?.style.setProperty("--ws-sheet-height", `${height}px`);
    }}
    onPointerUp={event => {
      if (!drag.current) return;
      if (moved.current) resize((content.current?.getBoundingClientRect().height ?? 0) >= innerHeight * .7);
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { drag.current = null; moved.current = false; }}>
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
      if (innerWidth >= 600 || event.pointerType !== "touch" || !event.isPrimary) return;
      start.current = { x: event.clientX, y: event.clientY };
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic pointer events have no active capture. */ }
    }}
    onPointerMove={event => {
      if (!start.current) return;
      const x = event.clientX - start.current.x, y = event.clientY - start.current.y;
      if (Math.abs(y) > 24 && Math.abs(y) > Math.abs(x)) { reset(); return; }
      if (x < 10) return;
      if (main.current) main.current.dataset.backDragging = "true";
      main.current?.style.setProperty("--ws-back-drag", `${Math.min(Math.max(0, x), innerWidth * .6)}px`);
    }}
    onPointerUp={event => {
      const go = start.current && event.clientX - start.current.x >= Math.max(72, innerWidth * .25);
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
      main.current?.style.setProperty("--ws-title-progress", String(Math.max(0, 1 - scrollY / 96)));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); };
  }, [main]);
}
