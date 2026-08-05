/**
 * Modal — the surface that takes the screen (UI-KIT §6, card D0.5b).
 *
 * Replaces the modal half of **63 files hand-rolling an overlay in 12+ shapes
 * with 5 different backdrop colours**. Behaviour is Radix Dialog's (§11): focus
 * trap, escape, scroll lock, `aria-modal`, focus returned to the trigger.
 *
 * **It is CONTROLLED, always.** There is no `defaultOpen` and no internal state:
 * a modal that owns whether it is open is a modal a page cannot close after a
 * save succeeded, which is how a form ends up submitting twice.
 *
 * **`title` is required.** A surface that blocks the page must say what it is —
 * and Radix needs it for `aria-labelledby`, so an untitled modal is both an
 * accessibility failure and an unanswerable screen.
 *
 * No `className`, no `style`, and no free size — `width` is a closed union of
 * one literal whose absence is the default. See `DialogFrame` for why.
 */
import type { ReactNode } from "react";
import DialogFrame from "./DialogFrame";

export default function Modal({
  open,
  onOpenChange,
  title,
  description,
  footer,
  width,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** One sentence under the title. Not a place for instructions. */
  description?: string;
  /** The action row. One `primary` — §3.4 bans two blue actions in a block. */
  footer?: ReactNode;
  /**
   * `"wide"` for a surface carrying a LINE LIST rather than a question — P19,
   * 2026-08-05. Omit it and the modal is 512px, byte for byte as before.
   *
   * There is no `"narrow"`, no number and no `style`: the set is closed at two
   * and both values live in `tailwind.config.ts`. A third width is a decision
   * for §8's width table, not for a caller.
   */
  width?: "wide";
  children: ReactNode;
}) {
  return (
    <DialogFrame
      kind="modal"
      place="centre"
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={footer}
      width={width}
    >
      {children}
    </DialogFrame>
  );
}
