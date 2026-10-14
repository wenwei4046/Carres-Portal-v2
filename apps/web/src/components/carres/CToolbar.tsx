/**
 * The list toolbar's small parts (v12 kit): the button that shows a hidden side
 * panel, the round icon button, and a filter chip. The toolbar is one 36px line
 * (Layout Standard §0); these parts never wrap it.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import MIcon from "./MIcon";

/** `▤ Summary` — brings a hidden side panel back. */
export function CShowPanelButton({ label, onShow }: { label: string; onShow: () => void }) {
  return (
    <button
      type="button"
      onClick={onShow}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-c-btn-border bg-white px-3 text-[13px] font-medium text-c-ink hover:bg-c-hover"
    >
      <MIcon name="left_panel_open" size={18} />
      {label}
    </button>
  );
}

/** A 36px round icon button: the view menu, ⋮. Its name is its tooltip. */
export const CIconButton = forwardRef<
  HTMLButtonElement,
  { icon: string; label: string; pressed?: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">
>(function CIconButton({ icon, label, pressed = false, className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-c-body hover:bg-c-hover ${pressed ? "bg-c-hover" : ""} ${className ?? ""}`}
    >
      <MIcon name={icon} size={20} />
    </button>
  );
});

/**
 * The view button (v12 Shell): a white word button, 32 high — the current view's
 * icon, its name, ▾ — grey while its menu is open. The name hides while the Tasks
 * panel is open, so the toolbar stays one line; the button keeps it as its name.
 */
export const CViewButton = forwardRef<
  HTMLButtonElement,
  { icon: string; name: string; showName: boolean; open?: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">
>(function CViewButton({ icon, name, showName, open = false, className, ...rest }, ref) {
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
      {showName && name}
      <MIcon name="expand_more" size={18} className="text-c-secondary" />
    </button>
  );
});

/** A filter chip, `Payment: Owes ×`; a click removes the filter. */
export function CChip({ children, onClear }: { children: ReactNode; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="shrink-0 whitespace-nowrap rounded-lg border border-c-input-border bg-c-search-bg px-2.5 py-1 text-[13px] font-medium text-c-body hover:bg-c-hover"
    >
      {children} ×
    </button>
  );
}
