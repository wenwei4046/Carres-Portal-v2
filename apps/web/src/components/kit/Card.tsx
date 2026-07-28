/**
 * Card — the white surface (UI-KIT §6, card D0.5a).
 *
 * §3.2 gives it three values and no more: white fill, a `slate-5` hairline,
 * and §4.2's 10px card radius. **No shadow.** The old `.card` utility carries a
 * double drop shadow; a shadow is depth used as decoration, which §3.4 bans
 * outright, and on a `slate-3` canvas a hairline already separates the surface.
 *
 * `padding="none"` exists for one reason: a card whose whole body is a table
 * must let the rows touch the edge, or every row is inset by 16px and the
 * sticky header no longer meets the card's corner. Nothing else may use it.
 */
import type { ReactNode } from "react";

export default function Card({
  padding = "normal",
  children,
}: {
  padding?: "normal" | "none";
  children: ReactNode;
}) {
  return (
    <div
      data-kit="card"
      className={`bg-white border border-kit-slate-5 rounded-card ${
        padding === "normal" ? "p-4" : ""
      }`}
    >
      {children}
    </div>
  );
}
