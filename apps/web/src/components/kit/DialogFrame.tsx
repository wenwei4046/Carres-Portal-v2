/**
 * DialogFrame — the shared body of `Modal` and `Drawer` (card D0.5b).
 *
 * INTERNAL. Pages import `Modal` or `Drawer`; neither this file nor Radix is
 * ever imported by a page. It exists for §6.6's reason — a modal and a drawer
 * are the same object placed differently (backdrop · focus trap · escape ·
 * scroll lock · title · close · footer), so the second occurrence was extracted
 * before it was used twice.
 *
 * **Radix supplies the behaviour and nothing else** (§11): focus trap, escape,
 * `aria-modal`, the scroll lock, and returning focus to whatever opened it.
 * Every visible value here is Carres's — `slate-5` hairline, `rounded-card`,
 * §2.1 type, §4.1's frozen spacing, §4.4's layer 4.
 *
 * **Placement is a TYPE, not a prop a page passes.** `Modal` calls this with
 * `place="centre"` and `Drawer` with `place="side"`; there is no third value and
 * no way for a caller to reach either. That is why they are two components
 * rather than one with a `variant` — the same reasoning as `Card` / `Panel`.
 *
 * **The sizes are named in `tailwind.config.ts`, and §8 has not ruled them.**
 * The values are config keys (`max-w-modal`, `max-w-modal-wide`,
 * `max-w-drawer`, `max-h-dialog`) rather than arbitrary classes, because a
 * number typed into a component is a number the next component types
 * differently. `PageShell` (D0.5c) writes the width table for the whole portal
 * and owns them from there.
 *
 * **P19 (2026-08-05) GAVE THE CENTRED SURFACE A SECOND WIDTH, and the shape of
 * the change is what keeps D0.5b's law rather than bending it.** That law said
 * *"a modal that can be told its width is four widths by next quarter, so
 * there is no size prop"* — and the danger it names is a FREE width, not a
 * second one. So `width` is a union of exactly one literal, both values sit in
 * the config, and there is no way for a page to express a number. It is the
 * same shape as `place` below: a closed set the kit owns.
 *
 * `undefined` IS the 512px default — there is no default VALUE, exactly as
 * `DataTable`'s `sizing` has none (P16, whose first draft wrote
 * `sizing = "fill"` and was caught by the kit's own §10.1 guard). Passing
 * nothing renders the markup byte for byte as it was, which is why every other
 * modal in the portal is untouched by this card.
 */
import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Icon from "./Icon";
import { DialogContainerProvider } from "./dialog-container";
import { Z_DIALOG } from "./overlay-layer";

const SURFACE = "bg-white border border-kit-slate-5 flex flex-col";

const PLACE = {
  /** Centred; it never grows past the viewport — the body scrolls instead. */
  centre:
    "fixed left-1/2 top-1/2 w-full max-h-dialog -translate-x-1/2 -translate-y-1/2 rounded-card",
  /** Full height on the right, rounded on the leading edge only. */
  side: "fixed inset-y-0 right-0 w-full max-w-drawer rounded-l-card",
} as const;

/**
 * The centred surface's TWO widths — a closed set, both values named in
 * `tailwind.config.ts`. The drawer has one and takes it from `PLACE.side`,
 * because nothing has asked for a second.
 */
const CENTRE_WIDTH = {
  /** D0.5b — a question, an answer, and two buttons. */
  standard: "max-w-modal",
  /** P19 — a header and a line list. 600px, measured; see the config. */
  wide: "max-w-modal-wide",
} as const;

export type DialogWidth = keyof typeof CENTRE_WIDTH;

export default function DialogFrame({
  place,
  open,
  onOpenChange,
  title,
  description,
  footer,
  kind,
  width,
  children,
}: {
  place: keyof typeof PLACE;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required. A surface that takes the screen must say what it is. */
  title: string;
  description?: string;
  /** The actions. One `primary` — §3.4 bans two blue actions in one block. */
  footer?: ReactNode;
  /** The `data-kit` value, so a test can tell a modal from a drawer. */
  kind: "modal" | "drawer";
  /**
   * Centred surfaces only, and only `"wide"` — its ABSENCE is the 512px
   * default. There is no default value and no way to express a number.
   */
  width?: "wide";
  children: ReactNode;
}) {
  /* `side` carries its own width in `PLACE`; only the centred surface chooses.
   * A ternary rather than `width ?? "standard"` so no fallback string appears
   * in the kit at all — §10.1's rule, kept even though a class is not a word. */
  const widthClass =
    place === "centre" ? CENTRE_WIDTH[width === "wide" ? "wide" : "standard"] : "";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* The scrim. §3 has no row for one — reported to the kit rather than
         *  settled here — so it is the primary-text step at 40%, which is the
         *  nearest thing the law does name. */}
        <Dialog.Overlay
          data-kit="dialog-overlay"
          className={`fixed inset-0 bg-kit-slate-12/40 ${Z_DIALOG}`}
        />
        {/* D0.5b.1 — publishing the content node is what lets a Select, a
         *  Popover or a DatePicker opened INSIDE this dialog render above it,
         *  without touching §4.4's ladder. See `dialog-container`. */}
        <DialogContainerProvider>
          {(setContainer) => (
        <Dialog.Content
          ref={setContainer}
          data-kit={kind}
          /* Radix warns when Content carries no Description. Passing undefined
           * explicitly is its documented way of saying "there is none". */
          aria-describedby={description ? undefined : undefined}
          className={`${SURFACE} ${PLACE[place]} ${widthClass} ${Z_DIALOG} focus:outline-none`}
        >
          <header className="flex items-start justify-between gap-4 border-b border-kit-slate-6 px-4 py-3">
            <div className="flex flex-col gap-1">
              <Dialog.Title className="text-strong text-kit-slate-12">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="text-meta text-kit-slate-11">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close"
              data-kit="dialog-close"
              className="rounded-control p-1 text-kit-slate-11 hover:bg-kit-slate-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
            >
              <Icon name="close" size={16} />
            </Dialog.Close>
          </header>

          <div className="flex-1 overflow-y-auto p-4">{children}</div>

          {footer && (
            <footer className="flex items-center justify-end gap-2 border-t border-kit-slate-6 px-4 py-3">
              {footer}
            </footer>
          )}
        </Dialog.Content>
          )}
        </DialogContainerProvider>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
