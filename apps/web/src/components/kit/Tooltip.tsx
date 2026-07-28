/**
 * Tooltip — one line, on hover or on focus (UI-KIT §6, card D0.5b).
 *
 * Radix gives it the thing a `title=` attribute cannot: it opens on keyboard
 * focus as well as on hover, it is readable by a screen reader, and it does not
 * wait a second and a half for the browser's own timer.
 *
 * **`content` is a STRING, not a node.** A tooltip that can hold JSX becomes a
 * popover with no way to reach its contents by keyboard — Radix's own docs say
 * it, and §9 already gives interactive content a `Popover`. One line of text.
 *
 * **It never carries the only copy of anything.** A tooltip is not reachable on
 * a touch screen, so a rule, a deadline or a refusal that exists ONLY in a
 * tooltip is a fact half the portal's users cannot read. Same law the queue
 * tiles follow: the tooltip elaborates what the row already says.
 *
 * The provider is inside the component on purpose — a page must not have to
 * remember to mount one, and Radix nests providers safely.
 */
import type { ReactNode } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { Z_FLOATING } from "./overlay-layer";

export default function Tooltip({
  content,
  children,
  side = "top",
}: {
  /** One line. Never the only place a fact appears. */
  content: string;
  /** The thing being explained. Radix attaches the behaviour via `asChild`. */
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <RadixTooltip.Provider delayDuration={200}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={4}
            data-kit="tooltip"
            /* Ink-on-dark rather than the white floating surface: a tooltip is
             * the one overlay that must read as a note ABOUT the page instead
             * of a piece OF it. `slate-12` is §3.2's primary-text step. */
            className={`max-w-xs rounded-control bg-kit-slate-12 px-2 py-1 text-meta text-white ${Z_FLOATING}`}
          >
            {content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
