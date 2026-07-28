/**
 * Popover — a small surface hanging off the control that opened it
 * (UI-KIT §6, card D0.5b).
 *
 * §1.2 names it as one of the four **Contextual Surfaces**: the answer for
 * anything P3, because it holds no permanent vertical height and §1.3 is a
 * budget. A filter panel, a column chooser, a date picker's calendar.
 *
 * **A Popover is not a Modal.** It does not trap focus, it does not dim the
 * page, and the page keeps working behind it. If a thing must be answered
 * before anything else can happen, that is a `Modal` — and the difference is
 * which component a page reaches for, not a prop.
 *
 * **Content is the caller's**, unlike `Select` and `DropdownMenu`: a popover has
 * no row shape to keep closed, and what goes in it is a form, a list, a
 * calendar. The SURFACE is the kit's; the inside is the page's.
 */
import type { ReactNode } from "react";
import * as RadixPopover from "@radix-ui/react-popover";
import { FLOATING_SURFACE } from "./floating-surface";

export default function Popover({
  trigger,
  label,
  align = "start",
  open,
  onOpenChange,
  children,
}: {
  /** A kit `Button`. Radix hands it the trigger behaviour via `asChild`. */
  trigger: ReactNode;
  /** What the surface is, for a screen reader. Never drawn. */
  label: string;
  align?: "start" | "center" | "end";
  /** Optional control. Left out, the popover manages its own open state —
   *  which is safe here precisely because nothing is being submitted. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align={align}
          sideOffset={4}
          aria-label={label}
          data-kit="popover"
          className={`${FLOATING_SURFACE} p-4 focus:outline-none`}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
