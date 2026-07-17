/**
 * Money — THE money display recipe (UI-KIT v4 §3, locked 2026-07-16; the POS
 * "LIVE TOTAL" pattern). The currency marker is META (tiny, muted, uppercase);
 * the DIGITS are content (bold, ink, slashed-zero mono). Never render "RM"
 * at the same size/colour as the amount.
 *
 * Tones: hero 20/700 (Outstanding, live totals) · lg 16/700 (KPI headline) ·
 * md 13/600 (money rows, ledgers) · sm 11/600 (band summaries).
 * Colour: the wrapper inherits/accepts a colour for the DIGITS (e.g.
 * text-danger on delivery-eve); the RM marker stays muted always.
 */
// SIZING LAW (MASTER SPEC §3, final 2026-07-18): money has exactly TWO
// recipes — 18 mono hero · 13 tabular row. 20/16/15/12 are deleted.
type Tone = "hero" | "row";

const DIGITS: Record<Tone, string> = {
  hero: "text-[18px] font-bold leading-none",
  row: "text-[13px] font-semibold",
};

const MARK: Record<Tone, string> = {
  hero: "text-[10px]",
  row: "text-[9px]",
};

/** "1,749" — thousands-separated, no decimals (matches the drawer's RM()). */
function fmt(n: number): string {
  return Math.round(Number(n) || 0).toLocaleString("en-MY");
}

export default function Money({
  value,
  tone = "row",
  className = "",
}: {
  value: number;
  tone?: Tone;
  /** Colour/extra classes for the DIGITS (the RM marker stays muted). */
  className?: string;
}) {
  return (
    <span className={`inline-flex items-baseline gap-1 whitespace-nowrap ${className}`}>
      <span
        className={`font-semibold uppercase tracking-[0.06em] text-[#A8A8A8] ${MARK[tone]}`}
        aria-hidden="true"
      >
        RM
      </span>
      <span className={`font-mono tabular-nums ${DIGITS[tone]}`}>{fmt(value)}</span>
    </span>
  );
}
