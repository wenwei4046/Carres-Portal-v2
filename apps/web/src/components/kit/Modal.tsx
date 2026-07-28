/**
 * Modal — UI-KIT §6 Box Dictionary, card D0.5b.
 *
 * Replaces the modal half of **63 hand-rolled overlays in 12+ shapes with 5
 * backdrop colours**. Radix `Dialog` supplies every behaviour that made those
 * 63 subtly different: focus trap, focus return, Escape, scroll lock, the
 * `aria-modal` wiring and the portal. None of it is re-implemented here.
 *
 * **`title` is required, and it is a real `<h2>`.** A dialog with no accessible
 * name is a dialog a screen reader announces as nothing; several of the 63 do
 * exactly that. If a surface genuinely has nothing to be called, it is not a
 * modal — it is a `Popover`.
 *
 * **There is no `size="full"`, and no `closeOnOutsideClick={false}`.** A
 * full-screen modal is a page (D0.5c's `PageShell`), and a modal that cannot be
 * dismissed is a trap; a destructive confirm handles that by asking a question
 * whose answer is a Button, not by removing the exit.
 */
import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import Icon from "./Icon";
import { OVERLAY_SURFACE, SCRIM } from "./overlay-recipe";

type Size = "sm" | "md" | "lg";

/** Widths, not heights: a modal grows with its content and scrolls inside. */
const SIZE: Record<Size, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export default function Modal({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required — it names the dialog for a screen reader and for the operator. */
  title: string;
  /** One sentence under the title. Never a second paragraph. */
  description?: string;
  size?: Size;
  /** The action row. Buttons come from the caller; the modal owns no verb. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={SCRIM} />
        <Dialog.Content
          data-kit="modal"
          className={`${OVERLAY_SURFACE} left-1/2 top-1/2 w-[calc(100%-32px)] ${SIZE[size]} -translate-x-1/2 -translate-y-1/2 flex flex-col max-h-[calc(100vh-64px)]`}
        >
          <div className="flex items-start justify-between gap-4 border-b border-kit-slate-6 px-4 py-3">
            <div className="flex min-w-0 flex-col gap-1">
              <Dialog.Title className="text-strong text-kit-slate-12">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="text-meta text-kit-slate-11">{description}</Dialog.Description>
              ) : (
                /* Radix warns when a dialog has no description; saying "there
                 * is none" is the honest answer and keeps the console clean. */
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
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
