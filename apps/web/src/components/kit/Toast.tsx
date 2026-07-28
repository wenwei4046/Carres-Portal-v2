/**
 * Toast — UI-KIT §6 Box Dictionary, card D0.5b.
 *
 * §11 pins the renderer to **`sonner`**, which is already mounted once in
 * `App.tsx`. So this file is not a component — it is the kit's DOOR to it, and
 * the door is narrow on purpose.
 *
 * **§9 gives Success exactly one home: a toast, and it never becomes a
 * permanent block.** The reverse is the rule that matters here — *a toast may
 * not carry a state the page should be showing.* An error a user must act on
 * belongs in `EmptyState` or beside the field that refused; a toast disappears,
 * and a fact that disappears was never really told.
 *
 * That is why there is no `duration`, no `action` and no `id`: a toast you have
 * to keep on screen, or click, is a thing that should not have been a toast.
 */
import { toast as sonner } from "sonner";

export const toast = {
  /** Something the operator did worked. The commonest and the safest. */
  success(message: string) {
    sonner.success(message);
  },
  /**
   * Something failed and there is nothing to do about it here. If there IS
   * something to do, put it where the doing happens, not in a toast.
   */
  error(message: string) {
    sonner.error(message);
  },
  /** A neutral statement of fact — "Copied", "Nothing to send". */
  info(message: string) {
    sonner(message);
  },
};
