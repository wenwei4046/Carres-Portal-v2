/**
 * Tooltip — UI-KIT §6 Box Dictionary, card D0.5b.
 *
 * **A tooltip may only REPEAT or EXPAND what is already on screen.** If the
 * only place a fact exists is inside a tooltip, the fact is invisible: on a
 * touch screen there is no hover, and an operator scanning a list never finds
 * it. The row's `+N` tooltip is the pattern — the actions it names are all
 * reachable by clicking, and the tooltip just saves the click.
 *
 * `content` is a STRING, not a node. A tooltip holding buttons or links is a
 * `Popover` — you cannot click your way into a tooltip before it closes.
 *
 * Mounting: the whole app is wrapped once in `Tooltip.Provider` (`main.tsx`),
 * so a delay is consistent instead of per-call.
 */
import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { useOverlayContainer } from "./overlay-container";
import { TOOLTIP_SURFACE } from "./overlay-recipe";

export default function Tooltip({
  content,
  side = "top",
  children,
}: {
  /** One line. It repeats or expands something already visible. */
  content: string;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
}) {
  const container = useOverlayContainer();
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal container={container}>
        <RadixTooltip.Content data-kit="tooltip" side={side} sideOffset={4} className={TOOLTIP_SURFACE}>
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

/**
 * Mounted ONCE at the app root. Exported here so the delay lives beside the
 * component it governs rather than in a page.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={300} skipDelayDuration={150}>
      {children}
    </RadixTooltip.Provider>
  );
}
