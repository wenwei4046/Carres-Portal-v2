import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  carrierDayLoads,
  carrierDayNote,
  daysInRange,
  dayWord,
  deliveryRange,
  DELIVERY_RANGE_KEYS,
  inRange,
  partnerDeliveryRules,
  purchasingActionQueue,
  type CarrierDayLoad,
  type DayBooking,
  type DeliveryRangeKey,
  type PartnerDeliveryRules,
} from "@carres/shared";
import {
  useOperationOrders,
  usePurchaseToday,
  useOperationSuppliers,
  useDeliveryPartners,
  type operationOrderListRow,
} from "@/lib/queries";
import { orderBookingDay } from "@/lib/order-booking";
import { cjkClassName } from "@/lib/cjk";
import { locationForAddress } from "@/lib/region";
import { fmtDateShort } from "@/lib/fmt-date";

/**
 * CalendarPanel — right-rail Calendar (Jess COO ask, extended 2026-07-23):
 * a month grid with tab-filtered activity from BOTH the customer-delivery
 * side and the supplier procurement side (Send POs by order-by · confirm by
 * expected-ready · Receive by ETA). Tabs let the operator see a single lens
 * without leaving the panel. Read-only — no new API (reuses purchase-today +
 * orders queries already cached by their pages).
 *
 * **T10 (delivery calendar as single source, 2026-07-27):** the Deliveries lens
 * used to bucket orders by `orders.delivery_date` — the date we PROMISED the
 * customer. That is not when a truck moves. Since D1 (0277) the truck's day is
 * the BOOKING (`booking_stage` + `confirmed_date`, with `logistic_eta` as the
 * logistics company's provisional word), and the two diverge the moment anything is
 * rescheduled — which is the entire reason D1 split them. So the lens now reads
 * the booking through the same `orderBookingDay` adapter the Orders list's
 * Delivery column reads: never a second store.
 *
 * The promise did not disappear from the screen. A day with an order promised
 * on it and nothing booked is real work — it is simply not a delivery, so it
 * never counts as one. It is listed as what it is, under the call that fixes it.
 *
 * Today / Tomorrow / This week (T10) select a RANGE of days; clicking a day in
 * the grid selects that one day. Exactly one of the two is active at a time.
 */
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

