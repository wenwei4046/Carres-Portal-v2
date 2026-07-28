/**
 * Drawer — UI-KIT §6 Box Dictionary, card D0.5b.
 *
 * The same Radix `Dialog` as `Modal`, docked to an edge instead of centred.
 * **It is a separate component, not a `Modal` prop**, because the choice
 * between them is a business one — a modal INTERRUPTS (answer it and the page
 * comes back), a drawer ACCOMPANIES (the record stays on screen behind it) —
 * and a `variant="drawer"` prop would let a page flip the meaning by editing
 * one word.
 *
 * **Right edge only.** A left drawer would fight the portal's own sidebar, and
 * a bottom sheet is a phone pattern this portal has no card for. When one is
 * needed it is a kit decision, not a prop somebody adds.
 *
 * The order drawer (`OrderDetailDrawer`, ~7,600 lines) is NOT ported here —
 * that is D0.5c's `DetailShell`, and porting a shell before its slots exist is
 * how a wrong shell reaches five pages.
 */
import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import Icon from "./Icon";
import { OVERLAY_SURFACE, SCRIM } from "./overlay-recipe";

type Width = "md" | "lg" | "xl";

const WIDTH: Record<Width, string> = {
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export default function Drawer({
  open,
  onOpenChange,
  title,
  width = "lg",
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required, and a real heading — same reason as `Modal`. */
  title: string;
  width?: Width;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={SCRIM} />
        <Dialog.Content
          data-kit="drawer"
          /* Docked right, full height, square on the docked edge — a floating
           * rounded panel would read as a modal that missed the middle. */
          className={`${OVERLAY_SURFACE} inset-y-0 right-0 flex w-full ${WIDTH[width]} flex-col rounded-l-card rounded-r-none border-y-0 border-r-0`}
        >
          <div className="flex items-center justify-between gap-4 border-b border-kit-slate-6 px-4 py-3">
            <Dialog.Title className="truncate text-strong text-kit-slate-12">{title}</Dialog.Title>
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
            <Dialog.Close
              aria-label="Close"
              className="shrink-0 rounded-control p-1 text-kit-slate-11 hover:bg-kit-blue-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
            >
              <Icon name="close" size={16} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-kit-slate-6 px-4 py-3">{footer}</div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
