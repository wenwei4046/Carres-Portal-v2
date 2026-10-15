/**
 * Segmented — the kit's segmented control (01 §3, owner 11 Oct 2026) for a
 * page's view toggles, rows-per-page and quick modes. It draws the same
 * track and segments as the shell's tabs (`components/kit/Tabs`), so the
 * Portal has one segmented control. NOT for status (pills) and NOT for
 * actions (buttons).
 *
 * `value` may be null (Delivery Monitor, 2026-09-07): the control stays on
 * screen while a different projection shows — no segment lit — so the way
 * back is always one click.
 */
import { Link } from "react-router-dom";
import { SEGMENT, SEGMENT_OFF, SEGMENT_ON, SEGMENTED_TRACK } from "@/components/kit/Tabs";

/* The one recipe, shared by both exports below so the two can never drift. */
const RAIL = `${SEGMENTED_TRACK} shrink-0`;
const CHIP = `${SEGMENT} transition-colors`;
const CHIP_ON = SEGMENT_ON;
const CHIP_OFF = SEGMENT_OFF;

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
