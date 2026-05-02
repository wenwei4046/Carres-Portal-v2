import { useEffect, useRef } from "react";

interface Props {
  /** PNG dataURL of the captured signature, or null when blank. */
  value: string | null;
  /** Fires with a fresh PNG dataURL after each stroke. Null on Clear. */
  onChange: (dataUrl: string | null) => void;
}

/**
 * Touch / mouse / pen signature canvas. Mirrors proto/new-order-step3.jsx
 * SignaturePad — 800×180 internal, scales to container width via CSS, a 2.4px
 * round-cap stroke in `--foreground`. Restores from `value` on mount so the
 * signed image persists across step nav and refresh.
 *
 * Coordinates are scaled from CSS pixels to canvas pixels so signatures stay
 * crisp on devicePixelRatio > 1 displays.
 */
export default function SignaturePad({ value, onChange }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  // Restore an existing signature dataURL onto the canvas on first mount.
  useEffect(() => {
    if (!value || !value.startsWith("data:") || !ref.current) return;
    const canvas = ref.current;
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = value;
    // Restore once on mount; subsequent changes come from user strokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pointFromEvent(e: PointerEvent | MouseEvent | TouchEvent) {
    const canvas = ref.current!;
    const rect = canvas.getBoundingClientRect();
    let clientX: number;
    let clientY: number;
    if ("touches" in e && e.touches.length > 0) {
      clientX = e.touches[0]!.clientX;
      clientY = e.touches[0]!.clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }
    return {
      x: ((clientX - rect.left) * canvas.width) / rect.width,
      y: ((clientY - rect.top) * canvas.height) / rect.height,
    };
  }

  function start(e: React.PointerEvent | React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawing.current = true;
    last.current = pointFromEvent(e.nativeEvent);
  }

  function move(e: React.PointerEvent | React.MouseEvent | React.TouchEvent) {
    if (!drawing.current || !ref.current) return;
    e.preventDefault();
    const ctx = ref.current.getContext("2d");
    if (!ctx) return;
    const p = pointFromEvent(e.nativeEvent);
    ctx.strokeStyle = "#221F20";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }

  function end() {
    if (!drawing.current || !ref.current) return;
    drawing.current = false;
    onChange(ref.current.toDataURL("image/png"));
  }

  function clear() {
    if (!ref.current) return;
    const ctx = ref.current.getContext("2d");
    ctx?.clearRect(0, 0, ref.current.width, ref.current.height);
    onChange(null);
  }

  const signed = !!value;

  return (
    <div>
      <div
        className={`relative rounded-md overflow-hidden bg-card border-2 ${
          signed ? "border-emerald-500" : "border-border"
        }`}
      >
        <canvas
          ref={ref}
          width={800}
          height={180}
          className="block w-full h-[180px] cursor-crosshair touch-none"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
          aria-label="Customer signature pad"
        />
        {!signed && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none text-muted-foreground/70 text-sm">
            ✎ Sign here
          </div>
        )}
        {signed && (
          <div className="absolute top-2 left-3 text-[10px] font-semibold tracking-[0.1em] uppercase text-emerald-600">
            ✓ Signed
          </div>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          By signing, customer agrees to the terms below.
        </span>
        <button
          type="button"
          onClick={clear}
          className="text-[11px] px-2.5 py-1 rounded text-muted-foreground hover:text-foreground"
        >
          ↻ Clear
        </button>
      </div>
    </div>
  );
}
