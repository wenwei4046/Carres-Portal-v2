/** Read-only evidence, Purchasing MASTER §9.5. URLs come from the owning reader. */
import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import Button from "./Button";

export interface SavedEvidenceFile {
  id: string;
  kind: "photo" | "video";
  url: string | null;
  /** Recorded source and event, never inferred from the current operator. */
  context: string;
  unitCodes?: readonly string[];
}

export default function SavedEvidenceViewer({ files, activeId, onClose, onRetry }: {
  files: readonly SavedEvidenceFile[];
  activeId: string | null;
  onClose: () => void;
  /** Refresh through the owning authorised reader, not a new storage door. */
  onRetry: (id: string) => Promise<string | null>;
}) {
  const [selected, setSelected] = useState(activeId);
  useEffect(() => setSelected(activeId), [activeId]);
  const index = files.findIndex((file) => file.id === selected);
  const file = files[index];
  const open = activeId !== null && Boolean(file);
  const label = file ? `${file.kind === "photo" ? "Photo" : "Video"} ${index + 1}` : "Evidence";
  return <Modal open={open} onOpenChange={(next) => { if (!next) onClose(); }}
    width="viewer" title={label} description={file?.context}
    footer={<>
      <Button disabled={index <= 0} onClick={() => setSelected(files[index - 1].id)}>Previous</Button>
      <Button disabled={index < 0 || index >= files.length - 1} onClick={() => setSelected(files[index + 1].id)}>Next</Button>
    </>}>
    {file && <EvidenceMedia key={`${file.id}:${file.url}`} file={file} label={label} onRetry={onRetry} />}
  </Modal>;
}

function EvidenceMedia({ file, label, onRetry }: {
  file: SavedEvidenceFile; label: string; onRetry: (id: string) => Promise<string | null>;
}) {
  const [src, setSrc] = useState(file.url);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(file.url ? "loading" : "error");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const media = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let wasFullscreen = false;
    let focusFrame = 0;
    const changed = () => {
      const isFullscreen = document.fullscreenElement === video.current && video.current !== null;
      // Native fullscreen controls can retain Escape after exiting. Return focus
      // to the viewer so the next Escape belongs to Modal again.
      if (wasFullscreen && !document.fullscreenElement) {
        focusFrame = requestAnimationFrame(() => media.current?.focus());
      }
      wasFullscreen = isFullscreen;
    };
    document.addEventListener("fullscreenchange", changed);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("fullscreenchange", changed);
    };
  }, []);
  const pane = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  async function retry() {
    setStatus("loading");
    setSrc(null);
    reset();
    try {
      const url = await onRetry(file.id);
      if (!alive.current) return;
      setSrc(url);
      setAttempt((n) => n + 1);
      setStatus(url ? "loading" : "error");
    } catch { if (alive.current) setStatus("error"); }
  }
  return <div ref={media} tabIndex={-1} className="flex min-w-0 flex-col gap-3 focus:outline-none" data-kit="saved-evidence-viewer">
    {file.unitCodes?.length ? <div className="break-words font-mono text-body text-kit-slate-12">{file.unitCodes.join(" · ")}</div> : null}
    {file.kind === "photo" && <div className="flex flex-wrap gap-2">
      <Button disabled={status !== "ready" || zoom <= 1} onClick={() => { setZoom((n) => Math.max(1, n - 0.5)); setPan({ x: 0, y: 0 }); }}>Zoom out</Button>
      <Button disabled={status !== "ready" || zoom >= 4} onClick={() => setZoom((n) => Math.min(4, n + 0.5))}>Zoom in</Button>
      <Button disabled={zoom === 1} onClick={reset}>Reset</Button>
    </div>}
    {status === "loading" && <p role="status" className="text-body text-kit-slate-11">Loading…</p>}
    {status === "error" && <div role="alert" className="flex flex-wrap items-center gap-2 text-body text-kit-slate-12">
      <span>{file.kind === "photo" ? `${label} could not be loaded` : "Evidence could not be loaded"}</span>
      <Button onClick={() => void retry()}>Try again</Button>
    </div>}
    {src && status !== "error" && (file.kind === "video" ?
      <video ref={video} key={attempt} src={src} controls playsInline preload="metadata" aria-label={label}
        className="h-80 w-full bg-kit-slate-3 object-contain"
        onLoadedMetadata={() => setStatus("ready")} onError={() => setStatus("error")} /> :
      <div ref={pane} className="relative h-80 w-full overflow-hidden bg-kit-slate-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9" aria-busy={status === "loading"}
        role="region" aria-label={label} tabIndex={zoom > 1 ? 0 : -1}
        style={{ touchAction: zoom > 1 ? "none" : "auto", cursor: zoom > 1 ? "grab" : "auto" }}
        onKeyDown={(event) => {
          if (zoom <= 1 || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          const maxX = bounds.width * (zoom - 1) / 2;
          const maxY = bounds.height * (zoom - 1) / 2;
          const dx = event.key === "ArrowLeft" ? 32 : event.key === "ArrowRight" ? -32 : 0;
          const dy = event.key === "ArrowUp" ? 32 : event.key === "ArrowDown" ? -32 : 0;
          setPan((point) => ({ x: Math.max(-maxX, Math.min(maxX, point.x + dx)),
            y: Math.max(-maxY, Math.min(maxY, point.y + dy)) }));
        }}
        onPointerDown={(event) => {
          if (zoom <= 1 || status !== "ready") return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, startX: pan.x, startY: pan.y };
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const maxX = bounds.width * (zoom - 1) / 2;
          const maxY = bounds.height * (zoom - 1) / 2;
          setPan({ x: Math.max(-maxX, Math.min(maxX, start.startX + event.clientX - start.x)),
            y: Math.max(-maxY, Math.min(maxY, start.startY + event.clientY - start.y)) });
        }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <img key={attempt} src={src} alt={label} draggable={false}
          className="h-full w-full select-none object-contain"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          onLoad={() => setStatus("ready")} onError={() => setStatus("error")} />
      </div>)}
  </div>;
}
