/**
 * Where a floating surface renders — card D0.5b.
 *
 * **The problem this closes.** §4.4's ladder puts popovers on 30 and overlays
 * on 40. Both Radix portals mount as siblings on `<body>`, so a `Select` opened
 * INSIDE a `Modal` paints at 30 *underneath* the modal at 40 — and "a picker
 * inside a dialog" is the commonest form pattern there is. Two files would then
 * have to agree about a number forever.
 *
 * **The fix is structural, not numeric.** A modal or drawer publishes its own
 * content element here; every popover-class box portals INTO it when there is
 * one, and onto `<body>` when there is not. Inside the dialog's stacking
 * context, 30-above-the-dialog's-children is exactly right, so **the ladder in
 * §4.4 is untouched** — which matters, because changing it would have meant
 * changing a frozen law to fix a component.
 *
 * *(Noted honestly: the occlusion was reasoned from the two z-values and the
 * portal structure, not measured — the harness's browser pane reports a 0×0
 * viewport, so hit-testing there proves nothing. The fix removes the question
 * rather than leaving a suspected defect to be found by an operator.)*
 */
import { createContext, useContext, useState, type ReactNode } from "react";

const OverlayContainer = createContext<HTMLElement | null>(null);

/** Read by `Select` · `Popover` · `DropdownMenu` · `DatePicker` · `Tooltip`. */
export function useOverlayContainer(): HTMLElement | null {
  return useContext(OverlayContainer);
}

/**
 * Wraps a modal/drawer body. `useState` rather than `useRef` on purpose: a ref
 * does not re-render when it fills, so the first paint of a child popover would
 * still portal to `<body>`.
 */
export function OverlayContainerProvider({
  children,
}: {
  children: (setContainer: (el: HTMLElement | null) => void) => ReactNode;
}) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return <OverlayContainer.Provider value={container}>{children(setContainer)}</OverlayContainer.Provider>;
}
