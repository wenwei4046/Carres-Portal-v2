import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  carrierDayLoads,
  carrierDayNote,
  daysInRange,
  deliveryRange,
  DELIVERY_RANGE_KEYS,
  inRange,
  partnerDeliveryRules,
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
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { displayCustomerName } from "@/lib/customer-name";

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
 * The three range chips select a RANGE of days; clicking a day in the grid
 * selects that one day. Exactly one of the two is active at a time.
 *
 * **NO RELATIVE DATE WORDS (owner ruling 2026-08-15).** The two single-day
 * chips and every day heading name the actual weekday + date. `Today` and
 * `Tomorrow` are only true on the day they are read — they rot in a
 * screenshot and re-sort themselves overnight — so the delivery word table's
 * existing ban now reaches the rail as well. `This week` stays: it is a SPAN,
 * not a day, and no date can spell it.
 *
 * **The chip now carries the SAME string as every other date (owner ruling
 * 2026-08-15, THE YEAR RULE).** It used to need its own compact spelling
 * because the year would not fit; the year is no longer printed for a
 * current-year date, so the chip's form and the portal's form are one string
 * and `fmtDayChip` is deleted.
 */
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** The chip's own text. A single-day range names its day; the span keeps the
 *  one ruled span word. This is the only place the three chips are worded. */
function rangeChipLabel(key: DeliveryRangeKey, fromIso: string): string {
  return key === "week" ? "This week" : fmtDate(fromIso);
}


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
        customer: displayCustomerName(o.customer_name),
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

  // Receiving is a dated business event. Procurement action queues stay in My Work.
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

  // Calendar counts only authoritative dated events, never action queues.
  const activeCount = (key: string): number => {
    return (receiveByDay.get(key)?.length ?? 0) + (deliveriesByDay.get(key)?.length ?? 0);
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
  const dayIsEmpty = (d: string) => activeCount(d) === 0;
  const hasAnything = shownDays.some((d) => !dayIsEmpty(d));

  return (
    <div className="flex flex-col h-full">
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
              data-testid={`calendar-range-${key}`}
              onClick={() => {
                setRange(key);
                setPicked(null);
                // Jump the grid to the month the range lives in.
                const [y, m] = r.fromIso.split("-").map(Number);
                if (y && m) setView({ y, m: m - 1 });
              }}
              /* A SPAN still needs its hover — `This week` names no date.
                 A single-day chip does NOT: THE YEAR RULE (owner ruling
                 2026-08-15) put the full ruled date on the chip face, so a
                 hover could only ever repeat it or, worse, say less. */
              title={
                r.fromIso === r.toIso
                  ? undefined
                  : `${fmtDateShort(r.fromIso)} – ${fmtDateShort(r.toIso)}`
              }
              className={`flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-label font-semibold transition-colors ${
                active
                  ? "bg-base-900 text-white"
                  : "bg-white text-base-500 border border-base-200 hover:bg-hovertint"
              }`}
            >
              <span className="truncate">{rangeChipLabel(key, r.fromIso)}</span>
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
          const countTone =
            count === 0
              ? "text-transparent"
              : "bg-base-100 text-base-800";
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                setPicked(cell.key);
                setRange(null);
              }}
              title={count > 0 ? `${count} dated event${count === 1 ? "" : "s"}` : undefined}
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
          const dayReceive = receiveByDay.get(day) ?? [];
          // On a multi-day range an empty day is noise; on ONE day it is the
          // answer ("nothing that day") and must still be said out loud.
          if (shownDays.length > 1 && dayIsEmpty(day)) return null;
          const loads = carrierDayLoads(dayDeliveries, day, rulesByPartner);
          return (
            <div key={day} data-testid={`calendar-day-${day}`}>
              {/* The heading is the DAY, spelled the one ruled way. It used to
                  read `TODAY · 15 AUG 26`, and the relative half was the only
                  part an operator read — on the wrong morning it was a lie. */}
              <div className="text-label uppercase tracking-[0.05em] text-base-500 mb-2">
                {fmtDate(day)}
              </div>

              {dayIsEmpty(day) && shownDays.length === 1 && (
                <div className="text-meta text-base-400 text-center py-3">No dated events this day.</div>
              )}
              {dayReceive.length > 0 && (
                <DaySection
                  title="Receiving"
                  tone="text-success"
                  // `· ETA today` used to close this line. It was a banned
                  // word AND false: the row renders under whichever day it
                  // falls on, so on a multi-day range it said "today" about
                  // tomorrow. The day heading above already states the day.
                  items={dayReceive.map((r) => ({
                    key: `r-${r.poId}`,
                    main: `${r.poId} · ${supplierName(r.supplierId, null)}`,
                    sub: `${r.units} unit${r.units === 1 ? "" : "s"}`,
                  }))}
                />
              )}
              {dayDeliveries.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-label uppercase tracking-[0.05em] text-info">Deliveries</div>
                  {dayDeliveries.map((d) => <DeliveryRow key={d.orderId} d={d} />)}
                  {loads.map((l) => (
                    <CarrierLoadRow key={l.partnerId ?? "none"} load={l} />
                  ))}
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

function DaySection({
  title,
  tone,
  items,
}: {
  title: string;
  tone: string;
  items: Array<{ key: string; main: string; sub: string }>;
}) {
  return (
    <div className="mb-3">
      <div className={`text-label uppercase tracking-[0.05em] mb-1.5 ${tone}`}>{title}</div>
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
    </div>
  );
}
