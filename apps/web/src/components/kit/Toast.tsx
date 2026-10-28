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
 * SURFACE is the kit's (v4: white, card hairline, 8px corner, menu shadow,
 * 13px ink, a §5.3 glyph in the soft status pair)
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
import MIcon from "@/components/carres/MIcon";
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
      className="flex items-center gap-2 rounded-lg border border-c-card-border bg-c-card [padding:var(--card-pad)] text-body text-c-ink [box-shadow:var(--shadow-menu)]"
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

/**
 * THE TOAST AFTER A TASK CLOSES (01 §3; owner 12 Oct 2026): the app's dark
 * toast at the bottom centre, 12 seconds, with `Next: {name} ›` when another
 * task waits and ✕. One click on `Next` opens that task; nothing jumps by
 * itself. It carries no `Undo`: a saved record is corrected through its
 * owning module (owner 12 Oct 2026, evening). No card and no coloured edge.
 */
export function TaskToast({ message, nextLabel, onNext, closeLabel, onClose }: {
  /** What was saved, in the owning module's own words. */
  message: string;
  /** `Next: Ohana`, when another task waits. */
  nextLabel?: string | null;
  onNext?: () => void;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div data-kit="task-toast" role="status" className="flex max-w-[min(560px,calc(100vw-32px))] items-center gap-3 rounded-lg bg-c-ink px-3.5 py-2.5 text-body text-white [box-shadow:var(--shadow-menu)]">
      <span className="min-w-0 break-words">{message}</span>
      {nextLabel && onNext ? (
        <button type="button" onClick={onNext} className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap font-medium text-white outline-none hover:underline focus-visible:underline" data-testid="task-toast-next">
          {nextLabel}
          <MIcon name="chevron_right" size={16} />
        </button>
      ) : null}
      <button type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white outline-none hover:bg-white/15 focus-visible:bg-white/15" data-testid="task-toast-close">
        <MIcon name="close" size={16} />
      </button>
    </div>
  );
}

/** Say that a task was saved. The words are the caller's. */
export function notifyTaskSaved(message: string, opts: { closeLabel: string; next?: { label: string; onOpen: () => void } | null }): void {
  toast.custom((id) => (
    <TaskToast
      message={message}
      nextLabel={opts.next?.label}
      onNext={opts.next ? () => { toast.dismiss(id); opts.next!.onOpen(); } : undefined}
      closeLabel={opts.closeLabel}
      onClose={() => toast.dismiss(id)}
    />
  ), { position: "bottom-center", duration: 12_000 });
}
