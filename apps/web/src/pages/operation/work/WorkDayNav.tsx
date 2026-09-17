import Badge from "@/components/kit/Badge";

export interface WorkDayChoice {
  key: string;
  label: string;
  count: number;
  note?: string;
  /** A public holiday: named, never counted, never chosen. */
  holiday?: string;
}

export default function WorkDayNav({
  days,
  value,
  onChange,
}: {
  days: readonly WorkDayChoice[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <nav aria-label="Working day" className="no-scrollbar flex overflow-x-auto border-b border-kit-slate-5 bg-white">
      {days.map((day) => {
        if (day.holiday) {
          return (
            <div key={day.key} data-holiday={day.key} className="min-h-10 min-w-28 shrink-0 px-3 py-2 text-left">
              <span className="block text-body font-medium text-kit-slate-11">{day.label}</span>
              <span className="mt-1 block text-meta text-kit-slate-11">Public holiday · {day.holiday}</span>
            </div>
          );
        }
        const selected = day.key === value;
        return (
          <button
            key={day.key}
            type="button"
            aria-pressed={selected}
            aria-label={`${day.label} · ${day.count} ${day.count === 1 ? "action" : "actions"}`}
            onClick={() => onChange(day.key)}
            className={`min-h-10 min-w-28 shrink-0 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-kit-blue-9 ${selected ? "bg-kit-blue-3 shadow-[inset_0_-2px_0_var(--blue-9)]" : "hover:bg-kit-slate-3"}`}
          >
            <span className="flex items-center justify-between gap-2 text-body font-medium text-kit-slate-12">
              {day.label}<Badge>{day.count}</Badge>
            </span>
            {day.note ? <span className="mt-1 block text-meta text-kit-slate-11">{day.note}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
