/**
 * Where a picker renders when it is opened inside a dialog — card D0.5b.1.
 *
 * **The defect this closes.** §4.4 puts popovers on 30 and dialogs on 40, and
 * both Radix portals mount as SIBLINGS on `<body>` — so a `Select` opened
 * inside a `Modal` paints underneath it. "A picker inside a dialog" is the
 * commonest form pattern there is, so the first real form in a modal would
 * have hit it.
 *
 * **The fix is structural, not numeric.** The obvious repair is to raise the
 * popover layer above 40; that is how fifteen z-levels happened the first time,
 * and §4.4 is frozen. Instead a dialog publishes its own content element here,
 * and every picker portals INTO it — inside the dialog's stacking context,
 * 30-above-the-dialog's-children is exactly right. **`Z_LADDER` is untouched.**
 *
 * Outside a dialog the value is `null`, which is Radix's own "use `<body>`" —
 * so the normal case does not move.
 */
import { createContext, useContext, useState, type ReactNode } from "react";

const DialogContainer = createContext<HTMLElement | null>(null);

/** Read by `Select` · `Popover` · `DatePicker`. Null when not inside a dialog. */
export function useDialogContainer(): HTMLElement | null {
  return useContext(DialogContainer);
}

/**
 * Wraps a dialog's content. `useState` rather than `useRef` on purpose: a ref
 * does not re-render when it fills, so a picker's first paint would still go
 * to `<body>` and the fix would work only after an unrelated render.
 */
export function DialogContainerProvider({
  children,
}: {
  children: (setContainer: (el: HTMLElement | null) => void) => ReactNode;
}) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return <DialogContainer.Provider value={container}>{children(setContainer)}</DialogContainer.Provider>;
}
