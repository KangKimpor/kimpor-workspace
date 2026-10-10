import { useEffect, useRef, useState, type PointerEvent } from "react";
import { getStroke } from "perfect-freehand";
import * as Y from "yjs";
import { Download, Eraser, Undo2 } from "lucide-react";
import { Pressable } from "@veloradesk/ui";
type Point = [number, number, number];
interface Stroke {
  id: string;
  points: Point[];
  pressure: boolean;
  size: number;
}
function path(stroke: Stroke): string {
  const outline = getStroke(stroke.points, {
    size: stroke.size,
    thinning: 0.6,
    smoothing: 0.65,
    streamline: 0.4,
    simulatePressure: !stroke.pressure,
  });
  if (!outline.length) return "";
  return `M ${outline.map((point) => `${point[0]},${point[1]}`).join(" L ")} Z`;
}
/** Drawing updates live in the same Yjs document, including when that document is encrypted. */
export default function SketchCanvas({ doc }: { doc: Y.Doc }) {
  const drawing = doc.getArray<Stroke>("sketch");
  const [strokes, setStrokes] = useState(() => drawing.toArray()),
    [draft, setDraft] = useState<Stroke | null>(null),
    [size, setSize] = useState(5);
  const svg = useRef<SVGSVGElement>(null),
    current = useRef<Stroke | null>(null);
  useEffect(() => {
    const update = () => setStrokes(drawing.toArray());
    drawing.observe(update);
    return () => drawing.unobserve(update);
  }, [drawing]);
  function point(event: PointerEvent<SVGSVGElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) * 720) / rect.width,
      ((event.clientY - rect.top) * 360) / rect.height,
      event.pressure || 0.5,
    ];
  }
  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    current.current = {
      id: crypto.randomUUID(),
      points: [point(event)],
      pressure:
        event.pointerType === "pen" &&
        event.pressure > 0 &&
        event.pressure !== 0.5,
      size,
    };
    setDraft({ ...current.current });
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const stroke = current.current;
    if (!stroke || !event.currentTarget.hasPointerCapture(event.pointerId))
      return;
    event.preventDefault();
    stroke.points.push(point(event));
    if (
      event.pointerType === "pen" &&
      event.pressure > 0 &&
      event.pressure !== 0.5
    )
      stroke.pressure = true;
    setDraft({ ...stroke });
  }
  function finish(event: PointerEvent<SVGSVGElement>) {
    if (!current.current) return;
    drawing.push([{ ...current.current, points: [...current.current.points] }]);
    current.current = null;
    setDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function download() {
    if (!svg.current) return;
    const copy = svg.current.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("style", `color:${getComputedStyle(svg.current).color}`);
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(copy)], {
        type: "image/svg+xml",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "veloradesk-sketch.svg";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  return (
    <section className="sketch-panel" aria-label="Sketch">
      <div className="rich-toolbar">
        <label className="sketch-size">
          Pen width{" "}
          <input
            type="range"
            aria-label="Pen width"
            min="2"
            max="16"
            value={size}
            onChange={(event) => setSize(Number(event.target.value))}
          />
        </label>
        <Pressable
          className="icon-button"
          aria-label="Undo last stroke"
          disabled={!strokes.length}
          onClick={() => drawing.delete(drawing.length - 1, 1)}
        >
          <Undo2 size={18} />
        </Pressable>
        <Pressable
          className="icon-button"
          aria-label="Clear drawing"
          disabled={!strokes.length}
          onClick={() => drawing.delete(0, drawing.length)}
        >
          <Eraser size={18} />
        </Pressable>
        <Pressable
          className="icon-button"
          aria-label="Export sketch"
          onClick={download}
        >
          <Download size={18} />
        </Pressable>
      </div>
      <svg
        ref={svg}
        viewBox="0 0 720 360"
        className="sketch-canvas"
        role="img"
        aria-label="Drawing surface. Draw with a pen, finger or mouse."
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        {[...strokes, ...(draft ? [draft] : [])].map((stroke) => (
          <path key={stroke.id} d={path(stroke)} fill="currentColor" />
        ))}
      </svg>
      <p className="rich-hint">
        Pen pressure adjusts the stroke when available. Other pointers use a
        speed-based width. Drawing saves with this document.
      </p>
    </section>
  );
}
