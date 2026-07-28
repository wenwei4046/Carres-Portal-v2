/**
 * DropdownMenu — the ⋮ menu (UI-KIT §6, card D0.5b).
 *
 * The row's overflow actions, and the one place a page is allowed to hide a
 * command. Radix supplies typeahead, arrow keys, escape, and closing on select.
 *
 * **A menu carries no colour.** There is no `destructive` item and no red row:
 * §3.3 gives red one job — *late · act now* — and an item is neither. A
 * destructive command is an ordinary row whose WORD says what it does, which is
 * the same ruling `Button` makes about having no `danger` variant.
 *
 * **Items are DATA.** Same reason as `Select`: a children API turns every ⋮ menu
 * in the portal into a different shape within a month. An item is a word, a
 * §5.3 meaning, and something to run.
 *
 * **The trigger is the caller's `Button`.** Passing it in rather than drawing
 * one keeps this file out of the button business — a kebab in a table row is
 * `size="sm"`, a toolbar's is `md`, and neither is this component's decision.
 */
import type { ReactNode } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import Icon, { type IconName } from "./Icon";
import { FLOATING_ITEM, FLOATING_SURFACE } from "./floating-surface";

export interface MenuItem {
  key: string;
  /** The word. Owned by COPY-STANDARD, never by this file. */
  label: string;
  icon?: IconName;
  disabled?: boolean;
  onSelect: () => void;
  /** Draw a divider ABOVE this item — grouping, not decoration. */
  separatorBefore?: boolean;
}

export default function DropdownMenu({
  trigger,
  label,
  items,
  align = "end",
}: {
  /** A kit `Button`. Radix hands it the trigger behaviour via `asChild`. */
  trigger: ReactNode;
  /** What the menu is, for a screen reader. Never drawn. */
  label: string;
  items: readonly MenuItem[];
  align?: "start" | "end";
}) {
  return (
    <Menu.Root>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align={align}
          sideOffset={4}
          aria-label={label}
          data-kit="dropdown-menu"
          className={`${FLOATING_SURFACE} min-w-40 p-1`}
        >
          {items.map((item) => (
            <div key={item.key}>
              {item.separatorBefore && <Menu.Separator className="my-1 h-px bg-kit-slate-5" />}
              <Menu.Item
                disabled={item.disabled}
                onSelect={item.onSelect}
                data-kit="dropdown-item"
                className={FLOATING_ITEM}
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
