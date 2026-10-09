/**
 * CPopover — the Carres pop-up surface (UI Kit "Pop-up menu", v8 L207/L172):
 * white · radius 8 · shadow 0 8 28 rgba(22,24,29,.1) · pad 6. Behaviour is the
 * Radix popover the kit already uses (outside click, Escape, focus return);
 * only the look is the handoff's. `CMenuItem` is one row: pad 7 10 · 13/500.
 */
import type { ReactNode } from "react";
import * as RadixPopover from "@radix-ui/react-popover";
import { Z_FLOATING } from "@/components/kit/overlay-layer";
import MIcon from "./MIcon";

export default function CPopover({
  trigger,
  label,
  open,
  onOpenChange,
  align = "end",
  width,
  children,
  role = "dialog",
}: {
  trigger: ReactNode;
  label: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  width?: number;
  children: ReactNode;
  role?: "dialog" | "menu";
}) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align={align}
          sideOffset={6}
          collisionPadding={8}
          aria-label={label}
          role={role}
          className={`${Z_FLOATING} max-h-[min(70vh,480px)] overflow-auto rounded-lg bg-c-card p-1.5 text-c-ink [box-shadow:var(--shadow-menu)] focus:outline-none`}
          style={width ? { width } : undefined}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

/** One pop-up row: icon · words · right note or a check when chosen. */
export function CMenuItem({
  icon,
  children,
  note,
  checked,
  onSelect,
  strong = false,
  testId,
}: {
  icon?: string;
  children: ReactNode;
  note?: ReactNode;
  checked?: boolean;
  onSelect: () => void;
  strong?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked}
      onClick={onSelect}
      data-testid={testId}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] text-c-ink hover:bg-c-search-bg ${
        strong ? "font-semibold" : "font-medium"
      }`}
    >
      {icon && <MIcon name={icon} size={18} className="text-c-secondary" />}
      <span className="min-w-0 flex-1">{children}</span>
      {note != null && <span className="shrink-0 text-[12px] font-normal text-c-muted">{note}</span>}
      {checked && <MIcon name="check" size={18} />}
    </button>
  );
}

/** A small grey group word inside a pop-up (`EXPORT · orders shown now`). */
export function CMenuGroup({ children, first = false }: { children: ReactNode; first?: boolean }) {
  return (
    <div
      className={`px-2.5 pb-1 pt-2 text-[11px] font-semibold tracking-[0.04em] text-c-muted ${
        first ? "" : "border-t border-c-section-line"
      }`}
    >
      {children}
    </div>
  );
}
