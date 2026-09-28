/**
 * QuietRouteRow — a route stop with no work now, folded to one line
 * (Workspace MASTER §5.10 BUILD SHEET, kit admission Jess 2026-09-28 "kit ok").
 *
 * One 48px line: stop label · status sentence · `{n} of {m} done` · chevron,
 * white with a 1px `slate-5` line, the kit card radius (the same edge as the
 * `Block` cards beside it), padding 8/16. Its outline takes
 * the state colour when it holds an act (red missed · amber due). Pressing it
 * opens the stop's cards; the page owns the open state.
 */
import Icon from "./Icon";

export interface QuietRouteRowProps {
  label: string;
  status: string;
  /** `{n} of {m} done`, or nothing when the stop has no steps to count. */
  progress?: string | null;
  tone?: "missed" | "due" | "none";
  open: boolean;
  onToggle: () => void;
  /** Below 1100px the status wraps onto its own line instead of being cut. */
  wrap?: boolean;
  "data-testid"?: string;
}

const EDGE = {
  missed: "border-kit-red-9",
  due: "border-kit-amber-6",
  none: "border-kit-slate-5",
} as const;

export default function QuietRouteRow({ label, status, progress, tone = "none", open, onToggle, wrap = false, "data-testid": testId }: QuietRouteRowProps) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      data-testid={testId}
      className={`flex min-h-12 w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 rounded-card border bg-white px-4 py-2 text-left hover:bg-kit-slate-2 ${EDGE[tone]}`}
    >
      <span className="shrink-0 text-label uppercase tracking-[0.06em] text-kit-slate-11">{label}</span>
      <span
        className={`min-w-0 text-body ${wrap ? "order-3 basis-full" : "flex-1 truncate"} ${tone === "missed" ? "text-kit-red-11" : tone === "due" ? "text-kit-amber-11" : "text-kit-slate-11"}`}
      >
        {status}
      </span>
      {progress ? <span className={`shrink-0 text-meta text-kit-slate-11 ${wrap ? "ml-auto" : ""}`}>{progress}</span> : null}
      <span aria-hidden className={`shrink-0 text-kit-slate-11 ${wrap && !progress ? "ml-auto" : ""}`}>
        <Icon name={open ? "collapse" : "forward"} size={14} />
      </span>
    </button>
  );
}
