/**
 * StatusPill — the one status renderer (v4 owner instruction 9 Oct 2026,
 * `docs/01-design-tokens.md` §1 · §3). Soft fill, dark ink, the FULL word:
 * pad 3 × 10, 12 / 500, round, never wrapped and never cut off. Business
 * labels and tones belong to callers.
 *
 * `hold` is the one dark pill (Finance hold: charcoal, white words). Every
 * other status is a soft pair; no solid white text pill remains.
 */
import type { ReactNode } from "react";
import type { OrderActionTone } from "@carres/shared";
import { HOLD_PILL_CLASS, STATUS_PILL_CLASS } from "./tokens";

/** Pill geometry shared with `Badge`: the `--pill-pad` token, 12 / 500. */
export const PILL_SHAPE =
  "inline-flex shrink-0 items-center whitespace-nowrap rounded-full [padding:var(--pill-pad)] text-meta font-medium";

export default function StatusPill({ tone, hold = false, children }: {
  tone: OrderActionTone;
  /** Finance hold: the one dark pill. The tone is still reported. */
  hold?: boolean;
  children: ReactNode;
}) {
  return (
    <span data-kit="status-pill" data-tone={tone} data-hold={hold || undefined}
      className={`${PILL_SHAPE} ${hold ? HOLD_PILL_CLASS : STATUS_PILL_CLASS[tone]}`}>
      {children}
    </span>
  );
}
