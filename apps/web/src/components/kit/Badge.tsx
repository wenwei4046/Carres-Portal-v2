/**
 * Badge — a count, or a plain tag (UI-KIT §6, card D0.5a).
 *
 * **It has no tone, and that is the whole design.** A coloured badge is a
 * status wearing a different name, and §3.4 says a status is a pill — so a
 * badge that could be red would be a second status renderer with none of
 * `StatusPill`'s rules. There is no `tone` prop to pass, so it cannot happen.
 *
 * Use it for the neutral counts a queue rail and a tab bar carry. Anything that
 * says how an order is DOING is a `StatusPill`.
 */
import type { ReactNode } from "react";

export default function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      data-kit="badge"
      className="inline-flex items-center rounded-full bg-kit-slate-3 px-2 py-1 text-label text-kit-slate-11 tabular-nums"
    >
      {children}
    </span>
  );
}
