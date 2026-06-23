import { Lock } from "lucide-react";

export type RailKey = "all" | "mattress" | "bedframe" | "sofa" | "addons";

export interface RailEntry {
  key: RailKey;
  label: string;
  count: number;
  icon: string;
  /** Locked by the sofa ↔ mattress/bedframe mutex (cart already has the
   *  opposing family). Greyed + non-clickable. */
  locked?: boolean;
}

/**
 * Left category rail for the POS catalog — "All products / Mattress / Bed
 * Frame / Sofa / Add-ons" with per-entry counts. Active entry = flame text +
 * flame left-accent bar. Locked entries = grey + Lucide Lock icon (stroke
 * 1.75) — sofa-mutex. Counts + mutex bounce logic: UNCHANGED.
 */
export default function CategoryRail({
  entries,
  active,
  onSelect,
}: {
  entries: RailEntry[];
  active: RailKey;
  onSelect: (key: RailKey) => void;
}) {
  return (
    <nav aria-label="Product categories" className="flex flex-col gap-0.5">
      <p className="label px-3 mb-2">Categories</p>
      {entries.map((e) => {
        const isActive = e.key === active;
        return (
          <button
            key={e.key}
            type="button"
            onClick={() => !e.locked && onSelect(e.key)}
            disabled={e.locked}
            aria-pressed={isActive}
            aria-disabled={e.locked}
            title={
              e.locked
                ? "Locked — this order already has a conflicting product family"
                : undefined
            }
            data-testid={`pos-rail-${e.key}`}
            className={[
              "relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors",
              e.locked
                ? "text-base-300 cursor-not-allowed"
                : isActive
                  ? "text-primary bg-primary/6 font-semibold"
                  : "text-base-600 hover:bg-base-100",
            ].join(" ")}
          >
            {/* Flame left-accent bar for active entry */}
            {isActive && !e.locked && (
              <span
                className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-primary"
                aria-hidden="true"
              />
            )}

            <span className="w-4 text-center text-[13px] select-none flex items-center justify-center">
              {e.locked ? (
                <Lock size={13} strokeWidth={1.75} />
              ) : (
                <span>{e.icon}</span>
              )}
            </span>
            <span className="t-small flex-1 truncate">{e.label}</span>
            <span
              className={`font-mono text-[11px] tabular-nums ${
                isActive ? "text-primary/70" : "text-base-400"
              }`}
            >
              {e.count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
