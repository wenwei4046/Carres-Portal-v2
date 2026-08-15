/**
 * Toast — what changed, said once and then gone (UI-KIT §9, card D0.5b).
 *
 * §9's Success row: *"a toast — what changed; it never becomes a permanent
 * block."* That is the whole contract, and it is why this file exports a
 * FUNCTION rather than a component a page mounts: a success that a page has to
 * render is a success that ends up as a green bar nobody dismisses.
 *
 * **It reuses the ONE host already in `App.tsx`.** `sonner`'s `<Toaster>` has
 * been mounted app-wide since long before the kit; a second host would stack two
 * toasts in two corners. `notify()` renders through `toast.custom`, so the
 * SURFACE is the kit's (white, `slate-5` hairline, §2.1 type, a §5.3 glyph)
 * while sonner keeps the behaviour it already owns — the stack, the timer, the
 * swipe, the layer (§4.4's z-50, which is sonner's and which the kit never
 * writes). **No existing caller changes**: the 40-odd pages still calling
 * `toast.success(...)` keep sonner's own look until D2–D7 move them.
 *
 * **Three kinds and no fourth.** They map to §3.3's jobs: `success` is done,
 * `warning` needs attention, `danger` is act-now. There is deliberately no
 * "info" toast — a message with no consequence does not earn an interruption.
 *
 * **The component is exported too, and that is for `/ui`.** A real toast is on
 * screen for four seconds, which no screenshot gate can photograph; `/ui`
 * renders the surface statically, the same trick the forced hover states use.
 */
import { toast } from "sonner";
import type { OrderActionTone } from "@carres/shared";
import Icon, { type IconName } from "./Icon";
import { TONE_CLASS } from "./tokens";

/** The three §3.3 jobs a toast is allowed to do. */
export type ToastKind = Extract<OrderActionTone, "success" | "warning" | "danger">;

const GLYPH: Record<ToastKind, IconName> = {
  success: "ready",
  warning: "waiting",
  danger: "late",
};

export default function Toast({ kind, message }: { kind: ToastKind; message: string }) {
  return (
    <div
      data-kit="toast"
      data-tone={kind}
      role="status"
      className="flex items-center gap-2 rounded-card border border-kit-slate-5 bg-white px-4 py-3 text-body text-kit-slate-12"
    >
      {/* The tone lives on the GLYPH, not on the surface: a fully coloured
       *  toast is a status pill the size of a card, and §3.4 keeps colour for
       *  the thing that earned it. */}
      <span className={`flex items-center rounded-full p-1 ${TONE_CLASS[kind]}`}>
        <Icon name={GLYPH[kind]} size={14} />
      </span>
      {message}
    </div>
  );
}

/**
 * Say what changed. The WORDS are the caller's — they come from
 * COPY-STANDARD, and this file spells none of them.
 */
export function notify(kind: ToastKind, message: string): void {
  toast.custom(() => <Toast kind={kind} message={message} />);
}
