import { rememberPanelOpener } from "@/components/kit/Drawer";
/**
 * The list toolbar's small parts (v12 kit): the button that shows a hidden side
 * panel, the round icon button, and a filter chip. The toolbar is one 36px line
 * (Layout Standard §0) and every button on it is 32 high, centred (fix list
 * 14 Oct, point 6); these parts never wrap it.
 */
import { forwardRef, type ButtonHTMLAttributes } from "react";
import MIcon from "./MIcon";

/**
 * `▤ Summary` — brings a hidden side panel back. `compact` (a toolbar too short
 * for every word) keeps the icon only, its name on hover: the view button's
 * name is the one that stays (fix list 14 Oct, point 5).
 */
export function CShowPanelButton({ label, onShow, compact = false }: { label: string; onShow: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      data-panel-door={label}
      onClick={(event) => { if (label === "Summary" || label === "Tasks") rememberPanelOpener(label, event.currentTarget); onShow(); }}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-c-btn-border bg-white text-[13px] font-medium text-c-ink hover:bg-c-hover ${compact ? "w-8 justify-center" : "px-3"}`}
    >
      <MIcon name="left_panel_open" size={18} />
      {compact ? null : label}
    </button>
  );
}

/** A 32px round icon button on the toolbar: ⋮. Its name is its tooltip. */
export const CIconButton = forwardRef<
  HTMLButtonElement,
  { icon: string; label: string; pressed?: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">
>(function CIconButton({ icon, label, pressed = false, className, onClick, ...rest }, ref) {
  const panel = label === "Show filters" || label === "Show summary" || label === "Summary" ? "Summary" : label === "Tasks" ? "Tasks" : null;
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      data-panel-door={panel ? label : undefined}
      onClick={(event) => { if (panel) rememberPanelOpener(panel, event.currentTarget); onClick?.(event); }}
      {...rest}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-c-body hover:bg-c-hover ${pressed ? "bg-c-hover" : ""} ${className ?? ""}`}
    >
      <MIcon name={icon} size={20} />
    </button>
  );
});

/**
 * The view button (v12 Shell): a white word button, 32 high — the current view's
 * icon, its name, ▾ — grey while its menu is open. It keeps its name in every
 * state, Tasks open too (owner 14 Oct; fix list 14 Oct, point 5).
 */
export const CViewButton = forwardRef<
  HTMLButtonElement,
  { icon: string; name: string; open?: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">
>(function CViewButton({ icon, name, open = false, className, ...rest }, ref) {
  const label = `View: ${name}`;
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={`flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-c-btn-border pl-2.5 pr-2 text-[13px] font-medium text-c-ink hover:bg-c-btn-hover ${open ? "bg-c-btn-hover" : "bg-white"} ${className ?? ""}`}
    >
      <MIcon name={icon} size={18} className="text-c-secondary" />
      {name}
      <MIcon name="expand_more" size={18} className="text-c-secondary" />
    </button>
  );
});

/**
 * A filter chip, `Payment: Owes ×`; a click removes the filter. `compact` (a
 * toolbar too short for every word, after Summary has gone to its icon) keeps
 * the filter icon only, the chip's words on hover and as its name; a chip is
 * never cut by its box (owner 14 Oct 2026: no control may overlap or be cut).
 */
export function CChip({ children, onClear, compact = false, title }: { children: string; onClear: () => void; compact?: boolean; title?: string }) {
  return compact ? (
    <button
      type="button"
      onClick={onClear}
      aria-label={children}
      title={title ?? children}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-c-input-border bg-c-search-bg text-c-body hover:bg-c-hover"
    >
      <MIcon name="filter_alt_off" size={18} />
    </button>
  ) : (
    <button
      type="button"
      onClick={onClear}
      className="shrink-0 whitespace-nowrap rounded-lg border border-c-input-border bg-c-search-bg px-2.5 py-1 text-[13px] font-medium text-c-body hover:bg-c-hover"
    >
      {children} ×
    </button>
  );
}
