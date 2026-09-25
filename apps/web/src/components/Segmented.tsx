/**
 * Segmented — THE one segmented-control recipe (UI-KIT v4 §10, locked
 * 2026-07-16; ported from the POS size-chip rail, neutralised).
 *
 * Grey pill CONTAINER (base-100, radius 999, 2px inset) + the ACTIVE option
 * as a WHITE chip floating on it (content brighter than container — the
 * locked layering rule). Use for view toggles (Grouped/Flat), rows-per-page,
 * quick modes. NOT for status (pills) and NOT for actions (Btn).
 *
 * `value` may be null (Delivery Monitor, 2026-09-07): the control stays on
 * screen while a different projection shows — no chip lit — so the way back
 * is always one click. Every existing caller passes a value and is unchanged.
 */
import { Link } from "react-router-dom";

/* The one recipe, shared by both exports below so the two can never drift. */
const RAIL = "inline-flex items-center gap-0.5 bg-base-100 rounded-full p-0.5 h-8 shrink-0";
const CHIP = "h-7 px-3 rounded-full text-meta font-semibold whitespace-nowrap transition-colors";
const CHIP_ON = "bg-white text-base-900 shadow-sm";
const CHIP_OFF = "text-base-500 hover:text-base-800";

export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  testId,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  ariaLabel: string;
  testId?: string;
}) {
  return (
    <div
      className={RAIL}
      role="tablist"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            data-testid={testId ? `${testId}-${o.value}` : undefined}
            className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The same control when each choice is its own page: every choice is a real
 * link (so it opens in a new tab and shows its address), and the current page
 * is the white chip — plain text, not a link, because clicking it goes nowhere.
 */
export function SegmentedLinks<T extends string>({
  options,
  value,
  ariaLabel,
  testId,
}: {
  options: readonly { value: T; label: string; to: string }[];
  value: T;
  ariaLabel: string;
  testId?: string;
}) {
  return (
    <nav className={RAIL} aria-label={ariaLabel} data-testid={testId}>
      {options.map((o) =>
        o.value === value
          ? (
            <span key={o.value} aria-current="page" className={`${CHIP} inline-flex items-center ${CHIP_ON}`}>
              {o.label}
            </span>
          )
          : (
            <Link key={o.value} to={o.to} className={`${CHIP} inline-flex items-center ${CHIP_OFF}`}>
              {o.label}
            </Link>
          ),
      )}
    </nav>
  );
}
