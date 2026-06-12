import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useOperationOrders } from "@/lib/queries";
import { cjkClassName } from "@/lib/cjk";
import { locationForAddress } from "@/lib/region";

/**
 * CalendarPanel — right-rail Calendar (Jess COO ask): a month grid showing how
 * many customer deliveries fall on each day (from orders.delivery_date). Click
 * a day to list that day's orders. Read-only — no new API (reuses the orders
 * feed already cached by the Orders page).
 */
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarPanel() {
  const { data } = useOperationOrders();
  const orders = useMemo(() => data?.orders ?? [], [data]);

  // Bucket orders by delivery_date (skip TBD / null).
  const byDay = useMemo(() => {
    const m = new Map<string, typeof orders>();
    for (const o of orders) {
      if (o.delivery_date_tbd || !o.delivery_date) continue;
      const key = o.delivery_date.slice(0, 10);
      const arr = m.get(key) ?? [];
      arr.push(o);
      m.set(key, arr);
    }
    return m;
  }, [orders]);

  const today = new Date();
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState<string | null>(ymd(today));

  // Build the calendar grid (weeks of the current view month, padded).
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const startPad = first.getDay(); // 0=Sun
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const out: ({ day: number; key: string } | null)[] = [];
    for (let i = 0; i < startPad; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      out.push({ day: d, key: ymd(new Date(view.y, view.m, d)) });
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [view]);

  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const todayKey = ymd(today);
  const selectedOrders = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <div className="flex flex-col h-full">
      {/* Month nav */}
      <div className="flex items-center justify-between px-1 mb-2">
        <button
          type="button"
          onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}
          className="p-1 rounded text-base-500 hover:bg-base-100"
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="t-h4 text-base-900">{monthLabel}</div>
        <button
          type="button"
          onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}
          className="p-1 rounded text-base-500 hover:bg-base-100"
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-base-400 uppercase">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} />;
          const count = byDay.get(cell.key)?.length ?? 0;
          const isToday = cell.key === todayKey;
          const isSel = cell.key === selected;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(cell.key)}
              title={count > 0 ? `${count} deliver${count === 1 ? "y" : "ies"}` : undefined}
              className="relative aspect-square flex items-center justify-center rounded-full hover:bg-base-100 transition-colors"
            >
              <span
                className={`w-7 h-7 grid place-items-center rounded-full text-[12px] ${
                  isToday
                    ? "bg-primary text-white font-semibold"
                    : isSel
                      ? "ring-1 ring-base-900 text-base-900 font-semibold"
                      : "text-base-700"
                }`}
              >
                {cell.day}
              </span>
              {count > 0 && (
                <span className="absolute bottom-0.5 flex gap-0.5">
                  {Array.from({ length: Math.min(count, 3) }).map((_, di) => (
                    <span
                      key={di}
                      className={`w-1 h-1 rounded-full ${isToday ? "bg-white" : "bg-primary"}`}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day's deliveries */}
      <div className="mt-3 pt-3 border-t border-base-200 flex-1 overflow-auto">
        <div className="t-micro text-base-500 mb-2">
          {selected
            ? `${selectedOrders.length} deliver${selectedOrders.length === 1 ? "y" : "ies"} · ${selected.slice(5)}`
            : "Pick a day"}
        </div>
        {selectedOrders.length === 0 ? (
          <div className="text-[12px] text-base-400 text-center py-6">No deliveries this day.</div>
        ) : (
          <div className="space-y-1.5">
            {selectedOrders.map((o) => {
              const loc = locationForAddress(o.customer_address ?? null);
              return (
                <div key={o.id} className="flex gap-2 rounded bg-base-50 hover:bg-base-100 px-2 py-1.5 transition-colors">
                  <span className="w-1 rounded-full bg-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12px] font-semibold text-base-900">SO-{o.so}</span>
                      {loc.label && (
                        <span
                          className={`text-[11px] font-medium ${
                            loc.area === "KV" ? "text-success" : loc.area === "Outstation" ? "text-warning" : "text-base-500"
                          }`}
                        >
                          {loc.label}
                        </span>
                      )}
                    </div>
                    <div className={`text-[12px] text-base-700 truncate ${cjkClassName(o.customer_name)}`}>
                      {o.customer_name || "—"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
