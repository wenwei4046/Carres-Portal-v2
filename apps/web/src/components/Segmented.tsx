/**
 * Segmented — THE one segmented-control recipe (UI-KIT v4 §10, locked
 * 2026-07-16; ported from the POS size-chip rail, neutralised).
 *
 * Grey pill CONTAINER (base-100, radius 999, 2px inset) + the ACTIVE option
 * as a WHITE chip floating on it (content brighter than container — the
 * locked layering rule). Use for view toggles (Grouped/Flat), rows-per-page,
 * quick modes. NOT for status (pills) and NOT for actions (Btn).
 */
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 bg-base-100 rounded-full p-0.5 h-8 shrink-0"
      role="tablist"
      aria-label={ariaLabel}
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
            className={`h-7 px-3 rounded-full text-meta font-semibold whitespace-nowrap transition-colors ${
              on
                ? "bg-white text-base-900 shadow-sm"
                : "text-base-500 hover:text-base-800"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