type CalTab = "all" | "send" | "chase" | "receive" | "deliveries";
// C1 (Jess 2026-07-27): "Chase" is banned. The lens is the Purchase panel's
// second stage, whose word is `Confirm ready date` — the same one the Orders
// queue rail uses, so the two never spell one action differently. The tab KEY
// stays `chase` (internal, and it is in the URL nowhere).
// R8 (2026-07-28) finished what C1 started on this map, and the DEPLOY GREP is
// what found it: `send` and `receive` were still the panel's own words while
// `chase` had already been re-pointed at the dictionary. `Receive` as a verb is
// banned outright, so the rail beside the To Order tab was saying `Receive`
// while the tab itself said `Check in`. All three lenses read the mirror now.
const TAB_LABEL: Record<CalTab, string> = {
  all: "All",
  // The lens is the To Order tab's FIRST stage, and its word is `Issue PO`
  // (`Send PO` is retired, and the verb `Send` with it). The tab KEY stays
  // `send` — internal, and it is in the URL nowhere.
  send: purchasingActionQueue("issue_po"),
  chase: purchasingActionQueue("confirm_ready_date"),
  receive: purchasingActionQueue("check_in"),
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

/** One booked delivery, as the calendar shows it. */
interface DayDelivery extends DayBooking {
  orderId: string;
  so: number;
  customer: string;
  slot: string | null;
  address: string | null;
}

export default function CalendarPanel() {
  const { data } = useOperationOrders();
  const orders = useMemo(() => data?.orders ?? [], [data]);
  const { data: purchase } = usePurchaseToday();
  const { data: suppliersData } = useOperationSuppliers();
  const { data: partnersData } = useDeliveryPartners();
  const supplierNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliersData?.suppliers ?? []) m.set(s.id, s.name);
    return m;
  }, [suppliersData]);
  const supplierName = (id: string, fallback: string | null) =>
    fallback?.trim() || supplierNameById.get(id) || id.slice(0, 8);

  // T9 logistics rules, keyed by company. A row that has never been
  // edited normalises to DEFAULT — zero warnings, which is every live company
  // today (silence over a false alarm).
  const rulesByPartner = useMemo(() => {
    const m = new Map<string, PartnerDeliveryRules>();
    for (const p of partnersData?.partners ?? []) {
      m.set(
        p.id,
        partnerDeliveryRules({
          offDays: p.off_days ?? undefined,
          blackoutDates: (p.blackout_dates ?? []).map((d) => String(d).slice(0, 10)),
          dailyCapacity: p.daily_capacity ?? null,
          bookingLeadDays: p.booking_lead_days ?? 0,
        }),
      );
    }
    return m;
  }, [partnersData]);

  const [tab, setTab] = useState<CalTab>("all");

  const carrierOf = (o: operationOrderListRow): { id: string | null; name: string | null } => ({
    id: o.delivery_partner_id ?? o.ops_assigned_logistic ?? null,
    name: o.delivery_partners?.name ?? null,
  });

  // Bucket deliveries by the BOOKING day (T10) — confirmed date when the
  // customer said yes, otherwise the logistics company's provisional date. An order with
  // neither is not on any day; it is a queue item (Assign / confirm the date).
  const deliveriesByDay = useMemo(() => {
    const m = new Map<string, DayDelivery[]>();
    for (const o of orders) {
      const booking = orderBookingDay(o);
      if (booking.kind === "none" || !booking.date) continue;
      const carrier = carrierOf(o);
      const entry: DayDelivery = {
        orderId: o.id,
        so: o.so,
        customer: o.customer_name,
        partnerId: carrier.id,
        partnerName: carrier.name,
        kind: booking.kind,
        date: booking.date,
        slot: booking.slot,
        address: o.customer_address ?? null,
        // No `cancelled` flag to set: the list endpoint filters status IN
        // (place, proceed_order, delivered), so a cancelled order never
        // reaches this panel. `DayBooking.cancelled` exists for callers that
        // read a wider status set.
      };
      const arr = m.get(booking.date) ?? [];
      arr.push(entry);
      m.set(booking.date, arr);
    }
    return m;
  }, [orders]);

  // Promised on this day with NOTHING booked. Not a delivery — never counted as
  // one — but real work sitting on that date, so the day never reads as empty
  // when it isn't.
  const promisedByDay = useMemo(() => {
    const m = new Map<string, operationOrderListRow[]>();
    for (const o of orders) {
      if (o.delivery_date_tbd || !o.delivery_date) continue;
      // A delivered order's promise is kept — it is not outstanding work.
      if (o.status === "delivered") continue;
      if (orderBookingDay(o).kind !== "none") continue;
      const key = o.delivery_date.slice(0, 10);
      const arr = m.get(key) ?? [];
      arr.push(o);
      m.set(key, arr);
    }
    return m;
  }, [orders]);

  // Bucket procurement activity per stage by its keyed date. Send groups → by
  // earliestOrderBy; the ready-date lens → by expectedReadyDate; Receive → by etaDate ??
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
  // The deliveries count is BOOKINGS only — a promised date with nothing booked
  // is not a truck, and painting it as one is exactly the lie T10 removes.
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
  const bookedTotal = useMemo(
    () => [...deliveriesByDay.values()].reduce((n, arr) => n + arr.length, 0),
    [deliveriesByDay],
  );
  const tabTotals = {
    all:
      (purchase?.placeGroups.length ?? 0) +
      (purchase?.chase.length ?? 0) +
      (purchase?.receive.length ?? 0) +
      bookedTotal,
    send: purchase?.placeGroups.length ?? 0,
    chase: purchase?.chase.length ?? 0,
    receive: purchase?.receive.length ?? 0,
    deliveries: bookedTotal,
  };

  const today = new Date();
  const todayKey = ymd(today);
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });
  // T10: exactly ONE of these is active. A range chip clears the picked day; a
  // grid click clears the range. Default = Today, so the panel opens on the
  // question an operator actually has.
  const [range, setRange] = useState<DeliveryRangeKey | null>("today");
  const [picked, setPicked] = useState<string | null>(null);

  const activeRange = range ? deliveryRange(range, todayKey) : null;
  const shownDays = activeRange
    ? daysInRange(activeRange.fromIso, activeRange.toIso)
    : picked
      ? [picked]
      : [];

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

  // Is there anything to show for this day UNDER THE ACTIVE LENS? The
  // "promised, no date yet" block only exists on a lens that shows deliveries,
  // so it must not make a Send-lens day count as occupied — otherwise the range
  // renders neither the day nor the empty line.
  const showsDeliveries = tab === "all" || tab === "deliveries";
  const dayIsEmpty = (d: string) =>
    activeCount(d) === 0 && (!showsDeliveries || (promisedByDay.get(d)?.length ?? 0) === 0);
  const hasAnything = shownDays.some((d) => !dayIsEmpty(d));

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
              className={`shrink-0 flex items-center gap-1 rounded-full px-2 py-1 text-label font-semibold transition-colors ${
                active
                  ? TAB_TONE[t]
                  : "bg-white text-base-500 hover:bg-base-100 border border-base-200"
              }`}
            >
              <span>{TAB_LABEL[t]}</span>
              {n > 0 && (
                <span className="tabular-nums font-semibold">{n > 99 ? "99+" : n}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* T10 range chips — Today / Tomorrow / This week. "This week" is the
          REST of the week, ending Saturday (Sunday is not a delivery day). */}
      <div className="flex gap-1 mb-2" data-testid="calendar-ranges">
        {DELIVERY_RANGE_KEYS.map((key) => {
          const r = deliveryRange(key, todayKey);
          const active = range === key;
          const n = daysInRange(r.fromIso, r.toIso).reduce((s, d) => s + activeCount(d), 0);
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setRange(key);
                setPicked(null);
                // Jump the grid to the month the range lives in.
                const [y, m] = r.fromIso.split("-").map(Number);
                if (y && m) setView({ y, m: m - 1 });
              }}
              title={
                r.fromIso === r.toIso
                  ? fmtDateShort(r.fromIso)
                  : `${fmtDateShort(r.fromIso)} – ${fmtDateShort(r.toIso)}`
              }
              className={`flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-label font-semibold transition-colors ${
                active
                  ? "bg-base-900 text-white"
                  : "bg-white text-base-500 border border-base-200 hover:bg-hovertint"
              }`}
            >
              <span>{r.label}</span>
              {n > 0 && <span className="tabular-nums font-semibold">{n > 99 ? "99+" : n}</span>}
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
        <div className="text-strong text-base-900">{monthLabel}</div>
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
          <div key={i} className="text-center text-label font-semibold text-base-400 uppercase">
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
          const isSel = activeRange
            ? inRange(cell.key, activeRange)
            : cell.key === picked;
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
              onClick={() => {
                setPicked(cell.key);
                setRange(null);
              }}
              title={count > 0 ? `${count} ${TAB_LABEL[tab].toLowerCase()}` : undefined}
              className={`aspect-square flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${
                isSel ? "bg-base-100" : "hover:bg-base-100"
              }`}
            >
              <span
                className={`w-6 h-6 grid place-items-center rounded-full text-meta ${
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
                className={`h-3.5 min-w-[16px] px-1 grid place-items-center rounded-full text-label font-semibold leading-none ${countTone}`}
              >
                {count > 0 ? count : "0"}
              </span>
            </button>
          );
        })}
      </div>

      {/* The days themselves — one block per day in the active range (or the
          one picked day). Content adapts to the active tab. */}
      <div className="mt-3 pt-3 border-t border-base-200 flex-1 overflow-auto space-y-4">
        {shownDays.length === 0 && (
          <div className="text-meta text-base-400 text-center py-4">
            Pick a day, or Today / Tomorrow / This week.
          </div>
        )}
        {shownDays.length > 1 && !hasAnything && (
          <div className="text-meta text-base-400 text-center py-4">
            Nothing on the books for these days.
          </div>
        )}
        {shownDays.map((day) => {
          const dayDeliveries = deliveriesByDay.get(day) ?? [];
          const dayPromised = promisedByDay.get(day) ?? [];
          const daySend = sendByDay.get(day) ?? [];
          const dayChase = chaseByDay.get(day) ?? [];
          const dayReceive = receiveByDay.get(day) ?? [];
          // On a multi-day range an empty day is noise; on ONE day it is the
          // answer ("nothing that day") and must still be said out loud.
          if (shownDays.length > 1 && dayIsEmpty(day)) return null;
          const word = dayWord(day, todayKey);
          const loads = carrierDayLoads(dayDeliveries, day, rulesByPartner);
          return (
            <div key={day} data-testid={`calendar-day-${day}`}>
              <div className="text-label uppercase tracking-[0.05em] text-base-500 mb-2">
                {word ? `${word} · ${fmtDateShort(day)}` : fmtDateShort(day)}
              </div>

              {(tab === "all" || tab === "send") && (
                <DaySection
                  title={TAB_LABEL.send}
                  tone="text-danger"
                  empty="No POs to send this day."
                  items={daySend.map((s) => ({
                    key: `s-${s.supplierId}`,
                    main: supplierName(s.supplierId, s.supplierName),
                    sub: `${s.units} unit${s.units === 1 ? "" : "s"} · send by today`,
                  }))}
                />
              )}
              {(tab === "all" || tab === "chase") && (
                <DaySection
                  title={TAB_LABEL.chase}
                  tone="text-warning"
                  empty="No supplier to call about a ready date this day."
                  items={dayChase.map((r) => ({
                    key: `c-${r.poId}`,
                    main: `${r.poId} · ${supplierName(r.supplierId, null)}`,
                    sub: `${r.units} unit${r.units === 1 ? "" : "s"} · past promised ready`,
                  }))}
                />
              )}
              {(tab === "all" || tab === "receive") && (
                <DaySection
                  title={TAB_LABEL.receive}
                  tone="text-success"
                  empty="Nothing arriving this day."
                  items={dayReceive.map((r) => ({
                    key: `r-${r.poId}`,
                    main: `${r.poId} · ${supplierName(r.supplierId, null)}`,
                    sub: `${r.units} unit${r.units === 1 ? "" : "s"} · ETA today`,
                  }))}
                />
              )}
              {showsDeliveries && (
                <div className="space-y-1.5">
                  <div className="text-label uppercase tracking-[0.05em] text-info">Deliveries</div>
                  {dayDeliveries.length === 0 ? (
                    <div className="text-meta text-base-400 text-center py-3">
                      No deliveries booked this day.
                    </div>
                  ) : (
                    dayDeliveries.map((d) => <DeliveryRow key={d.orderId} d={d} />)
                  )}
                  {loads.map((l) => (
                    <CarrierLoadRow key={l.partnerId ?? "none"} load={l} />
                  ))}
                  {dayPromised.length > 0 && (
                    <div className="pt-1.5 space-y-1.5">
                      <div className="text-label uppercase tracking-[0.05em] text-warning">Promised this day, no date yet</div>
                      {dayPromised.map((o) => (
                        <div
                          key={o.id}
                          className="flex gap-2 rounded bg-base-50 px-2 py-1.5"
                          title="The customer was promised this day but no delivery is booked yet."
                        >
                          <span className="w-1 rounded-full bg-warning shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="font-mono text-meta font-semibold text-base-900">
                              SO-{o.so}
                            </div>
                            <div className="text-label text-base-500 truncate">
                              Call {o.customer_name?.trim() || "the customer"} — book delivery date
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One booked delivery. Confirmed is the ONLY green (T1): the customer said
 *  yes. The carrier's own date is amber — a date nobody has agreed to. */
function DeliveryRow({ d }: { d: DayDelivery }) {
  const confirmed = d.kind === "confirmed";
  const loc = locationForAddress(d.address);
  const carrier = d.partnerName?.trim() || "No logistics picked";
  return (
    <div
      className="flex gap-2 rounded bg-base-50 hover:bg-base-100 px-2 py-1.5 transition-colors"
      title={
        confirmed
          ? "The customer confirmed this date."
          : "Only logistics have given this date — not confirmed with the customer yet."
      }
    >
      <span className={`w-1 rounded-full shrink-0 ${confirmed ? "bg-success" : "bg-warning"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-meta font-semibold text-base-900">SO-{d.so}</span>
          <span
            className={`text-label font-semibold shrink-0 ${confirmed ? "text-success" : "text-warning"}`}
          >
            {confirmed ? (d.slot ? shortSlot(d.slot) : "Confirmed") : "Logistics' date"}
          </span>
        </div>
        <div className={`text-meta text-base-700 truncate ${cjkClassName(d.customer)}`}>
          {d.customer || "—"}
        </div>
        <div className="text-label text-base-500 truncate">
          {carrier}
          {loc.label ? ` · ${loc.label}` : ""}
        </div>
      </div>
    </div>
  );
}

/** "Afternoon (12pm–3pm)" → "12pm–3pm" — the drawer's short-slot read. */
function shortSlot(slot: string): string {
  return /\(([^)]+)\)/.exec(slot)?.[1] ?? slot;
}

/** What a carrier is carrying that day, plus the one sentence its own rules
 *  earn (T9). Silence is the normal case: a carrier with no rules recorded
 *  shows its load and says nothing. */
function CarrierLoadRow({ load }: { load: CarrierDayLoad }) {
  const note = carrierDayNote(load);
  const alert = !load.runs || load.atLimit;
  return (
    <div className="px-2 pt-1">
      <div
        className={`flex items-center justify-between gap-2 text-label ${
          alert ? "text-warning font-semibold" : "text-base-500"
        }`}
      >
        <span className="truncate">{load.partnerName}</span>
        <span className="tabular-nums shrink-0">
          {load.capacity != null
            ? `${load.confirmed} of ${load.capacity}`
            : `${load.confirmed + load.provisional}`}
        </span>
      </div>
      {note && <div className="text-label text-warning mt-0.5">{note}</div>}
    </div>
  );
}

// Section renderer used by Send/Chase/Receive lists (the delivery lens keeps
// its own richer layout because it carries carrier + slot + region).
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
    <div className="mb-3">
      <div className={`text-label uppercase tracking-[0.05em] mb-1.5 ${tone}`}>{title}</div>
      {items.length === 0 ? (
        <div className="text-meta text-base-400 text-center py-3">{empty}</div>
      ) : (
        <div className="space-y-1.5">
          {items.map((it) => (
            <div key={it.key} className="flex gap-2 rounded bg-base-50 hover:bg-base-100 px-2 py-1.5 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-meta font-semibold text-base-900 truncate">
                  {it.main}
                </div>
                <div className="text-label text-base-500 truncate">{it.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
