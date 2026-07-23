import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useOperationOrders,
  usePurchaseToday,
  useOperationSuppliers,
} from "@/lib/queries";
import { cjkClassName } from "@/lib/cjk";
import { locationForAddress } from "@/lib/region";
import { fmtDateShort } from "@/lib/fmt-date";

/**
 * CalendarPanel — right-rail Calendar (Jess COO ask, extended 2026-07-23):
 * a month grid with tab-filtered activity from BOTH the customer-delivery
 * side (orders.delivery_date) and the supplier procurement side (Send POs
 * by order-by · Chase by expected-ready · Receive by ETA). Tabs let the
 * operator see a single lens (all / send / chase / receive / deliveries)
 * without leaving the panel. Click a day to list that day's items under
 * the selected tab. Read-only — no new API (reuses purchase-today +
 * orders queries already cached by their pages).
 */
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

type CalTab = "all" | "send" | "chase" | "receive" | "deliveries";
const TAB_LABEL: Record<CalTab, string> = {
  all: "All",
  send: "Send",
  chase: "Chase",
  receive: "Receive",
  deliveries: "Deliveries",
};
const TAB_TONE: Record<CalTab, string> = {
  all: "bg-base-100 text-base-800",
  send: "bg-error-soft text-danger",
  chase: "bg-warning-soft text-warning",
  receive: "bg-success-soft text-success",
  deliveries: "bg-info-soft text-info",
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarPanel() {
  const { data } = useOperationOrders();
  const orders = useMemo(() => data?.orders ?? [], [data]);
  const { data: purchase } = usePurchaseToday();
  const { data: suppliersData } = useOperationSuppliers();
  const supplierNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliersData?.suppliers ?? []) m.set(s.id, s.name);
    return m;
  }, [suppliersData]);
  const supplierName = (id: string, fallback: string | null) =>
    fallback?.trim() || supplierNameById.get(id) || id.slice(0, 8);

  const [tab, setTab] = useState<CalTab>("all");

  // Bucket customer deliveries by delivery_date (skip TBD / null).
  const deliveriesByDay = useMemo(() => {
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

  // Bucket procurement activity per stage by its keyed date. Send groups → by
  // earliestOrderBy; Chase → by expectedReadyDate; Receive → by etaDate ??
  // expectedReadyDate. Empty maps when purchase data hasn't loaded yet — the
  // grid stays functional on the deliveries tab regardless.
  const sendByDay = useMemo(() => {
    const m = new Map<string, Array<{ supplierId: string; supplierName: string | null; units: number }>>();
    for (const g of purchase?.placeGroups ?? []) {
      if (!g.earliestOrderBy) continue;
      const key = g.earliestOrderBy.slice(0, 10);
      const arr = m.get(key) ?? [];
      arr.push({ supplierId: g.supplierId, supplierName: g.supplierName, units: g.totalUnits });
      m.set(key, arr);
    }
    return m;
  }, [purchase]);
  const chaseByDay = useMemo(() => {
    const m = new Map<string, Array<{ poId: string; supplierId: string; units: number }>>();
    for (const r of purchase?.chase ?? []) {
      if (!r.expectedReadyDate) continue;
      const key = r.expectedReadyDate.slice(0, 10);
      const arr = m.get(key) ?? [];
      const units = r.items.reduce((s, it) => s + it.outstanding, 0);
      arr.push({ poId: r.poId, supplierId: r.supplierId, units });
      m.set(key, arr);
    }
    return m;
  }, [purchase]);
  const receiveByDay = useMemo(() => {
    const m = new Map<string, Array<{ poId: string; supplierId: string; units: number }>>();
    for (const r of purchase?.receive ?? []) {
      const iso = r.etaDate ?? r.expectedReadyDate;
      if (!iso) continue;
      const key = iso.slice(0, 10);
      const arr = m.get(key) ?? [];
      const units = r.items.reduce((s, it) => s + it.outstanding, 0);
      arr.push({ poId: r.poId, supplierId: r.supplierId, units });
      m.set(key, arr);
    }
    return m;
  }, [purchase]);

  // Per-tab active count-per-day map + per-tab totals for the header badges.
  const activeCount = (key: string): number => {
    if (tab === "send") return sendByDay.get(key)?.length ?? 0;
    if (tab === "chase") return chaseByDay.get(key)?.length ?? 0;
    if (tab === "receive") return receiveByDay.get(key)?.length ?? 0;
    if (tab === "deliveries") return deliveriesByDay.get(key)?.length ?? 0;
    // all = sum
    return (
      (sendByDay.get(key)?.length ?? 0) +
      (chaseByDay.get(key)?.length ?? 0) +
      (receiveByDay.get(key)?.length ?? 0) +
      (deliveriesByDay.get(key)?.length ?? 0)
    );
  };
  const tabTotals = {
    all:
      (purchase?.placeGroups.length ?? 0) +
      (purchase?.chase.length ?? 0) +
      (purchase?.receive.length ?? 0) +
      deliveriesByDay.size,
    send: purchase?.placeGroups.length ?? 0,
    chase: purchase?.chase.length ?? 0,
    receive: purchase?.receive.length ?? 0,
    deliveries: orders.filter((o) => !o.delivery_date_tbd && o.delivery_date).length,
  };

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
  const selectedDeliveries = selected ? (deliveriesByDay.get(selected) ?? []) : [];
  const selectedSend = selected ? (sendByDay.get(selected) ?? []) : [];
  const selectedChase = selected ? (chaseByDay.get(selected) ?? []) : [];
  const selectedReceive = selected ? (receiveByDay.get(selected) ?? []) : [];

  return (
    <div className="flex flex-col h-full">
      {/* Tab strip — filter the grid + selected-day list to one lens
          (Jess 2026-07-23 · "tabs to show each title job") */}
      <div className="flex gap-1 mb-2 overflow-x-auto">
        {(["all", "send", "chase", "receive", "deliveries"] as CalTab[]).map((t) => {
          const active = tab === t;
          const n = tabTotals[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`shrink-0 flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold transition-colors ${
                active
                  ? TAB_TONE[t]
                  : "bg-white text-base-500 hover:bg-base-100 border border-base-200"
              }`}
            >
              <span>{TAB_LABEL[t]}</span>
              {n > 0 && (
                <span className="tabular-nums font-bold">{n > 99 ? "99+" : n}</span>
              )}
            </button>
          );
        })}
      </div>

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
          const count = activeCount(cell.key);
          const isToday = cell.key === todayKey;
          const isSel = cell.key === selected;
          // Per-tab dot tone matches the tab pill for visual consistency.
          const countTone =
            count === 0
              ? "text-transparent"
              : tab === "send"
                ? "bg-error-soft text-danger"
                : tab === "chase"
                  ? "bg-warning-soft text-warning"
                  : tab === "receive"
                    ? "bg-success-soft text-success"
                    : tab === "deliveries"
                      ? "bg-info-soft text-info"
                      : "bg-base-100 text-base-800";
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(cell.key)}
              title={count > 0 ? `${count} ${TAB_LABEL[tab].toLowerCase()}` : undefined}
              className="aspect-square flex flex-col items-center justify-center gap-0.5 rounded-lg hover:bg-base-100 transition-colors"
            >
              <span
                className={`w-6 h-6 grid place-items-center rounded-full text-[12px] ${
                  isToday
                    ? "ring-1 ring-primary text-primary font-semibold"
                    : isSel
                      ? "ring-1 ring-base-900 text-base-900 font-semibold"
                      : "text-base-700"
                }`}
              >
                {cell.day}
              </span>
              <span
                className={`h-3.5 min-w-[16px] px-1 grid place-items-center rounded-full text-[10px] font-bold leading-none ${countTone}`}
              >
                {count > 0 ? count : "0"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected day list — content adapts to the active tab. Each section
          only renders when the tab includes it (all = everything). */}
      <div className="mt-3 pt-3 border-t border-base-200 flex-1 overflow-auto space-y-3">
        <div className="t-micro text-base-500">
          {selected ? fmtDateShort(selected) : "Pick a day"}
        </div>

        {(tab === "all" || tab === "send") && (
          <DaySection
            title="Send POs"
            tone="text-danger"
            empty="No POs to send this day."
            items={selectedSend.map((s) => ({
              key: `s-${s.supplierId}`,
              main: supplierName(s.supplierId, s.supplierName),
              sub: `${s.units} unit${s.units === 1 ? "" : "s"} · send by today`,
            }))}
          />
        )}
        {(tab === "all" || tab === "chase") && (
          <DaySection
            title="Chase"
            tone="text-warning"
            empty="No POs to chase this day."
            items={selectedChase.map((r) => ({
              key: `c-${r.poId}`,
              main: `${r.poId} · ${supplierName(r.supplierId, null)}`,
              sub: `${r.units} unit${r.units === 1 ? "" : "s"} · past promised ready`,
            }))}
          />
        )}
        {(tab === "all" || tab === "receive") && (
          <DaySection
            title="Receive"
            tone="text-success"
            empty="Nothing arriving this day."
            items={selectedReceive.map((r) => ({
              key: `r-${r.poId}`,
              main: `${r.poId} · ${supplierName(r.supplierId, null)}`,
              sub: `${r.units} unit${r.units === 1 ? "" : "s"} · ETA today`,
            }))}
          />
        )}
        {(tab === "all" || tab === "deliveries") && (
          <div>
            <div className="t-micro text-info mb-1.5">Customer deliveries</div>
            {selectedDeliveries.length === 0 ? (
              <div className="text-[12px] text-base-400 text-center py-4">
                No deliveries this day.
              </div>
            ) : (
              <div className="space-y-1.5">
                {selectedDeliveries.map((o) => {
                  const loc = locationForAddress(o.customer_address ?? null);
                  return (
                    <div key={o.id} className="flex gap-2 rounded bg-base-50 hover:bg-base-100 px-2 py-1.5 transition-colors">
                      <span className="w-1 rounded-full bg-info shrink-0" />
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
        )}
      </div>
    </div>
  );
}

// Section renderer used by Send/Chase/Receive lists (delivered lens keeps its
// own richer layout because it carries customer name + region tag).
function DaySection({
  title,
  tone,
  empty,
  items,
}: {
  title: string;
  tone: string;
  empty: string;
  items: Array<{ key: string; main: string; sub: string }>;
}) {
  return (
    <div>
      <div className={`t-micro mb-1.5 ${tone}`}>{title}</div>
      {items.length === 0 ? (
        <div className="text-[12px] text-base-400 text-center py-4">{empty}</div>
      ) : (
        <div className="space-y-1.5">
          {items.map((it) => (
            <div key={it.key} className="flex gap-2 rounded bg-base-50 hover:bg-base-100 px-2 py-1.5 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[12px] font-semibold text-base-900 truncate">
                  {it.main}
                </div>
                <div className="text-[11px] text-base-500 truncate">{it.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
