/**
 * Card — the white surface (UI-KIT §6, card D0.5a).
 *
 * v4 (01 §3, 9 Oct 2026) gives it four values and no more: white fill, a 1px
 * `--c-card-border` hairline, the 8px corner and 14 × 16 padding. **No shadow.** The old `.card` utility carries a
 * double drop shadow; a shadow is depth used as decoration, which §3.4 bans
 * outright, and on a `slate-3` canvas a hairline already separates the surface.
 *
 * `padding="none"` exists for one reason: a card whose whole body is a table
 * must let the rows touch the edge, or every row is inset by the padding and the
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
      className={`bg-c-card border border-c-card-border rounded-lg ${
        padding === "normal" ? "[padding:var(--card-pad)]" : ""
      }`}
    >
      {children}
    </div>
  );
}
