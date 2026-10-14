/**
 * CPopover — the Carres pop-up surface (UI Kit "Pop-up menu", v8 L207/L172):
 * white · radius 8 · shadow 0 8 28 rgba(22,24,29,.1) · pad 6. Behaviour is the
 * Radix popover the kit already uses (outside click, Escape). `CMenuItem` is one
 * row: pad 7 10 · 13/500.
 *
 * As a `menu` it follows the WAI-ARIA menu button pattern (and Design's Round 4
 * Carres Menu): the button says `aria-haspopup="menu"`; Enter, Space or ↓ on it
 * opens the menu with focus on the ticked item, else the first; ↑ ↓ Home End
 * move between items; Escape or Tab closes it and focus goes back to the button.
 */
import { useRef, type KeyboardEvent, type ReactNode } from "react";
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
  const menu = role === "menu";
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  /* A click elsewhere closes it without pulling focus back from what was clicked. */
  const outside = useRef(false);
  const items = () => [...(contentRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])];
  const close = () => {
    onOpenChange?.(false);
    triggerRef.current?.focus();
  };
  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!menu) return;
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      list[(n + list.length) % list.length]?.focus();
    };
    if (e.key === "Tab") {
      e.preventDefault();
      close();
    } else if (list.length === 0) return;
    else if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at < 0 ? list.length - 1 : at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
  };
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger
        asChild
        ref={triggerRef}
        aria-haspopup={menu ? "menu" : "dialog"}
        onKeyDown={(e) => {
          if (menu && e.key === "ArrowDown" && !open) {
            e.preventDefault();
            onOpenChange?.(true);
          }
        }}
      >
        {trigger}
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          ref={contentRef}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          aria-label={label}
          role={role}
          onKeyDown={onMenuKey}
          onPointerDownOutside={() => {
            outside.current = true;
          }}
          onOpenAutoFocus={(e) => {
            outside.current = false;
            if (!menu) return;
            e.preventDefault();
            const list = items();
            (list.find((x) => x.getAttribute("aria-checked") === "true") ?? list[0])?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (!outside.current) triggerRef.current?.focus();
            outside.current = false;
          }}
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
  disabled = false,
  testId,
}: {
  icon?: string;
  children: ReactNode;
  note?: ReactNode;
  checked?: boolean;
  onSelect: () => void;
  strong?: boolean;
  /** Not available yet: 45% and no hover or click (01 §3 "Disabled"). */
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={disabled ? undefined : onSelect}
      data-testid={testId}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] text-c-ink ${
        disabled ? "cursor-default opacity-45" : "hover:bg-c-search-bg"
      } ${strong ? "font-semibold" : "font-medium"}`}
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
