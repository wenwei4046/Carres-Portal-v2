/**
 * DropdownMenu — the ⋮ menu (UI-KIT §6 Box Dictionary, card D0.5b).
 *
 * §5.3 gives `overflow` exactly one glyph (`MoreVertical`) and Jess's own rule
 * puts bulk and row actions in it rather than in a top bar. This is that menu.
 *
 * **Items are DATA, and each carries its own `onSelect`.** A menu whose items
 * are children is a menu a page can put a form inside — and then the keyboard
 * model Radix provides (roving focus, type-ahead, Escape) stops describing what
 * is on screen.
 *
 * `tone: "danger"` is the ONE place red ink is allowed on a control (§3.3's
 * "late · act now" is a state, but a destructive MENU ITEM must be findable at
 * a glance among five neutral ones). It colours the ink only — never a fill.
 */
import * as Menu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
import { useOverlayContainer } from "./overlay-container";
import { MENU_ITEM, POPOVER_SURFACE } from "./overlay-recipe";

export interface MenuItem {
  /** The word — owned by COPY-STANDARD, never invented at the call site. */
  label: string;
  onSelect: () => void;
  icon?: IconName;
  disabled?: boolean;
  tone?: "danger";
  /** Draw a divider ABOVE this item — grouping, never decoration. */
  separated?: boolean;
}

export default function DropdownMenu({
  trigger,
  items,
  align = "end",
  label = "More",
}: {
  /** The control that opens it — usually an icon Button. */
  trigger: ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  /** Accessible name for the menu itself. */
  label?: string;
}) {
  const container = useOverlayContainer();
  return (
    <Menu.Root>
      <Menu.Trigger asChild aria-label={label}>
        {trigger}
      </Menu.Trigger>
      <Menu.Portal container={container}>
        <Menu.Content data-kit="dropdown-menu" align={align} sideOffset={4} className={`${POPOVER_SURFACE} min-w-48`}>
          {items.map((item) => (
            <div key={item.label}>
              {item.separated && <Menu.Separator className="my-1 h-px bg-kit-slate-6" />}
              <Menu.Item
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={`${MENU_ITEM} ${item.tone === "danger" ? "text-kit-red-11" : ""}`}
              >
                {item.icon && <Icon name={item.icon} size={14} />}
                {item.label}
              </Menu.Item>
            </div>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
