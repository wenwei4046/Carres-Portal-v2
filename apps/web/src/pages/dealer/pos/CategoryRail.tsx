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
 * Frame / Sofa / Add-ons" with per-entry counts. Active entry fills ink-black
 * (same token logic as the catalog `CategoryChip`, vertical layout). Locked
 * entries grey out with a 🔒 per the sofa-mutex rule.
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
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors ${
              e.locked
                ? "text-base-400 cursor-not-allowed"
                : isActive
                  ? "bg-base-900 text-white"
                  : "text-base-700 hover:bg-base-100"
            }`}
          >
            <span className="w-4 text-center text-[13px]">{e.locked ? "🔒" : e.icon}</span>
            <span className="t-small font-semibold flex-1 truncate">{e.label}</span>
            <span
              className={`font-mono text-[11px] ${
                isActive ? "text-white/70" : "text-base-400"
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
