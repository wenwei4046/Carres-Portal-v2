/**
 * Drawer — the record opened beside the list (UI-KIT §6, card D0.5b).
 *
 * Same object as `Modal`, placed on the right and full height, so it shares
 * `DialogFrame` rather than repeating a backdrop and a focus trap (§6.6).
 *
 * **Why a separate component and not `<Modal place="side">`.** The two answer
 * different questions — a Modal interrupts to ask something, a Drawer opens a
 * RECORD next to the list it came from — and §8.2's list law depends on the
 * difference: *"close the drawer → the table keeps its filter AND its scroll
 * position."* A page choosing placement from a prop can put a record in the
 * middle of the screen; a page choosing a component cannot.
 *
 * **This is the box, not the order drawer.** What goes INSIDE a detail record —
 * identity · current action · current issues · progress · sections · activity —
 * is `DetailShell`, §1.4's ordered slots, and that is **D0.5c**. This component
 * owns the surface and stops there.
 */
import type { ReactNode } from "react";
import DialogFrame from "./DialogFrame";

export default function Drawer({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DialogFrame
      kind="drawer"
      place="side"
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={footer}
    >
      {children}
    </DialogFrame>
  );
}
