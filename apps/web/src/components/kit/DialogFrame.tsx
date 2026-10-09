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
 * `aria-modal` and the scroll lock.
 *
 * ⭐ **RETURNING FOCUS IS THIS FRAME'S OWN JOB, and it was not being done**
 * (found in the 2026-09-11 rendered walk; this file used to claim Radix did
 * it). Radix restores focus to `Dialog.Trigger` — and the kit deliberately has
 * no `Dialog.Trigger`, because `open` is CONTROLLED and the thing that opens a
 * surface is an ordinary page button, a row action or a keyboard shortcut.
 * Radix's modal content therefore calls `preventDefault()` on its close-focus
 * event and then focuses a trigger that is `null`, so focus landed on
 * `<body>`: every modal and drawer in the portal dropped a keyboard user back
 * to the top of the page, with no way back to the row they came from.
 *
 * So the frame remembers the element that had focus when it opened and puts it
 * back. One fix, every surface — a page-local patch would have to be repeated
 * in sixty places and would be wrong in fifty-nine of them.
 * Every visible value here is the v4 kit's (01 §3 · §4, 9 Oct 2026): white,
 * 1px `--c-btn-border`, the 8px corner, `--shadow-drawer`, a 14 × 16 header,
 * the `--backdrop` scrim, §4.4's layer 4. The drawer sits on the right, inset
 * 12px top, bottom and right, 400px wide (`--drawer-w`); the compact module
 * card keeps its own wider 560px home (`max-w-drawer`).
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
import { useRef, type RefObject, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Icon from "./Icon";
import { DialogContainerProvider } from "./dialog-container";
import { Z_DIALOG } from "./overlay-layer";

const SURFACE =
  "bg-c-card text-c-ink border border-c-btn-border rounded-lg [box-shadow:var(--shadow-drawer)] flex flex-col";

const PLACE = {
  /** Centred; it never grows past the viewport — the body scrolls instead. */
  centre:
    "fixed left-1/2 top-1/2 w-full max-h-dialog -translate-x-1/2 -translate-y-1/2",
  /** On the right, inset 12px top, bottom and right; never wider than the
   *  screen less its two 12px gutters. */
  side: "fixed bottom-3 right-3 top-3 w-[calc(100vw-24px)]",
} as const;

/** The drawer's widths: the v4 400px, and the compact module card's own 560px. */
const SIDE_WIDTH = {
  standard: "max-w-[var(--drawer-w)]",
  card: "max-w-drawer",
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
  /** 2026-09-11 — a PICTURE. 880px, measured against the height cap; see the
   *  config. A viewer is not a question and not a list. */
  viewer: "max-w-modal-viewer",
} as const;

export type DialogWidth = keyof typeof CENTRE_WIDTH;

export default function DialogFrame({
  place,
  open,
  onOpenChange,
  title,
  description,
  headerActions,
  variant,
  footer,
  kind,
  width,
  children,
  returnFocusRef,
}: {
  place: keyof typeof PLACE;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required. A surface that takes the screen must say what it is. */
  title: string;
  description?: string;
  headerActions?: ReactNode;
  variant?: "quick-view" | "compact-card";
  /** The actions. One `primary` — §3.4 bans two blue actions in one block. */
  footer?: ReactNode;
  /** The `data-kit` value, so a test can tell a modal from a drawer. */
  kind: "modal" | "drawer";
  /**
   * Centred surfaces only — `"wide"` for a line list, `"viewer"` for a
   * picture. Its ABSENCE is the 512px default. There is no default value and
   * no way to express a number.
   */
  width?: "wide" | "viewer";
  children: ReactNode;
  /** Persistent trigger for a dialog opened by a menu item that unmounts. */
  returnFocusRef?: RefObject<HTMLElement>;
}) {
  /* `side` carries its own width in `PLACE`; only the centred surface chooses.
   * A ternary rather than `width ?? "standard"` so no fallback string appears
   * in the kit at all — §10.1's rule, kept even though a class is not a word. */
  const widthClass =
    place === "centre"
      ? CENTRE_WIDTH[width === "wide" || width === "viewer" ? width : "standard"]
      : SIDE_WIDTH[variant === "compact-card" ? "card" : "standard"];

  /* WHO HAD FOCUS WHEN THIS OPENED. Captured on the OPEN transition, because
     once the surface has mounted the answer is something inside it. */
  const opener = useRef<HTMLElement | null>(null);


  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <DialogContainerProvider>
        {(setContainer) => (
          <Dialog.Portal>
        {/* The scrim: the v4 `--backdrop` token (01 §3). */}
        <Dialog.Overlay
          data-kit="dialog-overlay"
          className={`fixed inset-0 [background:var(--backdrop)] ${Z_DIALOG}`}
        />
        {/* D0.5b.1 — publishing the content node is what lets a Select, a
         *  Popover or a DatePicker opened INSIDE this dialog render above it,
         *  without touching §4.4's ladder. See `dialog-container`. */}
        <Dialog.Content
          ref={setContainer}
          data-kit={kind}
          data-variant={variant}
          /* Radix warns when Content carries no Description. Passing undefined
           * explicitly is its documented way of saying "there is none". */
          aria-describedby={description ? undefined : undefined}
          className={`${SURFACE} ${PLACE[place]} ${widthClass} ${Z_DIALOG} focus:outline-none`}
          onOpenAutoFocus={() => {
            // Capture before Radix moves focus into the surface. A parent
            // effect can run afterwards and incorrectly remember Close.
            const active = document.activeElement;
            opener.current = active instanceof HTMLElement ? active : null;
          }}
          onCloseAutoFocus={(event) => {
            /* Ours runs FIRST and stops Radix's trigger-focus from running at
               all (`composeEventHandlers` checks `defaultPrevented`), so the
               null-trigger path that dropped focus on `<body>` never fires. */
            event.preventDefault();
            const back = returnFocusRef?.current ?? opener.current;
            /* Only if it is still ON the page: a row that the close itself
               removed cannot take focus, and forcing it would throw. Falling
               through to Radix's own behaviour is not an option here — it is
               the behaviour being corrected — so focus simply stays where the
               browser put it, which is the document. */
            if (back && document.contains(back)) back.focus();
          }}
        >
          <header className={variant === "compact-card" ? "sr-only" : "flex items-start justify-between gap-4 rounded-t-lg border-b border-c-section-line [padding:var(--card-pad)]"}>
            <div className={`flex flex-col gap-1 ${variant === "quick-view" ? "min-w-0 flex-1" : ""}`}>
              <Dialog.Title
                className={`text-strong text-c-ink ${variant === "quick-view" ? "truncate" : ""}`}
                title={variant === "quick-view" && typeof title === "string" ? title : undefined}
              >{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="text-meta text-c-secondary">
                  {description}
                </Dialog.Description>
              )}
            </div>
            {variant !== "compact-card" && <div className={`flex items-center gap-2 ${variant === "quick-view" ? "shrink-0" : ""}`}>{headerActions}
            <Dialog.Close
              aria-label="Close"
              title="Close"
              data-kit="dialog-close"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-c-secondary hover:bg-c-hover focus-visible:[outline:var(--c-focus)] focus-visible:[outline-offset:-2px] md:h-8 md:w-8"
            >
              <Icon name="close" size={16} />
            </Dialog.Close></div>}
          </header>

          {/* The compact card's own identity band reaches the corners, so its
              scroller clips to the 8px corner. Never the whole surface: a list
              portaled into this dialog must not be cut off. */}
          <div className={variant === "compact-card" ? "flex-1 overflow-y-auto rounded-lg" : "flex-1 overflow-y-auto p-4"}>{children}</div>

          {footer && (
            <footer className="flex items-center justify-end gap-2 rounded-b-lg border-t border-c-section-line [padding:var(--card-pad)]">
              {footer}
            </footer>
          )}
        </Dialog.Content>
          </Dialog.Portal>
        )}
      </DialogContainerProvider>
    </Dialog.Root>
  );
}
