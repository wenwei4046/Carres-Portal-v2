/**
 * Popover — UI-KIT §6 Box Dictionary, card D0.5b.
 *
 * §1.2 calls a Popover a **Contextual Surface**: it holds no permanent vertical
 * height, which is what makes it the right home for a P3 control. The filter
 * panel and the column picker are the live examples.
 *
 * The difference from `Modal` is not size, it is INTERRUPTION. A popover leaves
 * the page usable behind it — no scrim, no focus trap on the page — so it is
 * for adjusting what you are looking at. A modal is for answering something.
 *
 * The difference from `Tooltip` is INTERACTION: a popover holds controls and
 * can be clicked into; a tooltip holds one line of text and cannot.
 */
import * as RadixPopover from "@radix-ui/react-popover";
import type { ReactNode } from "react";
import { useOverlayContainer } from "./overlay-container";
import { POPOVER_SURFACE } from "./overlay-recipe";

export default function Popover({
  trigger,
  label,
  align = "start",
  children,
}: {
  trigger: ReactNode;
  /** Accessible name for the panel — a popover with none is unannounceable. */
  label: string;
  align?: "start" | "center" | "end";
  children: ReactNode;
}) {
  const container = useOverlayContainer();
  return (
    <RadixPopover.Root>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal container={container}>
        <RadixPopover.Content
          data-kit="popover"
          aria-label={label}
          align={align}
          sideOffset={4}
          className={`${POPOVER_SURFACE} min-w-48 max-w-sm`}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
